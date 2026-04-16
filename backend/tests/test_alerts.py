from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db import Base, get_db
from backend.app.models import AlertHistory, AlertSubscription, Signal
from backend.app.routers.alerts import router as alerts_router
from backend.app.services import alerts as alerts_service


def _build_test_client(session: Session) -> TestClient:
    app = FastAPI()
    app.include_router(alerts_router, prefix="/api")

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _create_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, future=True)
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    return engine, testing_session


def test_create_subscription_keeps_working():
    engine, session = _create_session()
    client = _build_test_client(session)

    try:
        response = client.post(
            "/api/alerts/subscriptions",
            json={
                "email": "trader@example.com",
                "enabled": True,
                "minimum_confidence": 0.7,
                "signal_types": ["high_confidence", "unusual_buying"],
            },
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["email"] == "trader@example.com"
        assert payload["enabled"] is True
        assert payload["signal_types"] == ["high_confidence", "unusual_buying"]
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_alert_history_listing_includes_related_metadata():
    engine, session = _create_session()
    client = _build_test_client(session)

    try:
        subscription = AlertSubscription(
            email="alerts@example.com",
            enabled=True,
            minimum_confidence=0.5,
            signal_types=["high_confidence"],
        )
        signal = Signal(
            signal_date=date(2026, 4, 14),
            signal_type="high_confidence",
            ticker="AAPL",
            politician_id=None,
            score=0.91,
            confidence=0.91,
            rationale="Example signal",
            recommendation="buy",
            historical_win_rate=0.62,
            metadata_json={"trade_id": 1},
        )
        session.add_all([subscription, signal])
        session.commit()

        processed = alerts_service.dispatch_alerts(session)
        assert processed == 1

        response = client.get("/api/alerts/history")
        assert response.status_code == 200
        history = response.json()
        assert len(history) == 1
        assert history[0]["subscription_email"] == "alerts@example.com"
        assert history[0]["signal_type"] == "high_confidence"
        assert history[0]["ticker"] == "AAPL"
        assert history[0]["status"] == "smtp_disabled"
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_test_dispatch_handles_smtp_disabled(monkeypatch):
    engine, session = _create_session()
    client = _build_test_client(session)

    monkeypatch.setattr(alerts_service.settings, "smtp_enabled", False)
    monkeypatch.setattr(
        alerts_service.smtplib,
        "SMTP",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("SMTP should not be used when disabled")),
    )

    try:
        response = client.post("/api/alerts/test-dispatch")
        assert response.status_code == 200
        payload = response.json()
        assert payload["smtp_enabled"] is False
        assert payload["status"] == "smtp_disabled"
        assert payload["history_id"] is not None

        row = session.query(AlertHistory).one()
        assert row.status == "smtp_disabled"
        assert row.payload["kind"] == "test"
        assert row.payload["smtp_enabled"] is False
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
