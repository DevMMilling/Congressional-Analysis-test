from __future__ import annotations

import json
import csv
from dataclasses import dataclass
from datetime import date
from io import StringIO

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from ..models import Issuer, Politician, Signal, Trade
from .backtest import run_backtest


@dataclass(slots=True)
class CSVExport:
    filename: str
    content: str


def _to_csv(rows: list[dict], fieldnames: list[str]) -> str:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: _stringify(value) for key, value in row.items()})
    return buffer.getvalue()


def _stringify(value: object) -> str | int | float | None:
    if value is None:
        return None
    if isinstance(value, (date,)):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str, sort_keys=True)
    return value


def export_trades_csv(
    db: Session,
    *,
    ticker: str | None = None,
    politician_id: int | None = None,
    transaction_type: str | None = None,
    chamber: str | None = None,
    party: str | None = None,
    state: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 1000,
) -> CSVExport:
    query: Select = select(Trade, Issuer.sector).outerjoin(Issuer, Trade.issuer_id == Issuer.id).order_by(
        Trade.disclosure_date.desc().nullslast(),
        Trade.id.desc(),
    )
    if ticker:
        query = query.where(Trade.ticker == ticker.upper())
    if politician_id is not None:
        query = query.where(Trade.politician_id == politician_id)
    if transaction_type:
        query = query.where(Trade.transaction_type == transaction_type.lower())
    if chamber:
        query = query.where(Trade.chamber == chamber)
    if party:
        query = query.where(Trade.party == party)
    if state:
        query = query.where(Trade.state == state.upper())
    if date_from:
        query = query.where(Trade.disclosure_date >= date_from)
    if date_to:
        query = query.where(Trade.disclosure_date <= date_to)

    rows = []
    for trade, sector in db.execute(query.limit(limit)).all():
        rows.append(
            {
                "id": trade.id,
                "source_trade_id": trade.source_trade_id,
                "politician_id": trade.politician_id,
                "politician_name": trade.politician_name,
                "ticker": trade.ticker,
                "issuer_name": trade.issuer_name,
                "sector": sector,
                "transaction_type": trade.transaction_type,
                "owner_type": trade.owner_type,
                "transaction_date": trade.transaction_date,
                "disclosure_date": trade.disclosure_date,
                "disclosure_lag_days": trade.disclosure_lag_days,
                "amount_text": trade.amount_text,
                "amount_low": trade.amount_low,
                "amount_high": trade.amount_high,
                "amount_mid": trade.amount_mid,
                "price_at_trade": trade.price_at_trade,
                "chamber": trade.chamber,
                "party": trade.party,
                "state": trade.state,
                "notes": trade.notes,
            }
        )

    fieldnames = [
        "id",
        "source_trade_id",
        "politician_id",
        "politician_name",
        "ticker",
        "issuer_name",
        "sector",
        "transaction_type",
        "owner_type",
        "transaction_date",
        "disclosure_date",
        "disclosure_lag_days",
        "amount_text",
        "amount_low",
        "amount_high",
        "amount_mid",
        "price_at_trade",
        "chamber",
        "party",
        "state",
        "notes",
    ]
    return CSVExport(filename="trades.csv", content=_to_csv(rows, fieldnames))


def export_signals_csv(
    db: Session,
    *,
    ticker: str | None = None,
    politician_id: int | None = None,
    signal_type: str | None = None,
    recommendation: str | None = None,
    min_confidence: float | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 1000,
) -> CSVExport:
    query: Select = select(Signal, Politician.full_name).outerjoin(Politician, Signal.politician_id == Politician.id).order_by(
        Signal.signal_date.desc(),
        Signal.score.desc(),
    )
    if ticker:
        query = query.where(Signal.ticker == ticker.upper())
    if politician_id is not None:
        query = query.where(Signal.politician_id == politician_id)
    if signal_type:
        query = query.where(Signal.signal_type == signal_type)
    if recommendation:
        query = query.where(Signal.recommendation == recommendation)
    if min_confidence is not None:
        query = query.where(Signal.confidence.is_not(None), Signal.confidence >= min_confidence)
    if date_from:
        query = query.where(Signal.signal_date >= date_from)
    if date_to:
        query = query.where(Signal.signal_date <= date_to)

    rows = []
    for signal, politician_name in db.execute(query.limit(limit)).all():
        rows.append(
            {
                "id": signal.id,
                "signal_date": signal.signal_date,
                "signal_type": signal.signal_type,
                "ticker": signal.ticker,
                "politician_id": signal.politician_id,
                "politician_name": politician_name,
                "score": signal.score,
                "confidence": signal.confidence,
                "recommendation": signal.recommendation,
                "historical_win_rate": signal.historical_win_rate,
                "rationale": signal.rationale,
                "metadata_json": signal.metadata_json,
            }
        )

    fieldnames = [
        "id",
        "signal_date",
        "signal_type",
        "ticker",
        "politician_id",
        "politician_name",
        "score",
        "confidence",
        "recommendation",
        "historical_win_rate",
        "rationale",
        "metadata_json",
    ]
    return CSVExport(filename="signals.csv", content=_to_csv(rows, fieldnames))


def export_backtest_ledger_csv(
    db: Session,
    *,
    holding_days: int = 30,
    min_confidence: float = 0.65,
    signal_type: str | None = None,
    transaction_cost_bps: float = 10.0,
) -> CSVExport:
    result = run_backtest(
        db,
        holding_days=holding_days,
        min_confidence=min_confidence,
        signal_type=signal_type,
        transaction_cost_bps=transaction_cost_bps,
    )

    rows = []
    for entry in result.trade_ledger:
        rows.append(
            {
                "signal_id": entry.get("signal_id"),
                "signal_date": entry.get("signal_date"),
                "ticker": entry.get("ticker"),
                "recommendation": entry.get("recommendation"),
                "return": entry.get("return"),
                "benchmark_return": entry.get("benchmark_return"),
                "period_start": result.period_start,
                "period_end": result.period_end,
                "cumulative_return": result.cumulative_return,
                "benchmark_return_total": result.benchmark_return,
                "hit_rate": result.hit_rate,
                "max_drawdown": result.max_drawdown,
                "sharpe_like": result.sharpe_like,
                "trade_count": result.trade_count,
                "holding_days": holding_days,
                "transaction_cost_bps": transaction_cost_bps,
            }
        )

    fieldnames = [
        "signal_id",
        "signal_date",
        "ticker",
        "recommendation",
        "return",
        "benchmark_return",
        "period_start",
        "period_end",
        "cumulative_return",
        "benchmark_return_total",
        "hit_rate",
        "max_drawdown",
        "sharpe_like",
        "trade_count",
        "holding_days",
        "transaction_cost_bps",
    ]
    return CSVExport(filename="backtest-ledger.csv", content=_to_csv(rows, fieldnames))
