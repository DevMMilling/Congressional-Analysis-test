from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Issuer, Politician, Trade
from ..query_utils import ListParams, apply_paging, pagination_params, set_paging_headers
from ..schemas import PoliticianActivityResponse, PoliticianComparisonResponse, PoliticianProfile, PoliticianSummary, SignalResponse, TradeEvent
from ..services.research import build_politician_activity, compare_politicians

router = APIRouter(tags=["politicians"])


@router.get("/politicians", response_model=list[PoliticianSummary])
def list_politicians(
    response: Response,
    search: str | None = None,
    chamber: str | None = None,
    party: str | None = None,
    state: str | None = None,
    params: ListParams = Depends(pagination_params),
    db: Session = Depends(get_db),
) -> list[Politician]:
    query = select(Politician)
    if search:
        query = query.where(Politician.full_name.ilike(f"%{search}%"))
    if chamber:
        query = query.where(Politician.chamber == chamber)
    if party:
        query = query.where(Politician.party == party)
    if state:
        query = query.where(Politician.state == state.upper())
    sort_map = {
        "full_name": Politician.full_name,
        "party": Politician.party,
        "chamber": Politician.chamber,
        "state": Politician.state,
    }
    sort_column = sort_map.get(params.sort or "full_name", Politician.full_name)
    ordered = sort_column.asc().nullslast() if params.order == "asc" else desc(sort_column).nullslast()
    query = query.order_by(ordered, Politician.id.desc())
    set_paging_headers(response, db, query, params)
    paged = apply_paging(query, params)
    return list(db.execute(paged).scalars().all())


@router.get("/politicians/compare", response_model=PoliticianComparisonResponse)
def compare_politicians_endpoint(
    ids: str = Query(..., description="Comma-separated list of politician IDs"),
    db: Session = Depends(get_db),
) -> PoliticianComparisonResponse:
    try:
        politician_ids = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="ids must be a comma-separated list of integers")
    if not politician_ids:
        raise HTTPException(status_code=422, detail="At least one politician ID is required")
    return compare_politicians(db, politician_ids)


@router.get("/politicians/{politician_id}", response_model=PoliticianProfile)
def get_politician(politician_id: int, db: Session = Depends(get_db)) -> PoliticianProfile:
    politician = db.execute(select(Politician).options(selectinload(Politician.roles)).where(Politician.id == politician_id)).scalar_one_or_none()
    if politician is None:
        raise HTTPException(status_code=404, detail="Politician not found")
    trades = db.execute(select(Trade).where(Trade.politician_id == politician_id)).scalars().all()
    sector_counts: Counter[str] = Counter()
    for trade in trades:
        issuer = db.execute(select(Issuer).where(Issuer.id == trade.issuer_id)).scalar_one_or_none()
        sector_counts[issuer.sector if issuer and issuer.sector else "Unknown"] += 1
    buy_count = sum(1 for trade in trades if trade.transaction_type == "buy")
    sell_count = sum(1 for trade in trades if trade.transaction_type == "sell")
    avg_lag = sum((trade.disclosure_lag_days or 0) for trade in trades) / len(trades) if trades else None
    return PoliticianProfile(
        id=politician.id,
        full_name=politician.full_name,
        party=politician.party,
        chamber=politician.chamber,
        state=politician.state,
        bioguide_id=politician.bioguide_id,
        district=politician.district,
        roles=politician.roles,
        trade_count=len(trades),
        buy_count=buy_count,
        sell_count=sell_count,
        average_disclosure_lag=avg_lag,
        most_traded_sectors=[sector for sector, _ in sector_counts.most_common(5)],
        insider_risk_summary={"prompt_disclosure_ratio": round(sum(1 for trade in trades if (trade.disclosure_lag_days or 999) <= 15) / len(trades), 3) if trades else 0.0},
    )


@router.get("/politicians/{politician_id}/trades", response_model=PoliticianActivityResponse)
def get_politician_trades(
    politician_id: int,
    trade_limit: int = Query(25, ge=1, le=200),
    signal_limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> PoliticianActivityResponse:
    return build_politician_activity(db, politician_id, trade_limit=trade_limit, signal_limit=signal_limit)


@router.get("/politicians/{politician_id}/signals", response_model=list[SignalResponse])
def get_politician_signals(
    politician_id: int,
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[SignalResponse]:
    activity = build_politician_activity(db, politician_id, trade_limit=1, signal_limit=limit)
    return activity.signals
