from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Trade
from ..schemas import TradeEvent

router = APIRouter(tags=["trades"])


@router.get("/trades", response_model=list[TradeEvent])
def list_trades(
    ticker: str | None = None,
    politician_id: int | None = None,
    transaction_type: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[TradeEvent]:
    query = select(Trade).order_by(Trade.disclosure_date.desc())
    if ticker:
        query = query.where(Trade.ticker == ticker.upper())
    if politician_id:
        query = query.where(Trade.politician_id == politician_id)
    if transaction_type:
        query = query.where(Trade.transaction_type == transaction_type.lower())
    return [TradeEvent.model_validate(row) for row in db.execute(query.limit(limit)).scalars().all()]
