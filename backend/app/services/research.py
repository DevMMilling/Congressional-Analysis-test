from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..models import FeatureSnapshot, Issuer, JobRun, Politician, Prediction, RawTradePayload, Signal, Trade
from ..schemas import (
    BacktestComparisonRequest,
    BacktestComparisonResponse,
    BacktestScenarioResult,
    PoliticianActivityResponse,
    PoliticianActivitySummary,
    PoliticianComparisonEntry,
    PoliticianComparisonResponse,
    PoliticianProfile,
    PoliticianSummary,
    ResearchReportRequest,
    ResearchReportResponse,
    SignalExplainabilityResponse,
    SignalResponse,
    StockComparisonResponse,
    StockComparisonSeries,
    TickerProfile,
    TradeDetailResponse,
    TradeEvent,
)
from .analytics import build_analytics_summary
from .backtest import run_backtest
from .stocks import build_stock_history_response, build_ticker_profile


def list_jobs(db: Session, limit: int = 50) -> list[JobRun]:
    return list(
        db.execute(select(JobRun).order_by(JobRun.created_at.desc(), JobRun.id.desc()).limit(limit)).scalars().all()
    )


def build_trade_detail(db: Session, trade_id: int) -> TradeDetailResponse:
    trade = (
        db.execute(
            select(Trade)
            .options(selectinload(Trade.politician).selectinload(Politician.roles), selectinload(Trade.issuer))
            .where(Trade.id == trade_id)
        )
        .scalars()
        .first()
    )
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")

    raw_payload = None
    if trade.raw_payload_id:
        raw = db.get(RawTradePayload, trade.raw_payload_id)
        raw_payload = raw.payload if raw else None

    politician = trade.politician
    issuer = trade.issuer
    return TradeDetailResponse(
        **TradeEvent.model_validate(trade).model_dump(),
        raw_payload=raw_payload,
        issuer_sector=issuer.sector if issuer else None,
        issuer_industry=issuer.industry if issuer else None,
        issuer_exchange=issuer.exchange if issuer else None,
        politician_slug=politician.slug if politician else None,
        politician_party=politician.party if politician else None,
        politician_chamber=politician.chamber if politician else None,
        politician_state=politician.state if politician else None,
        politician_roles=[role for role in (politician.roles if politician else [])],
    )


def build_politician_activity(
    db: Session,
    politician_id: int,
    *,
    trade_limit: int = 25,
    signal_limit: int = 25,
) -> PoliticianActivityResponse:
    politician = (
        db.execute(select(Politician).options(selectinload(Politician.roles)).where(Politician.id == politician_id))
        .scalars()
        .first()
    )
    if politician is None:
        raise HTTPException(status_code=404, detail="Politician not found")

    trades = list(
        db.execute(
            select(Trade).where(Trade.politician_id == politician_id).order_by(Trade.disclosure_date.desc().nullslast(), Trade.id.desc()).limit(trade_limit)
        ).scalars().all()
    )
    signals = list(
        db.execute(
            select(Signal).where(Signal.politician_id == politician_id).order_by(Signal.signal_date.desc(), Signal.id.desc()).limit(signal_limit)
        ).scalars().all()
    )

    buy_count = sum(1 for trade in trades if trade.transaction_type == "buy")
    sell_count = sum(1 for trade in trades if trade.transaction_type == "sell")
    avg_lag = sum((trade.disclosure_lag_days or 0) for trade in trades) / len(trades) if trades else None
    lag_distribution = [
        {"bucket": "0-7", "count": sum(1 for trade in trades if trade.disclosure_lag_days is not None and 0 <= trade.disclosure_lag_days <= 7)},
        {"bucket": "8-30", "count": sum(1 for trade in trades if trade.disclosure_lag_days is not None and 8 <= trade.disclosure_lag_days <= 30)},
        {"bucket": "31-60", "count": sum(1 for trade in trades if trade.disclosure_lag_days is not None and 31 <= trade.disclosure_lag_days <= 60)},
        {"bucket": "61+", "count": sum(1 for trade in trades if trade.disclosure_lag_days is not None and trade.disclosure_lag_days >= 61)},
    ]

    sector_counts: dict[str, int] = {}
    issuer_ids = {trade.issuer_id for trade in trades if trade.issuer_id}
    issuers = {
        issuer.id: issuer
        for issuer in db.execute(select(Issuer).where(Issuer.id.in_(issuer_ids))).scalars().all()
    } if issuer_ids else {}
    for trade in trades:
        issuer = issuers.get(trade.issuer_id)
        sector = issuer.sector if issuer and issuer.sector else "Unknown"
        sector_counts[sector] = sector_counts.get(sector, 0) + 1

    summary = PoliticianActivitySummary(
        trade_count=len(trades),
        signal_count=len(signals),
        buy_count=buy_count,
        sell_count=sell_count,
        average_disclosure_lag=avg_lag,
        lag_distribution=[{"bucket": key["bucket"], "count": key["count"]} for key in lag_distribution],
        sector_exposure=[{"sector": sector, "count": count} for sector, count in sorted(sector_counts.items(), key=lambda item: item[1], reverse=True)],
    )

    return PoliticianActivityResponse(
        politician=PoliticianSummary.model_validate(politician),
        summary=summary,
        trades=[TradeEvent.model_validate(trade) for trade in trades],
        signals=[SignalResponse.model_validate(signal) for signal in signals],
    )


