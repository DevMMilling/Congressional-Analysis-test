from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Issuer, Politician, Signal, Trade
from ..schemas import (
    AnalyticsSummary,
    DashboardBreakdownPoint,
    DashboardExplorerResponse,
    DashboardFilterOptions,
    DashboardHeadlineMetrics,
    DashboardTimelinePoint,
    SummaryMetric,
    TradeEvent,
)
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


def build_dashboard_explorer(
    db: Session,
    *,
    politician_search: str | None = None,
    ticker: str | None = None,
    party: str | None = None,
    chamber: str | None = None,
    state: str | None = None,
    transaction_type: str | None = None,
    owner_type: str | None = None,
    sector: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> DashboardExplorerResponse:
    available_filters = DashboardFilterOptions(
        parties=_distinct_trade_values(db, Trade.party),
        chambers=_distinct_trade_values(db, Trade.chamber),
        states=_distinct_trade_values(db, Trade.state),
        transaction_types=_distinct_trade_values(db, Trade.transaction_type),
        owner_types=_distinct_trade_values(db, Trade.owner_type),
        sectors=_distinct_issuer_sectors(db),
    )

    query = (
        select(Trade, Issuer.sector)
        .outerjoin(Issuer, Trade.issuer_id == Issuer.id)
        .where(Trade.ticker.is_not(None))
        .where(Trade.ticker != "")
    )
    if politician_search:
        query = query.where(Trade.politician_name.ilike(f"%{politician_search.strip()}%"))
    if ticker:
        query = query.where(Trade.ticker.ilike(f"%{ticker.strip().upper()}%"))
    if party:
        query = query.where(Trade.party == party)
    if chamber:
        query = query.where(Trade.chamber == chamber)
    if state:
        query = query.where(Trade.state == state.upper())
    if transaction_type:
        query = query.where(Trade.transaction_type == transaction_type.lower())
    if owner_type:
        query = query.where(Trade.owner_type == owner_type)
    if sector:
        query = query.where(Issuer.sector == sector)
    if date_from:
        query = query.where(Trade.disclosure_date >= date_from)
    if date_to:
        query = query.where(Trade.disclosure_date <= date_to)

    rows = db.execute(query.order_by(Trade.disclosure_date.desc().nullslast(), Trade.id.desc())).all()
    trades = [row[0] for row in rows]
    sector_lookup = {row[0].id: row[1] or "Unknown" for row in rows}

    buy_count = sum(1 for trade in trades if trade.transaction_type == "buy")
    sell_count = sum(1 for trade in trades if trade.transaction_type == "sell")
    lag_values = [trade.disclosure_lag_days for trade in trades if trade.disclosure_lag_days is not None]
    prompt_count = sum(1 for lag in lag_values if lag <= 30)
    prompt_ratio = (prompt_count / len(lag_values)) if lag_values else 0.0

    timeline_buckets: dict[date, dict[str, int]] = defaultdict(lambda: {"trades": 0, "buys": 0, "sells": 0})
    amount_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "buy_count": 0, "sell_count": 0})
    chamber_party_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "buy_count": 0, "sell_count": 0})
    owner_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "buy_count": 0, "sell_count": 0})
    sector_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "buy_count": 0, "sell_count": 0})
    politician_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "buy_count": 0, "sell_count": 0})
    ticker_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "buy_count": 0, "sell_count": 0})

    for trade in trades:
        effective_date = trade.disclosure_date or trade.transaction_date
        if effective_date:
            bucket = timeline_buckets[effective_date]
            bucket["trades"] += 1
            if trade.transaction_type == "buy":
                bucket["buys"] += 1
            elif trade.transaction_type == "sell":
                bucket["sells"] += 1

        amount_label = _amount_bucket_label(trade.amount_mid, trade.amount_text)
        chamber_party_label = " / ".join(filter(None, [trade.chamber or "Unknown chamber", trade.party or "Unknown party"]))
        owner_label = trade.owner_type or "Unknown"
        sector_label = sector_lookup.get(trade.id, "Unknown")
        politician_label = trade.politician_name or "Unknown"
        _bump_breakdown(amount_counts, amount_label, trade.transaction_type)
        _bump_breakdown(chamber_party_counts, chamber_party_label, trade.transaction_type)
        _bump_breakdown(owner_counts, owner_label, trade.transaction_type)
        _bump_breakdown(sector_counts, sector_label, trade.transaction_type)
        _bump_breakdown(politician_counts, politician_label, trade.transaction_type)
        _bump_breakdown(ticker_counts, trade.ticker, trade.transaction_type)

    lag_distribution = [
        DashboardBreakdownPoint(label="0-7 days", count=sum(1 for lag in lag_values if 0 <= lag <= 7)),
        DashboardBreakdownPoint(label="8-30 days", count=sum(1 for lag in lag_values if 8 <= lag <= 30)),
        DashboardBreakdownPoint(label="31-60 days", count=sum(1 for lag in lag_values if 31 <= lag <= 60)),
        DashboardBreakdownPoint(label="61+ days", count=sum(1 for lag in lag_values if lag >= 61)),
    ]

    return DashboardExplorerResponse(
        available_filters=available_filters,
        headline_metrics=DashboardHeadlineMetrics(
            total_trades=len(trades),
            buy_count=buy_count,
            sell_count=sell_count,
            unique_politicians=len({trade.politician_id for trade in trades}),
            unique_tickers=len({trade.ticker for trade in trades if trade.ticker}),
            average_lag_days=round(sum(lag_values) / len(lag_values), 1) if lag_values else None,
            prompt_disclosure_ratio=round(prompt_ratio, 3),
        ),
        timeline=[
            DashboardTimelinePoint(date=timeline_date, **values)
            for timeline_date, values in sorted(timeline_buckets.items())
        ],
        lag_distribution=lag_distribution,
        amount_distribution=_sorted_breakdown(amount_counts, preferred_order=[
            "Undisclosed",
            "< 1K",
            "1K-15K",
            "15K-50K",
            "50K-100K",
            "100K-250K",
            "250K-500K",
            "500K-1M",
            "1M+",
        ]),
        chamber_party_breakdown=_sorted_breakdown(chamber_party_counts),
        owner_breakdown=_sorted_breakdown(owner_counts),
        sector_breakdown=_sorted_breakdown(sector_counts, limit=12),
        top_politicians=_sorted_breakdown(politician_counts, limit=12),
        top_tickers=_sorted_breakdown(ticker_counts, limit=12),
        recent_disclosures=[TradeEvent.model_validate(trade) for trade in trades[:12]],
    )


