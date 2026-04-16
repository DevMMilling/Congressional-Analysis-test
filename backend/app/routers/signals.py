from fastapi import APIRouter, Depends, Response
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Signal
from ..query_utils import ListParams, apply_paging, pagination_params, set_paging_headers
from ..schemas import SignalExplainabilityResponse, SignalResponse
from ..services.research import build_signal_explainability

router = APIRouter(tags=["signals"])


@router.get("/signals", response_model=list[SignalResponse])
def list_signals(
    response: Response,
    ticker: str | None = None,
    politician_id: int | None = None,
    signal_type: str | None = None,
    recommendation: str | None = None,
    min_confidence: float | None = None,
    params: ListParams = Depends(pagination_params),
    db: Session = Depends(get_db),
) -> list[SignalResponse]:
    query = select(Signal)
    if ticker:
        query = query.where(Signal.ticker == ticker.upper())
    if politician_id:
        query = query.where(Signal.politician_id == politician_id)
    if signal_type:
        query = query.where(Signal.signal_type == signal_type)
    if recommendation:
        query = query.where(Signal.recommendation == recommendation)
    if min_confidence is not None:
        query = query.where(Signal.confidence.is_not(None), Signal.confidence >= min_confidence)
    sort_map = {
        "signal_date": Signal.signal_date,
        "score": Signal.score,
        "confidence": Signal.confidence,
        "ticker": Signal.ticker,
        "signal_type": Signal.signal_type,
    }
    sort_column = sort_map.get(params.sort or "signal_date", Signal.signal_date)
    ordered = sort_column.asc().nullslast() if params.order == "asc" else desc(sort_column).nullslast()
    query = query.order_by(ordered, Signal.score.desc(), Signal.id.desc())
    set_paging_headers(response, db, query, params)
    paged = apply_paging(query, params)
    return list(db.execute(paged).scalars().all())


@router.get("/signals/summary")
def signals_summary(db: Session = Depends(get_db)) -> dict:
    """Return total signal count and per-type breakdown with avg confidence and win rate."""
    total = db.execute(select(func.count(Signal.id))).scalar_one() or 0
    rows = db.execute(
        select(
            Signal.signal_type,
            func.count(Signal.id).label("count"),
            func.avg(Signal.confidence).label("avg_confidence"),
            func.avg(Signal.historical_win_rate).label("avg_win_rate"),
        ).group_by(Signal.signal_type).order_by(func.count(Signal.id).desc())
    ).all()
    by_type = [
        {
            "signal_type": row.signal_type,
            "count": row.count,
            "avg_confidence": round(row.avg_confidence, 4) if row.avg_confidence is not None else None,
            "avg_win_rate": round(row.avg_win_rate, 4) if row.avg_win_rate is not None else None,
        }
        for row in rows
    ]
    return {"total_signals": total, "by_type": by_type}


@router.get("/signals/top", response_model=list[SignalResponse])
def top_signals(limit: int = 20, db: Session = Depends(get_db)) -> list[SignalResponse]:
    query = select(Signal).order_by(Signal.confidence.desc().nullslast(), Signal.score.desc()).limit(limit)
    return list(db.execute(query).scalars().all())


@router.get("/signals/{signal_id}/explain", response_model=SignalExplainabilityResponse)
def explain_signal(signal_id: int, db: Session = Depends(get_db)) -> SignalExplainabilityResponse:
    return build_signal_explainability(db, signal_id)
