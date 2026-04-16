from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import JobRun


def create_job(db: Session, job_type: str, message: str | None = None) -> JobRun:
    job = JobRun(job_type=job_type, status="queued", message=message or "")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def mark_job_running(db: Session, job: JobRun, details: dict | None = None) -> JobRun:
    job.status = "running"
    job.started_at = datetime.utcnow()
    job.details = details or {}
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def mark_job_finished(db: Session, job: JobRun, message: str, details: dict | None = None) -> JobRun:
    job.status = "completed"
    job.finished_at = datetime.utcnow()
    job.message = message
    job.details = details or job.details
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def mark_job_failed(db: Session, job: JobRun, message: str) -> JobRun:
    job.status = "failed"
    job.finished_at = datetime.utcnow()
    job.message = message
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
