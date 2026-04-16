from __future__ import annotations

from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Issuer, Politician, Signal, Trade
from ..schemas import AnalyticsSummary, SummaryMetric
from .backtest import run_backtest


def build_analytics_summary(db: Session) -> AnalyticsSummary:
    trade_count = db.query(Trade).count()
    politician_count = db.query(Politician).count()
    issuer_count = db.query(Issuer).count()
    signal_count = db.query(Signal).count()

    top_traders = [
        {"politician": row[0], "trade_count": row[1]}
        for row in db.execute(
            select(Trade.politician_name, func.count(Trade.id)).group_by(Trade.politician_name).order_by(func.count(Trade.id).desc()).limit(10)
        ).all()
    ]
    top_stocks = [
        {"ticker": row[0], "trade_count": row[1]}
        for row in db.execute(select(Trade.ticker, func.count(Trade.id)).where(Trade.ticker.is_not(None)).group_by(Trade.ticker).order_by(func.count(Trade.id).desc()).limit(10)).all()
    ]

    sector_counter: Counter[str] = Counter()
    for row in db.execute(select(Issuer.sector, func.count(Trade.id)).join(Trade, Trade.issuer_id == Issuer.id).group_by(Issuer.sector)).all():
        sector_counter[row[0] or "Unknown"] += row[1]

    lag_distribution = [
        {"bucket": "0-7", "count": db.query(Trade).filter(Trade.disclosure_lag_days.between(0, 7)).count()},
        {"bucket": "8-30", "count": db.query(Trade).filter(Trade.disclosure_lag_days.between(8, 30)).count()},
        {"bucket": "31-60", "count": db.query(Trade).filter(Trade.disclosure_lag_days.between(31, 60)).count()},
        {"bucket": "61+", "count": db.query(Trade).filter(Trade.disclosure_lag_days >= 61).count()},
    ]

    backtest = run_backtest(db)
    return AnalyticsSummary(
        metrics=[
            SummaryMetric(label="Trades", value=trade_count),
            SummaryMetric(label="Politicians", value=politician_count),
            SummaryMetric(label="Tickers", value=issuer_count),
            SummaryMetric(label="Signals", value=signal_count),
        ],
        top_traders=top_traders,
        top_stocks=top_stocks,
        sector_heatmap=[{"sector": key, "count": value} for key, value in sector_counter.most_common(12)],
        lag_distribution=lag_distribution,
        prediction_counter={
            "cumulative_return": backtest.cumulative_return,
            "benchmark_return": backtest.benchmark_return,
            "hit_rate": backtest.hit_rate,
            "trade_count": backtest.trade_count,
        },
    )