def _distinct_trade_values(db: Session, column) -> list[str]:
    values = db.execute(select(column).where(column.is_not(None)).distinct().order_by(column.asc())).scalars().all()
    return [value for value in values if value]


def _distinct_issuer_sectors(db: Session) -> list[str]:
    values = db.execute(
        select(Issuer.sector).where(Issuer.sector.is_not(None)).distinct().order_by(Issuer.sector.asc())
    ).scalars().all()
    return [value for value in values if value]


def _bump_breakdown(target: dict[str, dict[str, int]], label: str, transaction_type: str | None) -> None:
    bucket = target[label]
    bucket["count"] += 1
    if transaction_type == "buy":
        bucket["buy_count"] += 1
    elif transaction_type == "sell":
        bucket["sell_count"] += 1


def _sorted_breakdown(
    values: dict[str, dict[str, int]],
    *,
    limit: int | None = None,
    preferred_order: list[str] | None = None,
) -> list[DashboardBreakdownPoint]:
    items = [
        DashboardBreakdownPoint(label=label, count=data["count"], buy_count=data["buy_count"], sell_count=data["sell_count"])
        for label, data in values.items()
    ]
    if preferred_order:
        order_index = {label: idx for idx, label in enumerate(preferred_order)}
        items.sort(key=lambda item: (order_index.get(item.label, len(order_index) + 1), -item.count, item.label))
    else:
        items.sort(key=lambda item: (-item.count, item.label))
    return items[:limit] if limit else items


def _amount_bucket_label(amount_mid: float | None, amount_text: str | None) -> str:
    if amount_mid is None:
        return "Undisclosed" if not amount_text or amount_text.lower() == "undisclosed" else amount_text
    if amount_mid < 1_000:
        return "< 1K"
    if amount_mid < 15_000:
        return "1K-15K"
    if amount_mid < 50_000:
        return "15K-50K"
    if amount_mid < 100_000:
        return "50K-100K"
    if amount_mid < 250_000:
        return "100K-250K"
    if amount_mid < 500_000:
        return "250K-500K"
    if amount_mid < 1_000_000:
        return "500K-1M"
    return "1M+"
