from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Signal
from ..schemas import SignalResponse

router = APIRouter(tags=["signals"])


@router.get("/signals", response_model=list[SignalResponse])
def list_signals(
    ticker: str | None = None,
    politician_id: int | None = None,
    signal_type: str | None = None,
    min_confidence: float | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[SignalResponse]:
    query = select(Signal).order_by(Signal.signal_date.desc(), Signal.score.desc())
    if ticker:
        query = query.where(Signal.ticker == ticker.upper())
    if politician_id:
        query = query.where(Signal.politician_id == politician_id)
    if signal_type:
        query = query.where(Signal.signal_type == signal_type)
    if min_confidence is not None:
        query = query.where(Signal.confidence.is_not(None), Signal.confidence >= min_confidence)
    return list(db.execute(query.limit(limit)).scalars().all())


@router.get("/signals/top", response_model=list[SignalResponse])
def top_signals(limit: int = 20, db: Session = Depends(get_db)) -> list[SignalResponse]:
    query = select(Signal).order_by(Signal.confidence.desc().nullslast(), Signal.score.desc()).limit(limit)
    return list(db.execute(query).scalars().all())
