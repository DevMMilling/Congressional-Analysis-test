from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import AnalyticsSummary, BacktestResult, DashboardExplorerResponse
from ..services.analytics import build_analytics_summary, build_dashboard_explorer
from ..services.backtest import run_backtest

router = APIRouter(tags=["analytics"])


@router.get("/analytics/summary", response_model=AnalyticsSummary)
def get_summary(db: Session = Depends(get_db)) -> AnalyticsSummary:
    return build_analytics_summary(db)


@router.get("/analytics/explorer", response_model=DashboardExplorerResponse)
def get_dashboard_explorer(
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
    db: Session = Depends(get_db),
) -> DashboardExplorerResponse:
    return build_dashboard_explorer(
        db,
        politician_search=politician_search,
        ticker=ticker,
        party=party,
        chamber=chamber,
        state=state,
        transaction_type=transaction_type,
        owner_type=owner_type,
        sector=sector,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/backtest", response_model=BacktestResult)
def get_backtest(
    holding_days: int = 30,
    min_confidence: float = 0.65,
    signal_type: str | None = None,
    transaction_cost_bps: float = 10.0,
    db: Session = Depends(get_db),
) -> BacktestResult:
    return run_backtest(db, holding_days=holding_days, min_confidence=min_confidence, signal_type=signal_type, transaction_cost_bps=transaction_cost_bps)