def build_stock_comparison(
    db: Session,
    *,
    tickers: list[str],
    days: int = 180,
    include_trades: bool = True,
) -> StockComparisonResponse:
    unique_tickers = []
    for ticker in tickers:
        upper = ticker.upper()
        if upper and upper not in unique_tickers:
            unique_tickers.append(upper)
    unique_tickers = unique_tickers[:3]

    series = []
    for ticker in unique_tickers:
        history = build_stock_history_response(db, ticker=ticker, days=days, include_trades=include_trades)
        series.append(
            StockComparisonSeries(
                ticker=history.ticker,
                issuer_name=history.issuer_name,
                sector=history.sector,
                latest_close=history.latest_close,
                change_pct=history.change_pct,
                history=history.history,
                trade_markers=history.trade_markers,
            )
        )

    return StockComparisonResponse(tickers=unique_tickers, series=series)


def build_signal_explainability(db: Session, signal_id: int) -> SignalExplainabilityResponse:
    signal = db.get(Signal, signal_id)
    if signal is None:
        raise HTTPException(status_code=404, detail="Signal not found")

    linked_trade = None
    linked_prediction = None
    linked_feature_snapshot = None
    related_predictions = []
    trade_id = signal.metadata_json.get("trade_id") if signal.metadata_json else None

    if trade_id:
        trade = db.get(Trade, trade_id)
        linked_trade = TradeEvent.model_validate(trade) if trade else None

    predictions_query = select(Prediction).where(Prediction.prediction_date == signal.signal_date).order_by(Prediction.created_at.desc(), Prediction.id.desc())
    if signal.ticker:
        predictions_query = predictions_query.where(Prediction.prediction_payload.is_not(None))
    predictions = list(db.execute(predictions_query).scalars().all())
    predictions.sort(
        key=lambda prediction: (
            0 if prediction.model_name == "trade_probability_model" else 1,
            0 if (prediction.prediction_payload or {}).get("trade_id") == trade_id else 1,
            prediction.id,
        )
    )
    for prediction in predictions:
        payload = prediction.prediction_payload or {}
        if linked_prediction is None and trade_id and payload.get("trade_id") == trade_id:
            linked_prediction = {
                "id": prediction.id,
                "model_name": prediction.model_name,
                "entity_type": prediction.entity_type,
                "entity_key": prediction.entity_key,
                "score": prediction.score,
                "confidence": prediction.confidence,
                "prediction_payload": payload,
                "created_at": prediction.created_at,
            }
            snapshot_id = payload.get("feature_snapshot_id")
            if snapshot_id:
                snapshot = db.get(FeatureSnapshot, snapshot_id)
                if snapshot:
                    linked_feature_snapshot = {
                        "id": snapshot.id,
                        "snapshot_date": snapshot.snapshot_date,
                        "entity_key": snapshot.entity_key,
                        "feature_set": snapshot.feature_set,
                        "features": snapshot.features,
                        "target": snapshot.target,
                    }
        related_predictions.append(
            {
                "id": prediction.id,
                "model_name": prediction.model_name,
                "entity_type": prediction.entity_type,
                "entity_key": prediction.entity_key,
                "score": prediction.score,
                "confidence": prediction.confidence,
                "prediction_payload": payload,
                "created_at": prediction.created_at,
            }
        )

    return SignalExplainabilityResponse(
        signal=SignalResponse.model_validate(signal),
        linked_trade=linked_trade,
        linked_prediction=linked_prediction,
        linked_feature_snapshot=linked_feature_snapshot,
        related_predictions=related_predictions,
    )


def compare_backtests(db: Session, payload: BacktestComparisonRequest) -> BacktestComparisonResponse:
    results = []
    for scenario in payload.scenarios:
        results.append(
            BacktestScenarioResult(
                label=scenario.label,
                result=run_backtest(
                    db,
                    holding_days=scenario.holding_days,
                    min_confidence=scenario.min_confidence,
                    signal_type=scenario.signal_type,
                    transaction_cost_bps=scenario.transaction_cost_bps,
                ),
            )
        )
    return BacktestComparisonResponse(scenarios=results)


