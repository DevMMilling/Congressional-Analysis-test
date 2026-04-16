from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sys
from typing import Any

import pandas as pd
import yfinance as yf
from sqlalchemy import func, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.bootstrap import bootstrap_database
from backend.app.config import get_settings
from backend.app.db import SessionLocal
from backend.app.models import Issuer, MarketBar, Politician, Prediction, Signal, Trade
from backend.app.services import ingest as ingest_service
from backend.app.services.features import rebuild_feature_snapshots
from backend.app.services.ingest import CapitolTradesScraper, CongressMetadataImporter, upsert_trade
from backend.app.services.jobs import create_job, mark_job_failed, mark_job_finished, mark_job_running
from backend.app.services.market_data import _clean_float
from backend.app.services.modeling import retrain_models
from backend.app.services.signals import rebuild_signals


settings = get_settings()


def log(message: str) -> None:
    timestamp = datetime.now().isoformat(timespec="seconds")
    print(f"[{timestamp}] {message}", flush=True)


def best_effort_market_refresh(db) -> tuple[int, list[dict[str, str]]]:
    tickers = [row[0] for row in db.execute(select(Issuer.ticker).where(Issuer.ticker.is_not(None))).all()]
    tickers = sorted({ticker for ticker in tickers if ticker})
    if settings.benchmark_ticker not in tickers:
        tickers.append(settings.benchmark_ticker)

    inserted = 0
    failures: list[dict[str, str]] = []

    for index, ticker in enumerate(tickers, start=1):
        try:
            asset = yf.Ticker(ticker)
            issuer = db.execute(select(Issuer).where(Issuer.ticker == ticker)).scalar_one_or_none()

            try:
                info = asset.info or {}
                if issuer is not None:
                    issuer.sector = info.get("sector") or issuer.sector
                    issuer.industry = info.get("industry") or issuer.industry
                    issuer.exchange = info.get("exchange") or issuer.exchange
                    db.add(issuer)
                    db.commit()
            except Exception:
                db.rollback()

            history = asset.history(period=settings.yfinance_period, auto_adjust=False)
            if history.empty:
                if index == 1 or index % 25 == 0 or index == len(tickers):
                    log(f"Market data {index}/{len(tickers)}: {ticker} returned no history")
                continue

            history = history.reset_index()
            new_for_ticker = 0
            for _, row in history.iterrows():
                bar_date = pd.Timestamp(row["Date"]).date()
                existing = db.execute(
                    select(MarketBar).where(MarketBar.ticker == ticker, MarketBar.date == bar_date)
                ).scalar_one_or_none()
                if existing is None:
                    existing = MarketBar(ticker=ticker, date=bar_date, issuer_id=issuer.id if issuer else None)
                    new_for_ticker += 1
                    inserted += 1
                existing.open = _clean_float(row.get("Open"))
                existing.high = _clean_float(row.get("High"))
                existing.low = _clean_float(row.get("Low"))
                existing.close = _clean_float(row.get("Close"))
                existing.adj_close = _clean_float(row.get("Adj Close"))
                existing.volume = _clean_float(row.get("Volume"))
                db.add(existing)
            db.commit()

            if index == 1 or index % 25 == 0 or index == len(tickers):
                log(
                    f"Market data {index}/{len(tickers)}: {ticker} loaded "
                    f"{len(history)} rows ({new_for_ticker} new)"
                )
        except Exception as exc:
            db.rollback()
            failures.append({"ticker": ticker, "error": str(exc)})
            log(f"Market data failed for {ticker}: {exc}")

    return inserted, failures


def count_table(db, model) -> int:
    return int(db.execute(select(func.count()).select_from(model)).scalar_one())


def main() -> None:
    bootstrap_database()
    log("Starting best-effort full ingest")

    with SessionLocal() as db:
        job = create_job(db, "backfill", message="Starting best-effort full ingest.")
        mark_job_running(db, job, details={"mode": "best_effort", "page_limit": 500})

        try:
            # Skip per-ticker yfinance metadata fetches during trade upserts; refresh them in bulk later.
            ingest_service.enrich_issuer_metadata = lambda *_args, **_kwargs: None

            metadata = CongressMetadataImporter().sync_remote_metadata(db)
            log(f"Metadata sync complete: {metadata}")

            scraper = CapitolTradesScraper()
            page = 1
            trades_processed = 0
            pages_loaded = 0
            page_errors: list[dict[str, Any]] = []

            while page <= 500:
                try:
                    trades = scraper.scrape_page(page)
                except Exception as exc:
                    page_errors.append({"page": page, "error": str(exc)})
                    log(f"Trade page {page} failed: {exc}")
                    break

                if not trades:
                    log(f"Trade page {page} returned no rows; stopping scrape")
                    break

                pages_loaded += 1
                trades_processed += len(trades)
                for trade in trades:
                    upsert_trade(db, trade)

                if page == 1 or page % 10 == 0 or len(trades) < settings.capitol_trades_page_size:
                    log(
                        f"Trade page {page}: loaded {len(trades)} rows "
                        f"({trades_processed} total so far)"
                    )
                page += 1

            ticker_count = int(
                db.execute(select(func.count(func.distinct(Trade.ticker))).where(Trade.ticker.is_not(None))).scalar_one()
            )
            log(f"Trade ingest complete: {trades_processed} rows across {pages_loaded} pages and {ticker_count} tickers")

            market_bars_added, market_failures = best_effort_market_refresh(db)
            log(
                f"Market refresh complete: {market_bars_added} new bars, "
                f"{len(market_failures)} ticker failures"
            )

            feature_count = rebuild_feature_snapshots(db)
            log(f"Feature rebuild complete: {feature_count} snapshots")

            model_result = retrain_models(db)
            log(f"Model retrain complete: {model_result}")

            signal_count = rebuild_signals(db, stale_guard=False)
            log(f"Signal rebuild complete: {signal_count} signals")

            details = {
                "mode": "best_effort",
                "pages_loaded": pages_loaded,
                "trades_processed": trades_processed,
                "ticker_count": ticker_count,
                "market_bars_added": market_bars_added,
                "market_failures": len(market_failures),
                "market_failure_examples": market_failures[:10],
                "page_errors": page_errors,
                "table_counts": {
                    "politicians": count_table(db, Politician),
                    "trades": count_table(db, Trade),
                    "issuers": count_table(db, Issuer),
                    "market_bars": count_table(db, MarketBar),
                    "predictions": count_table(db, Prediction),
                    "signals": count_table(db, Signal),
                },
                **metadata,
            }
            message = (
                f"Best-effort backfill complete: {trades_processed} trades across "
                f"{pages_loaded} pages, {market_bars_added} market bars."
            )
            mark_job_finished(db, job, message, details=details)
            log(message)
        except Exception as exc:
            mark_job_failed(db, job, str(exc))
            log(f"Full ingest failed: {exc}")
            raise


if __name__ == "__main__":
    main()
