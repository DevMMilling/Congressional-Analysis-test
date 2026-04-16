import os
import sys
from datetime import date

# Ensure `backend/app` package is importable as `app`
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import MarketBar, Signal, Issuer
from app.services.backtest import run_backtest


def test_backtest_runs_and_returns_summary():
    # Use an in-memory SQLite DB for isolation
    engine = create_engine('sqlite:///:memory:', future=True)
    Base.metadata.create_all(engine)
    SessionTest = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionTest() as db:
        # Insert minimal issuer and market bars
        issuer = Issuer(ticker='ABC', issuer_name='ABC Inc.')
        db.add(issuer)
        db.flush()

        mb_entry = MarketBar(ticker='ABC', date=date(2020, 1, 1), open=100.0, high=101.0, low=99.0, close=100.0, volume=1000)
        spy_entry = MarketBar(ticker='SPY', date=date(2020, 1, 1), close=300.0)
        db.add_all([mb_entry, spy_entry])

        signal = Signal(signal_date=date(2020, 1, 1), signal_type='buy', ticker='ABC', score=1.0, rationale='test', recommendation='buy', confidence=0.9)
        db.add(signal)

        db.commit()

        result = run_backtest(db, holding_days=1, min_confidence=0.0)
        # result is a Pydantic model BacktestResult
        assert hasattr(result, 'cumulative_return')
        assert isinstance(result.cumulative_return, float)
