# Congressional Trading Intelligence App

Local-first full-stack app for scraping Capitol Trades, enriching it with congressional metadata, training interpretable predictive models, generating trade signals, backtesting those signals, and surfacing everything in an interactive dashboard with email alerts.

## Stack

- Backend: FastAPI, SQLAlchemy, Pydantic, APScheduler, pandas, scikit-learn
- Frontend: React + Vite
- Database: SQLite by default, PostgreSQL-ready via `DATABASE_URL`
- Market data: `yfinance` provider abstraction

## Project Layout

- `backend/`: Python API, data pipeline, jobs, models, tests
- `frontend/`: React dashboard
- `docker-compose.yml`: local orchestration for API + frontend + PostgreSQL

## Quick Start

1. Create a virtual environment and install backend dependencies:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

2. Run the backend:

```powershell
uvicorn backend.app.main:app --reload --port 8000
```

3. Install frontend dependencies once Node.js is available, then run:

```powershell
cd frontend
npm install
npm run dev
```

## Notes

- Use `POST /ingest/backfill` for a full bootstrap.
- Use `POST /ingest/update` for incremental updates.
- The app stores raw and normalized data separately for auditability.
- The insider-risk score is an analytics heuristic, not a legal determination.
