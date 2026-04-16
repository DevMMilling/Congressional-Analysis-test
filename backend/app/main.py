from __future__ import annotations

from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .bootstrap import bootstrap_database, ensure_default_records
from .config import get_settings, validate_settings
from .db import SessionLocal
from .routers import alerts, analytics, exports, ingest, models, politicians, signals, stocks, system_status, trades
from .services.alerts import dispatch_alerts


settings = get_settings()
scheduler = BackgroundScheduler(timezone=settings.scheduler_timezone)


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap_database()
    validate_settings(settings)
    with SessionLocal() as db:
        ensure_default_records(db)
    if not scheduler.running:
        scheduler.add_job(_scheduled_alert_dispatch, "cron", hour=8, minute=0, id="alert_dispatch", replace_existing=True)
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


def _scheduled_alert_dispatch() -> None:
    with SessionLocal() as db:
        dispatch_alerts(db)


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in [
    ingest.router,
    politicians.router,
    stocks.router,
    trades.router,
    signals.router,
    analytics.router,
    alerts.router,
    models.router,
    exports.router,
    system_status.router,
]:
    app.include_router(router, prefix=settings.api_prefix)


@app.get("/")
def root() -> dict:
    return {"message": settings.app_name, "api_prefix": settings.api_prefix}
