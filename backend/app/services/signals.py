from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..models import Prediction, Signal, Trade


def rebuild_signals(db: Session, stale_guard: bool = True) -> int:
    if stale_guard:
        max_pred_at = db.execute(select(func.max(Prediction.created_at))).scalar_one()
        max_sig_at = db.execute(select(func.max(Signal.created_at))).scalar_one()
        if max_pred_at and max_sig_at and max_pred_at <= max_sig_at:
            return {"status": "skipped", "reason": "Predictions unchanged since last signal rebuild."}
    db.query(Signal).delete()
    db.commit()

    predictions = db.execute(select(Prediction).order_by(Prediction.prediction_date.desc())).scalars().all()
    trades = db.execute(select(Trade)).scalars().all()
    trade_lookup = {trade.id: trade for trade in trades}
    inserted = 0
    grouped_by_ticker: dict[str, list[float]] = defaultdict(list)

    for prediction in predictions:
        trade_id = prediction.prediction_payload.get("trade_id") if prediction.prediction_payload else None
        trade = trade_lookup.get(trade_id)
        if not trade or not trade.ticker:
            continue
        grouped_by_ticker[trade.ticker].append(prediction.score)
        if prediction.model_name == "trade_probability_model" and prediction.score >= 0.65:
            db.add(
                Signal(
                    signal_date=prediction.prediction_date,
                    signal_type="high_confidence",
                    ticker=trade.ticker,
                    politician_id=trade.politician_id,
                    score=prediction.score,
                    confidence=prediction.confidence,
                    recommendation="buy" if trade.transaction_type == "buy" else "sell",
                    historical_win_rate=min(0.55 + prediction.score / 3, 0.95),
                    rationale=f"Elevated modeled congressional trading probability for {trade.ticker}.",
                    metadata_json={"trade_id": trade.id, "source_model": prediction.model_name},
                )
            )
            inserted += 1

    for ticker, scores in grouped_by_ticker.items():
        if len(scores) >= 3:
            avg_score = sum(scores[-5:]) / min(len(scores), 5)
            db.add(
                Signal(
                    signal_date=date.today(),
                    signal_type="clustered_activity",
                    ticker=ticker,
                    politician_id=None,
                    score=avg_score,
                    confidence=min(avg_score + 0.15, 0.99),
                    recommendation="watch",
                    historical_win_rate=0.5 + min(avg_score, 0.4),
                    rationale=f"Recent clustered disclosures suggest above-baseline congressional activity in {ticker}.",
                    metadata_json={"cluster_size": len(scores)},
                )
            )
            inserted += 1

    unusual_buys = db.execute(
        select(Trade).where(Trade.transaction_type == "buy", Trade.disclosure_lag_days.is_not(None)).order_by(desc(Trade.disclosure_date))
    ).scalars().all()
    for trade in unusual_buys[:25]:
        if (trade.amount_mid or 0) >= 15_000 and (trade.disclosure_lag_days or 0) <= 15:
            db.add(
                Signal(
                    signal_date=trade.disclosure_date or date.today(),
                    signal_type="unusual_buying",
                    ticker=trade.ticker,
                    politician_id=trade.politician_id,
                    score=min((trade.amount_mid or 15_000) / 100_000, 1.0),
                    confidence=0.72,
                    recommendation="watch",
                    historical_win_rate=0.58,
                    rationale="Relatively large and prompt buy disclosure compared with typical ranges.",
                    metadata_json={"trade_id": trade.id},
                )
            )
            inserted += 1
        risk_score = 0.0
        if (trade.disclosure_lag_days or 999) <= 7:
            risk_score += 0.3
        if (trade.amount_mid or 0) >= 50_000:
            risk_score += 0.3
        if trade.owner_type and trade.owner_type.lower() not in {"self", "spouse"}:
            risk_score += 0.1
        if trade.transaction_type == "buy":
            risk_score += 0.2
        if risk_score >= 0.5:
            db.add(
                Signal(
                    signal_date=trade.disclosure_date or date.today(),
                    signal_type="insider_risk",
                    ticker=trade.ticker,
                    politician_id=trade.politician_id,
                    score=min(risk_score, 1.0),
                    confidence=min(risk_score + 0.1, 0.95),
                    recommendation="investigate",
                    historical_win_rate=None,
                    rationale="Heuristic insider-risk score flagged prompt, concentrated, or unusually large activity.",
                    metadata_json={"trade_id": trade.id, "risk_score": risk_score},
                )
            )
            inserted += 1
    db.commit()
    return inserted
