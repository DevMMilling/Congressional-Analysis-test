from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.db import Base, get_db
from backend.app.main import app
from backend.app.models import AlertSubscription, Issuer, JobRun, MarketBar, Politician, Prediction, Signal, Trade


def test_system_status_endpoint_reports_freshness(tmp_path: Path):
    db_path = tmp_path / "status.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as db:
        politician = Politician(slug="jane-doe", full_name="Jane Doe", party="D", chamber="House", state="CA")
        issuer = Issuer(ticker="EXM", issuer_name="Example Corp", sector="Technology")
        db.add_all([politician, issuer])
        db.commit()
        db.refresh(politician)
        db.refresh(issuer)

        db.add(
            Trade(
                source_trade_id="trade-1",
                politician_id=politician.id,
                politician_name="Jane Doe",
                issuer_id=issuer.id,
                ticker="EXM",
                issuer_name="Example Corp",
                transaction_type="buy",
                transaction_date=date(2026, 1, 2),
                disclosure_date=date(2026, 1, 5),
                disclosure_lag_days=3,
            )
        )
        db.add(MarketBar(ticker="EXM", date=date(2026, 1, 6), issuer_id=issuer.id, close=101.5))
        db.add(Signal(signal_date=date(2026, 1, 6), signal_type="high_confidence", score=0.91, rationale="test"))
        db.add(AlertSubscription(email="alerts@example.com", enabled=True, minimum_confidence=0.7, signal_types=["high_confidence"]))
        db.add(
            JobRun(
                job_type="backfill",
                status="completed",
                started_at=datetime(2026, 1, 6, 9, 0, 0),
                finished_at=datetime(2026, 1, 6, 9, 5, 0),
                message="done",
            )
        )
        db.add(
            JobRun(
                job_type="incremental_update",
                status="completed",
                started_at=datetime(2026, 1, 7, 9, 0, 0),
                finished_at=datetime(2026, 1, 7, 9, 6, 0),
                message="done",
            )
        )
        db.add(
            Prediction(
                prediction_date=date(2026, 1, 7),
                model_name="trade_probability_model",
                entity_type="trade_event",
                entity_key="trade:1",
                score=0.81,
                confidence=0.81,
                created_at=datetime(2026, 1, 7, 9, 7, 0),
            )
        )
        db.commit()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            response = client.get("/api/system/status")
        assert response.status_code == 200
        payload = response.json()
        assert payload["latest_trade_disclosure_date"] == "2026-01-05"
        assert payload["latest_market_bar_date"] == "2026-01-06"
        assert payload["latest_completed_ingest_job"]["job_type"] == "incremental_update"
        assert payload["latest_completed_ingest_job"]["status"] == "completed"
        assert payload["latest_model_retrain_at"] == "2026-01-07T09:07:00"
        assert payload["signal_count"] == 1
        assert payload["subscription_count"] == 1
    finally:
        app.dependency_overrides.pop(get_db, None)
