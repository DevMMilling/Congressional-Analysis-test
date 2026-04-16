from __future__ import annotations

import csv
from datetime import date
from io import StringIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db import Base, get_db
from backend.app.main import app
from backend.app.models import Issuer, MarketBar, Politician, Signal, Trade


TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    future=True,
)
TestingSessionLocal = sessionmaker(bind=TEST_ENGINE, autoflush=False, autocommit=False, future=True)


def _seed_data() -> None:
    Base.metadata.create_all(bind=TEST_ENGINE)
    with TestingSessionLocal() as db:
        politician = Politician(slug="jane-doe", full_name="Jane Doe", party="D", chamber="House", state="CA")
        db.add(politician)
        db.flush()

        issuer = Issuer(ticker="ACME", issuer_name="Acme Corp", sector="Technology")
        spy = Issuer(ticker="SPY", issuer_name="SPDR S&P 500 ETF Trust", sector="Index")
        db.add_all([issuer, spy])
        db.flush()

        trade = Trade(
            source_trade_id="trade-1",
            raw_payload_id=None,
            politician_id=politician.id,
            issuer_id=issuer.id,
            politician_name="Jane Doe",
            ticker="ACME",
            issuer_name="Acme Corp",
            transaction_type="buy",
            owner_type="self",
            transaction_date=date(2026, 4, 1),
            disclosure_date=date(2026, 4, 10),
            disclosure_lag_days=9,
            amount_text="1K-15K",
            amount_low=1000,
            amount_high=15000,
            amount_mid=8000,
            price_at_trade=10.5,
            chamber="House",
            party="D",
            state="CA",
            notes="Initial position",
        )
        db.add(trade)

        signal = Signal(
            signal_date=date(2026, 4, 11),
            signal_type="high_confidence",
            ticker="ACME",
            politician_id=politician.id,
            score=0.91,
            confidence=0.83,
            rationale="Elevated modeled congressional trading probability for ACME.",
            recommendation="buy",
            historical_win_rate=0.72,
            metadata_json={"trade_id": 1},
        )
        db.add(signal)

        db.add_all(
            [
                MarketBar(ticker="ACME", date=date(2026, 4, 11), open=10, high=10.5, low=9.8, close=10, adj_close=10, volume=1000),
                MarketBar(ticker="ACME", date=date(2026, 5, 11), open=12, high=12.5, low=11.8, close=12, adj_close=12, volume=1200),
                MarketBar(ticker="SPY", date=date(2026, 4, 11), open=100, high=101, low=99.5, close=100, adj_close=100, volume=2000),
                MarketBar(ticker="SPY", date=date(2026, 5, 11), open=101, high=102, low=100.5, close=101, adj_close=101, volume=2100),
            ]
        )
        db.commit()


@pytest.fixture(scope="module")
def client() -> TestClient:
    _seed_data()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _parse_csv(response_text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(response_text)))


def test_trades_csv_export_filters_and_content_type(client: TestClient) -> None:
    response = client.get("/api/exports/trades.csv", params={"ticker": "acme", "transaction_type": "buy"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == 'attachment; filename="trades.csv"'

    rows = _parse_csv(response.text)
    assert len(rows) == 1
    assert rows[0]["ticker"] == "ACME"
    assert rows[0]["transaction_type"] == "buy"
    assert rows[0]["sector"] == "Technology"


def test_signals_csv_export_supports_filters(client: TestClient) -> None:
    response = client.get("/api/exports/signals.csv", params={"min_confidence": 0.8, "ticker": "ACME"})

    assert response.status_code == 200
    rows = _parse_csv(response.text)
    assert len(rows) == 1
    assert rows[0]["signal_type"] == "high_confidence"
    assert rows[0]["politician_name"] == "Jane Doe"


def test_backtest_ledger_csv_export_includes_strategy_results(client: TestClient) -> None:
    response = client.get(
        "/api/exports/backtest-ledger.csv",
        params={"holding_days": 30, "min_confidence": 0.5, "signal_type": "high_confidence", "transaction_cost_bps": 10},
    )

    assert response.status_code == 200
    rows = _parse_csv(response.text)
    assert len(rows) == 1
    row = rows[0]
    assert row["ticker"] == "ACME"
    assert row["recommendation"] == "buy"
    assert row["holding_days"] == "30"
    assert float(row["return"]) > 0
    assert float(row["benchmark_return"]) >= 0
