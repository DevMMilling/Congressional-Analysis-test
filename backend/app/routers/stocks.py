from bisect import bisect_right

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Issuer, MarketBar, Prediction, Signal, Trade
from ..schemas import (
    PriceHistoryPoint,
    TickerPriceHistoryResponse,
    TickerProfile,
    TickerSummary,
    TradeEvent,
    TradeMarker,
)

router = APIRouter(tags=["stocks"])


@router.get("/stocks", response_model=list[TickerSummary])
def list_stocks(search: str | None = None, db: Session = Depends(get_db)) -> list[TickerSummary]:
    query = select(Issuer).order_by(Issuer.ticker.asc())
    if search:
        query = query.where(Issuer.ticker.ilike(f"%{search}%") | Issuer.issuer_name.ilike(f"%{search}%"))
    issuers = db.execute(query.limit(100)).scalars().all()
    return [TickerSummary(ticker=issuer.ticker, issuer_name=issuer.issuer_name, sector=issuer.sector) for issuer in issuers]


@router.get("/stocks/{ticker}", response_model=TickerProfile)
def get_stock(ticker: str, db: Session = Depends(get_db)) -> TickerProfile:
    issuer = db.execute(select(Issuer).where(Issuer.ticker == ticker.upper())).scalar_one_or_none()
    if issuer is None:
        raise HTTPException(status_code=404, detail="Ticker not found")
    trades = db.execute(select(Trade).where(Trade.ticker == issuer.ticker).order_by(Trade.disclosure_date.desc())).scalars().all()
    signals = db.execute(select(Signal).where(Signal.ticker == issuer.ticker).order_by(Signal.signal_date.desc()).limit(10)).scalars().all()
    trade_ids = {trade.id for trade in trades}
    predictions = [
        prediction
        for prediction in db.execute(select(Prediction).order_by(Prediction.prediction_date.desc())).scalars().all()
        if prediction.prediction_payload and prediction.prediction_payload.get("trade_id") in trade_ids
    ][:10]
    return TickerProfile(
        ticker=issuer.ticker,
        issuer_name=issuer.issuer_name,
        sector=issuer.sector,
        trade_count=len(trades),
        politician_count=len({trade.politician_id for trade in trades}),
        buy_count=sum(1 for trade in trades if trade.transaction_type == "buy"),
        sell_count=sum(1 for trade in trades if trade.transaction_type == "sell"),
        latest_signals=signals,
        recent_trades=[TradeEvent.model_validate(trade) for trade in trades[:15]],
        model_scores={prediction.model_name: prediction.score for prediction in predictions},
    )


@router.get("/stocks/{ticker}/history", response_model=TickerPriceHistoryResponse)
def get_stock_history(
    ticker: str,
    days: int = 180,
    include_trades: bool = True,
    db: Session = Depends(get_db),
) -> TickerPriceHistoryResponse:
    issuer = db.execute(select(Issuer).where(Issuer.ticker == ticker.upper())).scalar_one_or_none()
    if issuer is None:
        raise HTTPException(status_code=404, detail="Ticker not found")

    bars = (
        db.execute(select(MarketBar).where(MarketBar.ticker == issuer.ticker).order_by(MarketBar.date.desc()).limit(days))
        .scalars()
        .all()
    )
    bars = list(reversed(bars))
    history = [PriceHistoryPoint.model_validate(bar) for bar in bars]

    latest_close = history[-1].close if history else None
    previous_close = history[-2].close if len(history) > 1 else None
    change = None
    change_pct = None
    if latest_close is not None and previous_close is not None:
        change = latest_close - previous_close
        if previous_close != 0:
            change_pct = change / previous_close

    trade_markers: list[TradeMarker] = []
    if include_trades and bars:
        bar_dates = [bar.date for bar in bars]
        price_lookup = {bar.date: (bar.close if bar.close is not None else bar.adj_close) for bar in bars}
        trades = (
            db.execute(
                select(Trade)
                .where(Trade.ticker == issuer.ticker)
                .order_by(Trade.disclosure_date.desc(), Trade.transaction_date.desc())
                .limit(25)
            )
            .scalars()
            .all()
        )
        for trade in trades:
            marker_date = trade.transaction_date or trade.disclosure_date
            if marker_date is None:
                continue
            position = bisect_right(bar_dates, marker_date)
            if position == 0:
                continue
            effective_date = bar_dates[position - 1]
            marker_price = trade.price_at_trade if trade.price_at_trade is not None else price_lookup.get(effective_date)
            if marker_price is None:
                continue
            trade_markers.append(
                TradeMarker(
                    id=trade.id,
                    date=effective_date,
                    price=marker_price,
                    label=f"{trade.politician_name} {trade.transaction_type}",
                    politician_name=trade.politician_name,
                    transaction_type=trade.transaction_type,
                    transaction_date=trade.transaction_date,
                    disclosure_date=trade.disclosure_date,
                    amount_text=trade.amount_text,
                    disclosure_lag_days=trade.disclosure_lag_days,
                )
            )
            if len(trade_markers) >= 8:
                break

    return TickerPriceHistoryResponse(
        ticker=issuer.ticker,
        issuer_name=issuer.issuer_name,
        sector=issuer.sector,
        history=history,
        trade_markers=trade_markers,
        latest_close=latest_close,
        previous_close=previous_close,
        change=change,
        change_pct=change_pct,
    )
