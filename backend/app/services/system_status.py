from __future__ import annotations

import json
from datetime import date, datetime, time
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AlertSubscription, JobRun, MarketBar, Prediction, Signal, Trade
from ..schemas import JobRunResponse, SystemStatusResponse


settings = get_settings()
_INGEST_JOB_TYPES = {"backfill", "incremental_update"}


def build_system_status(db: Session) -> SystemStatusResponse:
    latest_trade_disclosure_date = db.execute(select(func.max(Trade.disclosure_date))).scalar_one()
    latest_market_bar_date = db.execute(select(func.max(MarketBar.date))).scalar_one()
    latest_completed_ingest_job = _latest_completed_ingest_job(db)
    latest_model_retrain_at = _latest_model_retrain_at(db)
    signal_count = db.query(Signal).count()
    subscription_count = db.query(AlertSubscription).count()

    return SystemStatusResponse(
        latest_trade_disclosure_date=latest_trade_disclosure_date,
        latest_market_bar_date=latest_market_bar_date,
        latest_completed_ingest_job=JobRunResponse.model_validate(latest_completed_ingest_job) if latest_completed_ingest_job else None,
        latest_model_retrain_at=latest_model_retrain_at,
        signal_count=signal_count,
        subscription_count=subscription_count,
    )


def _latest_completed_ingest_job(db: Session) -> JobRun | None:
    return (
        db.execute(
            select(JobRun)
            .where(JobRun.status == "completed", JobRun.job_type.in_(_INGEST_JOB_TYPES))
            .order_by(JobRun.finished_at.desc().nullslast(), JobRun.created_at.desc())
        )
        .scalars()
        .first()
    )


def _latest_model_retrain_at(db: Session) -> datetime | None:
    latest_prediction_at = db.execute(select(func.max(Prediction.created_at))).scalar_one()
    if latest_prediction_at is not None:
        return latest_prediction_at

    report_path = Path(settings.model_dir) / "model_report.json"
    if not report_path.exists():
        return None

    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

    trained_at = report.get("trained_at")
    if not trained_at:
        return None

    try:
        parsed = datetime.fromisoformat(trained_at)
    except ValueError:
        try:
            parsed_date = date.fromisoformat(trained_at)
        except ValueError:
            return None
        return datetime.combine(parsed_date, time.min)

    return parsed if parsed.tzinfo else parsed.replace(tzinfo=None)
