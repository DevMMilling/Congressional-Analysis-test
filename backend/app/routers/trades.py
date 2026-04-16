from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Trade
from ..query_utils import ListParams, apply_paging, pagination_params, set_paging_headers
from ..schemas import TradeDetailResponse, TradeEvent
from ..services.research import build_trade_detail

router = APIRouter(tags=["trades"])


@router.get("/trades", response_model=list[TradeEvent])
def list_trades(
    response: Response,
    ticker: str | None = None,
    politician_id: int | None = None,
    transaction_type: str | None = None,
    chamber: str | None = None,
    party: str | None = None,
    state: str | None = None,
    date_from: date | None = Query(None, description="Filter trades on or after this disclosure date"),
    date_to: date | None = Query(None, description="Filter trades on or before this disclosure date"),
    params: ListParams = Depends(pagination_params),
    db: Session = Depends(get_db),
) -> list[TradeEvent]:
    query = select(Trade)
    if ticker:
        query = query.where(Trade.ticker == ticker.upper())
    if politician_id:
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

    sort_map = {
        "disclosure_date": Trade.disclosure_date,
        "transaction_date": Trade.transaction_date,
        "amount_mid": Trade.amount_mid,
        "ticker": Trade.ticker,
        "politician_name": Trade.politician_name,
    }
    sort_column = sort_map.get(params.sort or "disclosure_date", Trade.disclosure_date)
    ordered = sort_column.asc().nullslast() if params.order == "asc" else desc(sort_column).nullslast()
    query = query.order_by(ordered, Trade.id.desc())
    set_paging_headers(response, db, query, params)
    paged = apply_paging(query, params)
    return [TradeEvent.model_validate(row) for row in db.execute(paged).scalars().all()]


@router.get("/trades/{trade_id}", response_model=TradeDetailResponse)
def get_trade(trade_id: int, db: Session = Depends(get_db)) -> TradeDetailResponse:
    return build_trade_detail(db, trade_id)
