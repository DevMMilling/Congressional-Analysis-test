from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Issuer, Politician, Trade
from ..schemas import PoliticianProfile, PoliticianSummary

router = APIRouter(tags=["politicians"])


@router.get("/politicians", response_model=list[PoliticianSummary])
def list_politicians(search: str | None = None, db: Session = Depends(get_db)) -> list[Politician]:
    query = select(Politician).order_by(Politician.full_name.asc())
    if search:
        query = query.where(Politician.full_name.ilike(f"%{search}%"))
    return list(db.execute(query.limit(100)).scalars().all())


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
