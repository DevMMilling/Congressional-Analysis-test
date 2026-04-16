# Congressional Trading Intelligence App Scope

## Project Summary

This project is a local-first research application for analyzing U.S. congressional stock trading activity. It scrapes trade disclosures from Capitol Trades, enriches those trades with congressional metadata, joins market price history, generates interpretable predictive signals, backtests those signals, and exposes the results through a Python API and React dashboard.

The application is intended for research and monitoring, not legal adjudication. Any "insider risk" output is an analytics heuristic and must be presented as such.

## Current Stack

- Backend: FastAPI, SQLAlchemy, Pydantic, APScheduler, pandas, scikit-learn
- Frontend: React, Vite, Recharts
- Database: SQLite by default, PostgreSQL-compatible via `DATABASE_URL`
- Data sources:
  - Capitol Trades for trade disclosures
  - `unitedstates/congress-legislators` for legislator metadata
  - `unitedstates/congress` for committee membership data
  - Yahoo Finance-style data through `yfinance` for OHLCV history

## Current Implemented Foundation

- API app bootstrap and routing
- SQLAlchemy models for:
  - raw trade payloads
  - normalized trades
  - politicians
  - committee roles
  - issuers
  - market bars
  - feature snapshots
  - predictions
  - signals
  - alert subscriptions/history
  - job runs
- Capitol Trades list-page scraper
- Market-data refresh job
- Feature snapshot generation
- Baseline classifier/regressor training
- Signal generation including high-confidence, clustered-activity, unusual-buying, and insider-risk heuristics
- Backtest engine
- Dashboard, politician, stock, signals, backtest, and admin pages

## Product Goals

- Help a researcher inspect congressional trading behavior by politician, stock, sector, and time.
- Surface unusual activity, clustering, and model-driven opportunities in a way that is interpretable.
- Track whether following generated signals would have performed well versus a benchmark.
- Make updates simple with refresh/retrain actions and observable job status.
- Support email alert workflows for high-signal events.

## Core Architecture

### Backend responsibilities

- Scrape and normalize trade disclosures
- Sync legislator and committee metadata
- Fetch and store market history
- Build model-ready features without lookahead leakage
- Train predictive models and persist predictions
- Generate transparent signals and risk scores
- Run backtests
- Send and track email alerts
- Serve all data to the UI through JSON APIs

### Frontend responsibilities

- Display dashboard-level metrics and rankings
- Support search and inspection for politicians and stocks
- Visualize signals and strategy performance
- Let the operator trigger updates/retraining
- Manage alert subscriptions

## Important Domain Rules

- Preserve both `transaction_date` and `disclosure_date`.
- Treat disclosure lag as a first-class feature and risk factor.
- Avoid leakage: no features may use information unavailable at the prediction timestamp.
- Preserve raw scraped payloads for auditability.
- Store parsed amount low/high/mid while keeping original amount text.
- Insider-risk scoring must remain descriptive and heuristic, never framed as proof.

## Public API Surface

- `POST /api/ingest/backfill`
- `POST /api/ingest/update`
- `GET /api/politicians`
- `GET /api/politicians/{id}`
- `GET /api/stocks`
- `GET /api/stocks/{ticker}`
- `GET /api/trades`
- `GET /api/signals`
- `GET /api/signals/top`
- `GET /api/analytics/summary`
- `GET /api/backtest`
- `POST /api/alerts/subscriptions`
- `POST /api/alerts/dispatch`
- `POST /api/models/retrain`
- `GET /api/jobs/{job_id}`

## Current Gaps

- No dedicated system-status endpoint for data freshness, model freshness, or scheduler health
- No CSV/export workflows for external analysis
- No alert history/test-email UI
- No market-price chart on stock detail pages
- Limited signal filtering in the UI
- Current scraper is list-page based and should be treated as brittle to markup changes

## Recommended Near-Term Feature Work

### 1. System Status and Data Freshness

- Add a backend endpoint that reports:
  - latest trade disclosure date
  - latest market-bar date
  - latest completed ingest job
  - latest model retrain timestamp
  - signal count and subscription count
- Show this on the admin page so an operator can quickly see whether data is stale.

### 2. Export Workflows

- Add CSV export endpoints for trades, signals, and backtest ledgers.
- Support current filters where practical.
- Exports should use read-only queries and not mutate app state.

### 3. Alert Operations

- Add alert history listing and a test-dispatch endpoint.
- Show recent alert delivery results in the admin UI.
- Keep SMTP optional and gracefully degrade when disabled.

### 4. Stock Price History Visualization

- Add a backend endpoint that returns historical price bars for a ticker.
- Add a stock-page chart overlay that combines price history with congressional trade markers if available.

### 5. Signal Filtering and Search UX

- Add frontend controls for signal type, ticker, politician ID, confidence thresholds, and result limits.
- Make signals easier to inspect without editing query strings manually.

## File/Module Orientation

- Backend entrypoint: [backend/app/main.py](C:\Users\dk8MaMiS\OneDrive - LEGO\Documents\repos\alternative-project-folder\backend\app\main.py:1)
- Data models: [backend/app/models.py](C:\Users\dk8MaMiS\OneDrive - LEGO\Documents\repos\alternative-project-folder\backend\app\models.py:1)
- Schemas: [backend/app/schemas.py](C:\Users\dk8MaMiS\OneDrive - LEGO\Documents\repos\alternative-project-folder\backend\app\schemas.py:1)
- Services: `backend/app/services/`
- Routers: `backend/app/routers/`
- Frontend app shell: [frontend/src/App.jsx](C:\Users\dk8MaMiS\OneDrive - LEGO\Documents\repos\alternative-project-folder\frontend\src\App.jsx:1)
- Frontend pages: `frontend/src/pages/`
- Frontend API client: [frontend/src/api.js](C:\Users\dk8MaMiS\OneDrive - LEGO\Documents\repos\alternative-project-folder\frontend\src\api.js:1)

## Working Conventions For Other Agents

- Do not remove or weaken the distinction between raw and normalized data.
- Do not introduce leakage into feature or model code.
- Keep backend additions modular: schema, service, router.
- Keep frontend work aligned to the existing visual language unless intentionally improving it.
- Prefer additive changes over rewrites.
- Assume other agents may be editing nearby files; do not revert unrelated changes.
- Keep legal framing conservative around insider-trading language.

## Acceptance Standard

A feature is considered complete when:

- Backend behavior is exposed through a clear API or service surface
- Frontend behavior is usable without manual editing of code or URLs
- No existing endpoints or pages are broken
- The change is documented enough that another engineer can extend it
- Basic verification exists, whether through tests or at minimum syntax-safe integration
