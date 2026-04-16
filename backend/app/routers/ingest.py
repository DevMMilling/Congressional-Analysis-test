from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import JobRun
from ..schemas import JobRunResponse
from ..services.features import rebuild_feature_snapshots
from ..services.ingest import CapitolTradesScraper, CongressMetadataImporter, upsert_trade
from ..services.jobs import create_job, mark_job_failed, mark_job_finished, mark_job_running
from ..services.market_data import enrich_issuer_metadata, refresh_market_data
from ..services.modeling import retrain_models
from ..services.signals import rebuild_signals

router = APIRouter(tags=["ingest"])


@router.post("/ingest/backfill", response_model=JobRunResponse)
def backfill(page_count: int = 3, db: Session = Depends(get_db)) -> JobRun:
    job = create_job(db, "backfill", message="Starting historical backfill.")
    mark_job_running(db, job, details={"page_count": page_count})
    scraper = CapitolTradesScraper()
    try:
        metadata = CongressMetadataImporter().sync_remote_metadata(db)
        inserted = 0
        for page in range(1, page_count + 1):
            for trade in scraper.scrape_page(page):
                upsert_trade(db, trade)
                inserted += 1
        refresh_market_data(db)
        rebuild_feature_snapshots(db)
        retrain_models(db)
        rebuild_signals(db)
        return mark_job_finished(
            db,
            job,
            f"Backfill complete: {inserted} trades processed.",
            details={"trades_processed": inserted, **metadata},
        )
    except Exception as exc:
        return mark_job_failed(db, job, str(exc))


@router.post("/ingest/update", response_model=JobRunResponse)
def incremental_update(db: Session = Depends(get_db)) -> JobRun:
    job = create_job(db, "incremental_update", message="Refreshing latest trade and market data.")
    mark_job_running(db, job)
    scraper = CapitolTradesScraper()
    try:
        metadata = CongressMetadataImporter().sync_remote_metadata(db)
        inserted = 0
        for trade in scraper.scrape_page(page=1):
            upsert_trade(db, trade)
            inserted += 1
        refresh_market_data(db)
        rebuild_feature_snapshots(db)
        retrain_models(db)
        rebuild_signals(db)
        return mark_job_finished(
            db,
            job,
            f"Incremental update complete: {inserted} rows processed.",
            details={"trades_processed": inserted, **metadata},
        )
    except Exception as exc:
        return mark_job_failed(db, job, str(exc))


@router.post("/ingest/enrich-sectors", response_model=JobRunResponse)
def enrich_sectors(db: Session = Depends(get_db)) -> JobRun:
    """Fetch sector/industry from yfinance for every issuer that is missing it."""
    from sqlalchemy import select as sa_select
    from ..models import Issuer as IssuerModel
    job = create_job(db, "enrich_sectors", message="Enriching issuer sector metadata via yfinance.")
    mark_job_running(db, job)
    try:
        tickers = [
            row[0]
            for row in db.execute(
                sa_select(IssuerModel.ticker).where(
                    IssuerModel.ticker.is_not(None),
                    (IssuerModel.sector.is_(None)) | (IssuerModel.sector == ""),
                )
            ).all()
        ]
        enriched = 0
        for ticker in tickers:
            enrich_issuer_metadata(db, ticker)
            enriched += 1
        return mark_job_finished(
            db, job,
            f"Sector enrichment complete: {enriched} tickers processed.",
            details={"tickers_processed": enriched},
        )
    except Exception as exc:
        return mark_job_failed(db, job, str(exc))


@router.get("/jobs/{job_id}", response_model=JobRunResponse)
def get_job(job_id: int, db: Session = Depends(get_db)) -> JobRun:
    job = db.get(JobRun, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
