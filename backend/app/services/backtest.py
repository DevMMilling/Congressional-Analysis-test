from __future__ import annotations

import math
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import MarketBar, Signal
from ..schemas import BacktestResult
from ..utils import drawdown, safe_pct_change


def run_backtest(
    db: Session,
    holding_days: int = 30,
    min_confidence: float = 0.65,
    signal_type: str | None = None,
    transaction_cost_bps: float = 10.0,
) -> BacktestResult:
    query = select(Signal).where(Signal.confidence.is_not(None), Signal.confidence >= min_confidence)
    if signal_type:
        query = query.where(Signal.signal_type == signal_type)
    signals = db.execute(query.order_by(Signal.signal_date.asc())).scalars().all()

    ledger = []
    curve = []
    cumulative = 1.0
    benchmark_cumulative = 1.0
    returns = []

    for signal in signals:
        if not signal.ticker:
            continue
        entry = db.execute(
            select(MarketBar)
            .where(MarketBar.ticker == signal.ticker, MarketBar.date >= signal.signal_date)
            .order_by(MarketBar.date.asc())
        ).scalars().first()
        exit_bar = db.execute(
            select(MarketBar)
            .where(MarketBar.ticker == signal.ticker, MarketBar.date >= signal.signal_date + timedelta(days=holding_days))
            .order_by(MarketBar.date.asc())
        ).scalars().first()
        benchmark_entry = db.execute(
            select(MarketBar).where(MarketBar.ticker == "SPY", MarketBar.date >= signal.signal_date).order_by(MarketBar.date.asc())
        ).scalars().first()
        benchmark_exit = db.execute(
            select(MarketBar)
            .where(MarketBar.ticker == "SPY", MarketBar.date >= signal.signal_date + timedelta(days=holding_days))
            .order_by(MarketBar.date.asc())
        ).scalars().first()
        if not entry or not exit_bar:
            continue

        gross = safe_pct_change(entry.close, exit_bar.close) or 0.0
        if signal.recommendation == "sell":
            gross = -gross
        net = gross - transaction_cost_bps / 10_000
        bench = safe_pct_change(benchmark_entry.close if benchmark_entry else None, benchmark_exit.close if benchmark_exit else None) or 0.0

        cumulative *= 1 + net
        benchmark_cumulative *= 1 + bench
        returns.append(net)
        ledger.append({"signal_id": signal.id, "ticker": signal.ticker, "signal_date": signal.signal_date.isoformat(), "recommendation": signal.recommendation, "return": net, "benchmark_return": bench})
        curve.append({"date": signal.signal_date.isoformat(), "portfolio": cumulative - 1, "benchmark": benchmark_cumulative - 1})

    mean_return = sum(returns) / len(returns) if returns else 0.0
    variance = sum((value - mean_return) ** 2 for value in returns) / len(returns) if returns else 0.0
    sharpe_like = mean_return / max(variance**0.5, 1e-9) if returns else 0.0

    _sample_variance = (
        sum((r - mean_return) ** 2 for r in returns) / max(len(returns) - 1, 1)
        if len(returns) > 1
        else 0.0
    )
    annualized_volatility = math.sqrt(_sample_variance) * math.sqrt(252) if _sample_variance else 0.0

    return BacktestResult(
        period_start=signals[0].signal_date if signals else None,
        period_end=signals[-1].signal_date if signals else None,
        cumulative_return=cumulative - 1,
        benchmark_return=benchmark_cumulative - 1,
        hit_rate=sum(1 for value in returns if value > 0) / len(returns) if returns else 0.0,
        max_drawdown=drawdown([1 + point["portfolio"] for point in curve]),
        trade_count=len(ledger),
        sharpe_like=sharpe_like,
        annualized_volatility=annualized_volatility,
        daily_curve=curve,
        trade_ledger=ledger,
    )
