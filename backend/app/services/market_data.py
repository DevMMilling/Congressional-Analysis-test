from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Issuer, MarketBar


settings = get_settings()
_YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"


def refresh_market_data(db: Session, tickers: list[str] | None = None) -> int:
    if tickers is None:
        tickers = [row[0] for row in db.execute(select(Issuer.ticker).where(Issuer.ticker.is_not(None))).all()]
    tickers = sorted({ticker for ticker in tickers if ticker})
    if settings.benchmark_ticker not in tickers:
        tickers.append(settings.benchmark_ticker)

    inserted = 0
    for ticker in tickers:
        try:
            history = _fetch_history_rows(ticker)
        except Exception:
            db.rollback()
            continue
        if not history:
            continue
        issuer = db.execute(select(Issuer).where(Issuer.ticker == ticker)).scalar_one_or_none()
        for row in history:
            bar_date = row["date"]
            existing = db.execute(select(MarketBar).where(MarketBar.ticker == ticker, MarketBar.date == bar_date)).scalar_one_or_none()
            if existing is None:
                existing = MarketBar(ticker=ticker, date=bar_date, issuer_id=issuer.id if issuer else None)
                inserted += 1
            existing.open = _clean_float(row.get("open"))
            existing.high = _clean_float(row.get("high"))
            existing.low = _clean_float(row.get("low"))
            existing.close = _clean_float(row.get("close"))
            existing.adj_close = _clean_float(row.get("adj_close"))
            existing.volume = _clean_float(row.get("volume"))
            db.add(existing)
        db.commit()
    return inserted


def _fetch_history_rows(ticker: str) -> list[dict]:
    symbol = _normalize_ticker_for_yahoo(ticker)
    response = httpx.get(
        _YAHOO_CHART_URL.format(symbol=symbol),
        params={"range": settings.yfinance_period, "interval": "1d", "includeAdjustedClose": "true"},
        headers={"User-Agent": settings.user_agent},
        timeout=30.0,
    )
    response.raise_for_status()

    payload = response.json().get("chart", {})
    result = payload.get("result") or []
    if not result:
        return []

    data = result[0]
    timestamps = data.get("timestamp") or []
    quote = ((data.get("indicators") or {}).get("quote") or [{}])[0]
    adjclose = ((data.get("indicators") or {}).get("adjclose") or [{}])[0].get("adjclose", [])

    rows = []
    for idx, timestamp in enumerate(timestamps):
        if timestamp is None:
            continue
        rows.append(
            {
                "date": datetime.fromtimestamp(timestamp, UTC).date(),
                "open": _value_at(quote.get("open"), idx),
                "high": _value_at(quote.get("high"), idx),
                "low": _value_at(quote.get("low"), idx),
                "close": _value_at(quote.get("close"), idx),
                "adj_close": _value_at(adjclose, idx),
                "volume": _value_at(quote.get("volume"), idx),
            }
        )
    return rows


def _normalize_ticker_for_yahoo(ticker: str) -> str:
    normalized = ticker.strip().upper()
    if normalized.startswith("$") and len(normalized) > 1:
        return f"{normalized[1:]}-USD"
    return normalized.replace("/", "-").replace(".", "-")


def _value_at(values: object, index: int) -> object | None:
    if not isinstance(values, list) or index >= len(values):
        return None
    return values[index]


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
