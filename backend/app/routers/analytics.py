from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import AnalyticsSummary, BacktestResult
from ..services.analytics import build_analytics_summary
from ..services.backtest import run_backtest

router = APIRouter(tags=["analytics"])


@router.get("/analytics/summary", response_model=AnalyticsSummary)
def get_summary(db: Session = Depends(get_db)) -> AnalyticsSummary:
    return build_analytics_summary(db)


@router.get("/backtest", response_model=BacktestResult)
def get_backtest(
    holding_days: int = 30,
    min_confidence: float = 0.65,
    signal_type: str | None = None,
    transaction_cost_bps: float = 10.0,
    db: Session = Depends(get_db),
) -> BacktestResult:
    return run_backtest(db, holding_days=holding_days, min_confidence=min_confidence, signal_type=signal_type, transaction_cost_bps=transaction_cost_bps)
