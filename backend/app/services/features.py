from __future__ import annotations

from datetime import timedelta

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import FeatureSnapshot, Issuer, MarketBar, Politician, Trade
from ..utils import safe_pct_change


def rebuild_feature_snapshots(db: Session, forward_window_days: int = 30) -> int:
    trades = db.execute(select(Trade).where(Trade.ticker.is_not(None), Trade.disclosure_date.is_not(None))).scalars().all()
    if not trades:
        return 0

    if db.query(FeatureSnapshot).count():
        db.query(FeatureSnapshot).delete()
        db.commit()

    inserted = 0
    ticker_trade_counts: dict[str, int] = {}
    politician_trade_counts: dict[int, int] = {}

    for trade in sorted(trades, key=lambda row: row.disclosure_date or row.transaction_date):
        if not trade.ticker or not trade.disclosure_date:
            continue
        ticker_trade_counts[trade.ticker] = ticker_trade_counts.get(trade.ticker, 0) + 1
        politician_trade_counts[trade.politician_id] = politician_trade_counts.get(trade.politician_id, 0) + 1

        future_trade_exists = db.execute(
            select(Trade.id).where(
                Trade.ticker == trade.ticker,
                Trade.disclosure_date > trade.disclosure_date,
                Trade.disclosure_date <= trade.disclosure_date + timedelta(days=forward_window_days),
            )
        ).first() is not None
        returns = disclosure_forward_return(db, trade.ticker, trade.disclosure_date, forward_window_days)
        issuer = db.execute(select(Issuer).where(Issuer.id == trade.issuer_id)).scalar_one_or_none()
        politician = db.execute(select(Politician).where(Politician.id == trade.politician_id)).scalar_one_or_none()

        db.add(
            FeatureSnapshot(
                snapshot_date=trade.disclosure_date,
                entity_type="trade_event",
                entity_key=f"trade:{trade.id}",
                feature_set="trade_event_v1",
                features={
                    "trade_id": trade.id,
                    "ticker": trade.ticker,
                    "politician_id": trade.politician_id,
                    "transaction_type": 1 if trade.transaction_type == "buy" else -1,
                    "disclosure_lag_days": trade.disclosure_lag_days or 0,
                    "amount_mid": trade.amount_mid or 0.0,
                    "ticker_trade_frequency": ticker_trade_counts.get(trade.ticker, 0),
                    "politician_trade_frequency": politician_trade_counts.get(trade.politician_id, 0),
                    "sector": issuer.sector if issuer else None,
                    "party": politician.party if politician else None,
                    "chamber": politician.chamber if politician else None,
                    "target_trade_probability": 1.0 if future_trade_exists else 0.0,
                },
                target=returns,
            )
        )
        inserted += 1
    db.commit()
    return inserted


def disclosure_forward_return(db: Session, ticker: str, disclosure_date, forward_window_days: int = 30) -> float | None:
    start_bar = db.execute(
        select(MarketBar).where(MarketBar.ticker == ticker, MarketBar.date >= disclosure_date).order_by(MarketBar.date.asc())
    ).scalar_one_or_none()
    end_bar = db.execute(
        select(MarketBar)
        .where(MarketBar.ticker == ticker, MarketBar.date >= disclosure_date + timedelta(days=forward_window_days))
        .order_by(MarketBar.date.asc())
    ).scalar_one_or_none()
    if start_bar is None or end_bar is None:
        return None
    return safe_pct_change(start_bar.close, end_bar.close)


def feature_frame(db: Session) -> pd.DataFrame:
    snapshots = db.execute(select(FeatureSnapshot).where(FeatureSnapshot.feature_set == "trade_event_v1")).scalars().all()
    if not snapshots:
        return pd.DataFrame()
    rows = []
    for snapshot in snapshots:
        row = {"snapshot_id": snapshot.id, "snapshot_date": snapshot.snapshot_date, "target": snapshot.target}
        row.update(snapshot.features)
        rows.append(row)
    return pd.DataFrame(rows)
