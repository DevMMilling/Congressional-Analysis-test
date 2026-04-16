from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.exports import export_backtest_ledger_csv, export_signals_csv, export_trades_csv

router = APIRouter(tags=["exports"])


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exports/trades.csv")
def download_trades_csv(
    ticker: str | None = None,
    politician_id: int | None = None,
    transaction_type: str | None = None,
    chamber: str | None = None,
    party: str | None = None,
    state: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> Response:
    export = export_trades_csv(
        db,
        ticker=ticker,
        politician_id=politician_id,
        transaction_type=transaction_type,
        chamber=chamber,
        party=party,
        state=state,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    return _csv_response(export.content, export.filename)


@router.get("/exports/signals.csv")
def download_signals_csv(
    ticker: str | None = None,
    politician_id: int | None = None,
    signal_type: str | None = None,
    recommendation: str | None = None,
    min_confidence: float | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> Response:
    export = export_signals_csv(
        db,
        ticker=ticker,
        politician_id=politician_id,
        signal_type=signal_type,
        recommendation=recommendation,
        min_confidence=min_confidence,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    return _csv_response(export.content, export.filename)


@router.get("/exports/backtest-ledger.csv")
def download_backtest_ledger_csv(
    holding_days: int = Query(30, ge=1, le=3650),
    min_confidence: float = Query(0.65, ge=0.0, le=1.0),
    signal_type: str | None = None,
    transaction_cost_bps: float = Query(10.0, ge=0.0, le=1000.0),
    db: Session = Depends(get_db),
) -> Response:
    export = export_backtest_ledger_csv(
        db,
        holding_days=holding_days,
        min_confidence=min_confidence,
        signal_type=signal_type,
        transaction_cost_bps=transaction_cost_bps,
    )
    return _csv_response(export.content, export.filename)