def build_research_report(db: Session, payload: ResearchReportRequest) -> ResearchReportResponse:
    politician = build_politician_profile(db, payload.politician_id) if payload.politician_id else None
    stock = build_ticker_profile(db, payload.ticker) if payload.ticker else None

    trades_query = select(Trade).order_by(Trade.disclosure_date.desc().nullslast(), Trade.id.desc())
    signals_query = select(Signal).order_by(Signal.signal_date.desc(), Signal.id.desc())
    if payload.politician_id:
        trades_query = trades_query.where(Trade.politician_id == payload.politician_id)
        signals_query = signals_query.where(Signal.politician_id == payload.politician_id)
    if payload.ticker:
        trades_query = trades_query.where(Trade.ticker == payload.ticker.upper())
        signals_query = signals_query.where(Signal.ticker == payload.ticker.upper())
    if payload.signal_type:
        signals_query = signals_query.where(Signal.signal_type == payload.signal_type)
    if payload.min_confidence is not None:
        signals_query = signals_query.where(Signal.confidence.is_not(None), Signal.confidence >= payload.min_confidence)

    trades = list(db.execute(trades_query.limit(payload.trade_limit)).scalars().all())
    signals = list(db.execute(signals_query.limit(payload.signal_limit)).scalars().all())
    backtest = None
    if payload.include_backtest:
        query = payload.backtest or None
        backtest = run_backtest(
            db,
            holding_days=query.holding_days if query else 30,
            min_confidence=query.min_confidence if query else payload.min_confidence or 0.65,
            signal_type=query.signal_type if query else payload.signal_type,
            transaction_cost_bps=query.transaction_cost_bps if query else 10.0,
        )

    return ResearchReportResponse(
        generated_at=datetime.utcnow(),
        filters=payload.model_dump(),
        summary=build_analytics_summary(db),
        politician=politician,
        stock=stock,
        trades=[TradeEvent.model_validate(trade) for trade in trades],
        signals=[SignalResponse.model_validate(signal) for signal in signals],
        backtest=backtest,
    )


def build_politician_profile(db: Session, politician_id: int) -> PoliticianProfile:
    politician = (
        db.execute(select(Politician).options(selectinload(Politician.roles)).where(Politician.id == politician_id))
        .scalars()
        .first()
    )
    if politician is None:
        raise HTTPException(status_code=404, detail="Politician not found")
    trades = list(db.execute(select(Trade).where(Trade.politician_id == politician_id)).scalars().all())
    buy_count = sum(1 for trade in trades if trade.transaction_type == "buy")
    sell_count = sum(1 for trade in trades if trade.transaction_type == "sell")
    avg_lag = sum((trade.disclosure_lag_days or 0) for trade in trades) / len(trades) if trades else None
    issuer_ids = {trade.issuer_id for trade in trades if trade.issuer_id}
    sector_counts = {}
    if issuer_ids:
        for issuer in db.execute(select(Issuer).where(Issuer.id.in_(issuer_ids))).scalars().all():
            sector_counts[issuer.id] = issuer.sector or "Unknown"
    sector_summary = {}
    for trade in trades:
        sector = sector_counts.get(trade.issuer_id, "Unknown")
        sector_summary[sector] = sector_summary.get(sector, 0) + 1

    return PoliticianProfile(
        id=politician.id,
        full_name=politician.full_name,
        party=politician.party,
        chamber=politician.chamber,
        state=politician.state,
        bioguide_id=politician.bioguide_id,
        district=politician.district,
        roles=politician.roles,
        trade_count=len(trades),
        buy_count=buy_count,
        sell_count=sell_count,
        average_disclosure_lag=avg_lag,
        most_traded_sectors=[sector for sector, _ in sorted(sector_summary.items(), key=lambda item: item[1], reverse=True)[:5]],
        insider_risk_summary={
            "prompt_disclosure_ratio": round(sum(1 for trade in trades if (trade.disclosure_lag_days or 999) <= 15) / len(trades), 3)
            if trades
            else 0.0
        },
    )


def compare_politicians(db: Session, politician_ids: list[int]) -> PoliticianComparisonResponse:
    """Return side-by-side stats for a list of politician IDs."""
    from collections import Counter
    entries = []
    for pid in politician_ids:
        politician = db.execute(select(Politician).where(Politician.id == pid)).scalar_one_or_none()
        if not politician:
            continue
        trades = db.execute(select(Trade).where(Trade.politician_id == pid)).scalars().all()
        buy_count = sum(1 for t in trades if (t.transaction_type or "").lower() == "buy")
        sell_count = sum(1 for t in trades if (t.transaction_type or "").lower() == "sell")
        lags = [t.disclosure_lag_days for t in trades if t.disclosure_lag_days is not None]
        avg_lag = round(sum(lags) / len(lags), 1) if lags else None
        risk_count = sum(1 for t in trades if (t.disclosure_lag_days or 999) <= 15)
        insider_risk_ratio = round(risk_count / max(len(trades), 1), 3)
        signal_count = db.execute(
            select(func.count(Signal.id)).where(Signal.politician_id == pid)
        ).scalar_one() or 0
        entries.append(PoliticianComparisonEntry(
            politician_id=pid,
            name=getattr(politician, "full_name", None) or getattr(politician, "name", None) or f"Politician {pid}",
            party=politician.party,
            chamber=politician.chamber,
            trade_count=len(trades),
            buy_count=buy_count,
            sell_count=sell_count,
            average_disclosure_lag=avg_lag,
            top_sectors=[],
            signal_count=signal_count,
            insider_risk_ratio=insider_risk_ratio,
        ))
    return PoliticianComparisonResponse(entries=entries)
