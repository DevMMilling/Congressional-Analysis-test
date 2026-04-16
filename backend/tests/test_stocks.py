from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.models import Base, Issuer, MarketBar, Politician, Trade
from backend.app.routers.stocks import get_stock_history


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_get_stock_history_returns_recent_bars_and_markers(db_session):
    issuer = Issuer(ticker="EXM", issuer_name="Example Corp", sector="Technology")
    politician = Politician(slug="john-doe", full_name="John Doe", first_name="John", last_name="Doe")
    db_session.add_all([issuer, politician])
    db_session.flush()

    db_session.add_all(
        [
            MarketBar(ticker="EXM", date=date(2026, 3, 10), open=100, high=101, low=99, close=100, adj_close=100, volume=1000),
            MarketBar(ticker="EXM", date=date(2026, 3, 11), open=101, high=103, low=100, close=102, adj_close=102, volume=1100),
            MarketBar(ticker="EXM", date=date(2026, 3, 12), open=102, high=104, low=101, close=101, adj_close=101, volume=1200),
        ]
    )
    db_session.add(
        Trade(
            source_trade_id="trade-1",
            politician_id=politician.id,
            issuer_id=issuer.id,
            politician_name="John Doe",
            ticker="EXM",
            issuer_name="Example Corp",
            transaction_type="buy",
            transaction_date=date(2026, 3, 11),
            disclosure_date=date(2026, 3, 14),
            amount_text="1K-15K",
            disclosure_lag_days=3,
            price_at_trade=102,
        )
    )
    db_session.commit()

    response = get_stock_history("EXM", days=3, include_trades=True, db=db_session)

    assert response.ticker == "EXM"
    assert [point.date for point in response.history] == [date(2026, 3, 10), date(2026, 3, 11), date(2026, 3, 12)]
    assert response.latest_close == 101
    assert response.previous_close == 102
    assert response.change == -1
    assert response.change_pct == pytest.approx(-1 / 102)
    assert len(response.trade_markers) == 1
    assert response.trade_markers[0].date == date(2026, 3, 11)
    assert response.trade_markers[0].price == 102
    assert response.trade_markers[0].label == "John Doe buy"


def test_get_stock_history_missing_ticker_raises_404(db_session):
    with pytest.raises(HTTPException) as exc_info:
        get_stock_history("MISSING", db=db_session)

    assert exc_info.value.status_code == 404
