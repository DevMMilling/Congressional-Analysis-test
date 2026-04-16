from __future__ import annotations

import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Issuer, MarketBar


settings = get_settings()


def refresh_market_data(db: Session, tickers: list[str] | None = None) -> int:
    if tickers is None:
        tickers = [row[0] for row in db.execute(select(Issuer.ticker).where(Issuer.ticker.is_not(None))).all()]
    tickers = sorted({ticker for ticker in tickers if ticker})
    if settings.benchmark_ticker not in tickers:
        tickers.append(settings.benchmark_ticker)

    inserted = 0
    for ticker in tickers:
        history = yf.Ticker(ticker).history(period=settings.yfinance_period, auto_adjust=False)
        if history.empty:
            continue
        history = history.reset_index()
        issuer = db.execute(select(Issuer).where(Issuer.ticker == ticker)).scalar_one_or_none()
        for _, row in history.iterrows():
            bar_date = pd.Timestamp(row["Date"]).date()
            existing = db.execute(select(MarketBar).where(MarketBar.ticker == ticker, MarketBar.date == bar_date)).scalar_one_or_none()
            if existing is None:
                existing = MarketBar(ticker=ticker, date=bar_date, issuer_id=issuer.id if issuer else None)
                inserted += 1
            existing.open = _clean_float(row.get("Open"))
            existing.high = _clean_float(row.get("High"))
            existing.low = _clean_float(row.get("Low"))
            existing.close = _clean_float(row.get("Close"))
            existing.adj_close = _clean_float(row.get("Adj Close"))
            existing.volume = _clean_float(row.get("Volume"))
            db.add(existing)
        db.commit()
    return inserted


def _clean_float(value: object) -> float | None:
    try:
        if pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def enrich_issuer_metadata(db: Session, ticker: str) -> None:
    """Fetch sector/industry from yfinance and populate Issuer row if missing."""
    try:
        info = yf.Ticker(ticker).info
        sector = info.get("sector")
        industry = info.get("industry")
        if sector or industry:
            issuer = db.execute(select(Issuer).where(Issuer.ticker == ticker)).scalar_one_or_none()
            if issuer:
                if sector and not issuer.sector:
                    issuer.sector = sector
                if industry and not issuer.industry:
                    issuer.industry = industry
                db.commit()
    except Exception:
        pass
