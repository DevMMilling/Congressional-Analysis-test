from __future__ import annotations

from datetime import date, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db import Base, get_db
from backend.app.models import (
    AlertSubscription,
    FeatureSnapshot,
    Issuer,
    JobRun,
    MarketBar,
    Politician,
    Prediction,
    RawTradePayload,
    Signal,
    Trade,
)
from backend.app.routers import alerts, analytics, exports, ingest, jobs, politicians, signals, stocks, system_status, trades


def _build_client() -> tuple[TestClient, sessionmaker]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, future=True)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    for router in [
        ingest.router,
        politicians.router,
        stocks.router,
        trades.router,
        signals.router,
        analytics.router,
        alerts.router,
        exports.router,
        system_status.router,
        jobs.router,
    ]:
        app.include_router(router, prefix="/api")

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), TestingSessionLocal


def _seed_data(SessionLocal: sessionmaker) -> None:
    with SessionLocal() as db:
        politician = Politician(slug="jane-doe", full_name="Jane Doe", first_name="Jane", last_name="Doe", party="D", chamber="House", state="CA")
        second = Politician(slug="john-roe", full_name="John Roe", first_name="John", last_name="Roe", party="R", chamber="Senate", state="TX")
        raw = RawTradePayload(source_trade_id="raw-1", payload={"source": "test", "trade": 1})
        db.add_all([politician, second, raw])
        db.flush()

        acme = Issuer(ticker="ACME", issuer_name="Acme Corp", sector="Technology", industry="Software", exchange="NASDAQ")
        beta = Issuer(ticker="BETA", issuer_name="Beta Industries", sector="Industrial", industry="Manufacturing", exchange="NYSE")
        spy = Issuer(ticker="SPY", issuer_name="SPDR S&P 500 ETF Trust", sector="Index")
        db.add_all([acme, beta, spy])
        db.flush()

        trade = Trade(
            source_trade_id="trade-1",
            raw_payload_id=raw.id,
            politician_id=politician.id,
            issuer_id=acme.id,
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
        second_trade = Trade(
            source_trade_id="trade-2",
            politician_id=second.id,
            issuer_id=beta.id,
            politician_name="John Roe",
            ticker="BETA",
            issuer_name="Beta Industries",
            transaction_type="sell",
            owner_type="self",
            transaction_date=date(2026, 4, 3),
            disclosure_date=date(2026, 4, 12),
            disclosure_lag_days=9,
            amount_text="15K-50K",
            amount_low=15000,
            amount_high=50000,
            amount_mid=32500,
            price_at_trade=20.0,
            chamber="Senate",
            party="R",
            state="TX",
        )
        db.add_all([trade, second_trade])
        db.flush()

        db.add(
            FeatureSnapshot(
                snapshot_date=date(2026, 4, 10),
                entity_type="trade_event",
                entity_key=f"trade:{trade.id}",
                feature_set="trade_event_v1",
                features={"trade_id": trade.id, "ticker": "ACME"},
                target=0.1,
            )
        )
        db.flush()
        snapshot = db.query(FeatureSnapshot).filter_by(entity_key=f"trade:{trade.id}").one()

        db.add_all(
            [
                Prediction(
                    prediction_date=date(2026, 4, 11),
                    model_name="trade_probability_model",
                    entity_type="trade_event",
                    entity_key=f"trade:{trade.id}",
                    score=0.91,
                    confidence=0.83,
                    prediction_payload={"trade_id": trade.id, "feature_snapshot_id": snapshot.id},
                ),
                Prediction(
                    prediction_date=date(2026, 4, 11),
                    model_name="post_disclosure_return_model",
                    entity_type="trade_event",
                    entity_key=f"trade:{trade.id}",
                    score=0.12,
                    confidence=0.6,
                    prediction_payload={"trade_id": trade.id, "feature_snapshot_id": snapshot.id},
                ),
            ]
        )

        db.add_all(
            [
                Signal(
                    signal_date=date(2026, 4, 11),
                    signal_type="high_confidence",
                    ticker="ACME",
                    politician_id=politician.id,
                    score=0.91,
                    confidence=0.83,
                    rationale="Elevated modeled congressional trading probability for ACME.",
                    recommendation="buy",
                    historical_win_rate=0.72,
                    metadata_json={"trade_id": trade.id},
                ),
                Signal(
                    signal_date=date(2026, 4, 12),
                    signal_type="clustered_activity",
                    ticker="BETA",
                    politician_id=second.id,
                    score=0.75,
                    confidence=0.7,
                    rationale="Clustered activity for BETA.",
                    recommendation="watch",
                    historical_win_rate=0.61,
                    metadata_json={"trade_id": second_trade.id},
                ),
            ]
        )

        db.add_all(
            [
                MarketBar(ticker="ACME", date=date(2026, 4, 11), open=10, high=10.5, low=9.8, close=10, adj_close=10, volume=1000),
                MarketBar(ticker="ACME", date=date(2026, 5, 11), open=12, high=12.5, low=11.8, close=12, adj_close=12, volume=1200),
                MarketBar(ticker="BETA", date=date(2026, 4, 11), open=20, high=20.5, low=19.8, close=20, adj_close=20, volume=900),
                MarketBar(ticker="BETA", date=date(2026, 5, 11), open=19, high=19.5, low=18.8, close=19, adj_close=19, volume=950),
                MarketBar(ticker="SPY", date=date(2026, 4, 11), open=100, high=101, low=99.5, close=100, adj_close=100, volume=2000),
                MarketBar(ticker="SPY", date=date(2026, 5, 11), open=101, high=102, low=100.5, close=101, adj_close=101, volume=2100),
            ]
        )

        db.add_all(
            [
                AlertSubscription(email="alerts@example.com", enabled=True, minimum_confidence=0.6, signal_types=["high_confidence"]),
                JobRun(job_type="backfill", status="completed", started_at=datetime(2026, 4, 11, 9, 0, 0), finished_at=datetime(2026, 4, 11, 9, 5, 0), message="done"),
                JobRun(job_type="incremental_update", status="running", started_at=datetime(2026, 4, 12, 9, 0, 0), message="running"),
            ]
        )
        db.commit()


def test_collection_routes_include_paging_headers_and_filters() -> None:
    client, SessionLocal = _build_client()
    _seed_data(SessionLocal)

    trades_response = client.get("/api/trades", params={"page": 1, "page_size": 1, "sort": "amount_mid", "order": "desc"})
    assert trades_response.status_code == 200
    assert trades_response.headers["x-total-count"] == "2"
    assert trades_response.headers["x-page-size"] == "1"
    assert trades_response.json()[0]["ticker"] == "BETA"

    signals_response = client.get("/api/signals", params={"ticker": "ACME", "page": 1, "page_size": 10})
    assert signals_response.status_code == 200
    assert signals_response.headers["x-total-count"] == "1"
    assert signals_response.json()[0]["ticker"] == "ACME"

    stocks_response = client.get("/api/stocks", params={"sector": "Technology", "page_size": 5})
    assert stocks_response.status_code == 200
    assert stocks_response.headers["x-total-count"] == "1"
    assert stocks_response.json()[0]["ticker"] == "ACME"

    politicians_response = client.get("/api/politicians", params={"party": "D", "page_size": 5})
    assert politicians_response.status_code == 200
    assert politicians_response.headers["x-total-count"] == "1"
    assert politicians_response.json()[0]["full_name"] == "Jane Doe"


def test_alert_subscription_crud_and_job_history() -> None:
    client, SessionLocal = _build_client()
    _seed_data(SessionLocal)

    list_response = client.get("/api/alerts/subscriptions")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    subscription_id = list_response.json()[0]["id"]

    update_response = client.patch(f"/api/alerts/subscriptions/{subscription_id}", json={"enabled": False, "minimum_confidence": 0.8})
    assert update_response.status_code == 200
    assert update_response.json()["enabled"] is False
    assert update_response.json()["minimum_confidence"] == 0.8

    jobs_response = client.get("/api/jobs", params={"limit": 10})
    assert jobs_response.status_code == 200
    assert len(jobs_response.json()) == 2

    delete_response = client.delete(f"/api/alerts/subscriptions/{subscription_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_trade_detail_and_politician_activity_routes() -> None:
    client, SessionLocal = _build_client()
    _seed_data(SessionLocal)

    trade_detail = client.get("/api/trades/1")
    assert trade_detail.status_code == 200
    payload = trade_detail.json()
    assert payload["ticker"] == "ACME"
    assert payload["raw_payload"]["source"] == "test"
    assert payload["issuer_sector"] == "Technology"
    assert payload["politician_slug"] == "jane-doe"

    activity = client.get("/api/politicians/1/trades")
    assert activity.status_code == 200
    activity_payload = activity.json()
    assert activity_payload["summary"]["trade_count"] == 1
    assert activity_payload["summary"]["signal_count"] == 1
    assert activity_payload["summary"]["sector_exposure"][0]["sector"] == "Technology"

    signals_response = client.get("/api/politicians/1/signals")
    assert signals_response.status_code == 200
    assert signals_response.json()[0]["signal_type"] == "high_confidence"


def test_stock_compare_and_signal_explainability_routes() -> None:
    client, SessionLocal = _build_client()
    _seed_data(SessionLocal)

    compare_response = client.get("/api/stocks/compare", params={"tickers": "ACME,BETA", "days": 365, "include_trades": "true"})
    assert compare_response.status_code == 200
    compare_payload = compare_response.json()
    assert compare_payload["tickers"] == ["ACME", "BETA"]
    assert len(compare_payload["series"]) == 2
    assert compare_payload["series"][0]["history"]

    explain_response = client.get("/api/signals/1/explain")
    assert explain_response.status_code == 200
    explain_payload = explain_response.json()
    assert explain_payload["signal"]["ticker"] == "ACME"
    assert explain_payload["linked_trade"]["ticker"] == "ACME"
    assert explain_payload["linked_prediction"]["model_name"] == "trade_probability_model"
    assert explain_payload["linked_feature_snapshot"]["feature_set"] == "trade_event_v1"


def test_backtest_compare_and_report_export_routes() -> None:
    client, SessionLocal = _build_client()
    _seed_data(SessionLocal)

    compare_response = client.post(
        "/api/backtest/compare",
        json={
            "scenarios": [
                {"label": "Base", "holding_days": 30, "min_confidence": 0.5, "signal_type": "high_confidence", "transaction_cost_bps": 10},
                {"label": "Cluster", "holding_days": 30, "min_confidence": 0.5, "signal_type": "clustered_activity", "transaction_cost_bps": 10},
            ]
        },
    )
    assert compare_response.status_code == 200
    compare_payload = compare_response.json()
    assert [item["label"] for item in compare_payload["scenarios"]] == ["Base", "Cluster"]

    report_response = client.post(
        "/api/exports/report",
        json={
            "politician_id": 1,
            "ticker": "ACME",
            "signal_type": "high_confidence",
            "min_confidence": 0.5,
            "trade_limit": 10,
            "signal_limit": 10,
            "include_backtest": True,
            "backtest": {"holding_days": 30, "min_confidence": 0.5, "signal_type": "high_confidence", "transaction_cost_bps": 10},
        },
    )
    assert report_response.status_code == 200
    payload = report_response.json()
    assert payload["politician"]["full_name"] == "Jane Doe"
    assert payload["stock"]["ticker"] == "ACME"
    assert len(payload["trades"]) == 1
    assert len(payload["signals"]) == 1
    assert payload["backtest"] is not None


# ---------------------------------------------------------------------------
# C1 — GET /api/politicians/compare
# ---------------------------------------------------------------------------

def test_politician_comparison_endpoint() -> None:
    client, SessionLocal = _build_client()
    _seed_data(SessionLocal)

    # Retrieve the two seeded politician IDs so we don't hard-code them.
    with SessionLocal() as db:
        from backend.app.models import Politician as _Politician
        p1, p2 = db.query(_Politician).order_by(_Politician.id).limit(2).all()
        id1, id2 = p1.id, p2.id

    # Case 1: valid request for 2 politicians returns 200 with 2 entries
    response = client.get("/api/politicians/compare", params={"ids": f"{id1},{id2}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data["entries"]) == 2

    # Case 2: each entry contains the expected keys
    expected_keys = {"politician_id", "name", "trade_count", "buy_count", "sell_count", "signal_count", "insider_risk_ratio"}
    for entry in data["entries"]:
        assert expected_keys.issubset(entry.keys())

    # Case 3: non-integer ids → 422 Unprocessable Entity
    bad_response = client.get("/api/politicians/compare", params={"ids": "abc"})
    assert bad_response.status_code == 422

    # Case 4: unknown integer ID → 200 with empty entries list
    unknown_response = client.get("/api/politicians/compare", params={"ids": "99999"})
    assert unknown_response.status_code == 200
    assert unknown_response.json()["entries"] == []


# ---------------------------------------------------------------------------
# C2 — GET /api/signals/summary
# ---------------------------------------------------------------------------

def test_signals_summary_endpoint() -> None:
    # Case 1: seed 2 high_confidence + 1 clustered_activity → total_signals==3, len(by_type)==2
    client, SessionLocal = _build_client()

    with SessionLocal() as db:
        from backend.app.models import Politician as _Politician, Signal as _Signal
        pol = _Politician(slug="sig-test-pol", full_name="Sig Test", party="D", chamber="House", state="CA")
        db.add(pol)
        db.flush()
        db.add_all([
            _Signal(signal_date=date(2026, 1, 1), signal_type="high_confidence", ticker="AAA", score=0.9, confidence=0.85, rationale="r1", historical_win_rate=0.7),
            _Signal(signal_date=date(2026, 1, 2), signal_type="high_confidence", ticker="BBB", score=0.88, confidence=0.80, rationale="r2", historical_win_rate=0.65),
            _Signal(signal_date=date(2026, 1, 3), signal_type="clustered_activity", ticker="CCC", score=0.75, confidence=0.70, rationale="r3", historical_win_rate=0.60),
        ])
        db.commit()

    response = client.get("/api/signals/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["total_signals"] == 3
    assert len(data["by_type"]) == 2

    # Case 2: empty DB → total_signals==0, by_type==[]
    client_empty, SessionLocal_empty = _build_client()
    empty_response = client_empty.get("/api/signals/summary")
    assert empty_response.status_code == 200
    empty_data = empty_response.json()
    assert empty_data["total_signals"] == 0
    assert empty_data["by_type"] == []

    # Case 3: each entry in by_type has the required keys
    expected_keys = {"signal_type", "count", "avg_confidence", "avg_win_rate"}
    for entry in data["by_type"]:
        assert expected_keys.issubset(entry.keys())

    # Case 4: by_type is sorted descending by count (count=2 before count=1)
    counts = [entry["count"] for entry in data["by_type"]]
    assert counts == sorted(counts, reverse=True)


# ---------------------------------------------------------------------------
# C4 — GET /api/trades/stats
# ---------------------------------------------------------------------------

def test_trade_stats_endpoint() -> None:
    client, SessionLocal = _build_client()
    _seed_data(SessionLocal)

    response = client.get("/api/trades/stats")
    assert response.status_code == 200
    data = response.json()

    # Case 1: total_count reflects both seeded trades
    assert data["total_count"] == 2

    # Case 2: buy and sell counts each equal 1
    assert data["buy_count"] == 1
    assert data["sell_count"] == 1

    # Case 3: disclosure date fields are present and non-null
    assert data["earliest_disclosure"] is not None
    assert data["latest_disclosure"] is not None

    # Case 4: average_lag_days is None or a numeric value
    assert data["average_lag_days"] is None or isinstance(data["average_lag_days"], (int, float))

    # Case 5: top_tickers is a list with at most 5 entries
    assert isinstance(data["top_tickers"], list)
    assert len(data["top_tickers"]) <= 5

    # Case 6: each top_tickers entry has ticker and count keys
    for entry in data["top_tickers"]:
        assert "ticker" in entry
        assert "count" in entry
