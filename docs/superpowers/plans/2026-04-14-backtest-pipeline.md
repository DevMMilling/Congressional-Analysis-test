# Backtest pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backtest orchestration service, REST endpoints, and a simple front-end page to visualize results.

**Architecture:** New `backtest` service will coordinate data retrieval, strategy execution, and result persistence. Results expose REST endpoints used by a new `BacktestPage.jsx` for visualization.

**Tech Stack:** Python (FastAPI/Starlette in backend app), pytest, minimal UI React components.

---

### Task 1: Backtest service (core)

**Files:**
- Create: `backend/services/backtest.py`
- Modify: `backend/services/jobs.py` (register job)
- Test: `backend/tests/test_backtest_service.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_backtest_service.py
from backend.services.backtest import run_backtest

def test_backtest_runs_and_returns_summary():
    # Use tiny synthetic data fixture or mock fetchers
    result = run_backtest(strategy_id='example', start='2020-01-01', end='2020-01-10')
    assert isinstance(result, dict)
    assert 'pnl' in result
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```
python -m pytest backend/tests/test_backtest_service.py::test_backtest_runs_and_returns_summary -q
```
Expected: FAIL (ImportError or function missing)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/services/backtest.py
from datetime import datetime

def run_backtest(strategy_id, start, end):
    # Minimal placeholder: returns an empty but valid summary
    return {
        'strategy_id': strategy_id,
        'start': start,
        'end': end,
        'pnl': 0.0,
        'trades': [],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```
python -m pytest backend/tests/test_backtest_service.py::test_backtest_runs_and_returns_summary -q
```
Expected: PASS

- [ ] **Step 5: Commit**

```
git add backend/services/backtest.py backend/tests/test_backtest_service.py
git commit -m "feat(backtest): add minimal backtest runner and tests"
```

### Task 2: Persist results and create REST endpoint

**Files:**
- Create: `backend/routers/backtest.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_backtest_api.py`

- [ ] **Step 1: Write failing API test**

```python
# backend/tests/test_backtest_api.py
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_backtest_api_returns_summary():
    resp = client.post('/backtest/run', json={'strategy_id': 'example', 'start': '2020-01-01', 'end': '2020-01-10'})
    assert resp.status_code == 200
    data = resp.json()
    assert 'pnl' in data
```

- [ ] **Step 2: Implement minimal router**

```python
# backend/routers/backtest.py
from fastapi import APIRouter
from backend.services.backtest import run_backtest

router = APIRouter()

@router.post('/backtest/run')
def run_backtest_endpoint(payload: dict):
    res = run_backtest(payload['strategy_id'], payload['start'], payload['end'])
    return res
```

- [ ] **Step 3: Register and run tests**

Run:
```
python -m pytest backend/tests/test_backtest_api.py -q
```
Expected: PASS

- [ ] **Step 4: Commit**

```
git add backend/routers/backtest.py backend/tests/test_backtest_api.py backend/app/main.py
git commit -m "feat(backtest): add API endpoint for running backtests"
```

### Task 3: Frontend visualization (minimal)

**Files:**
- Create: `frontend/src/pages/BacktestPage.jsx`
- Modify: `frontend/src/App.jsx` (add route)

Steps: write a small page that calls `/backtest/run` with example payload and renders `pnl` and a simple chart (use existing SimpleLineChart component).

Verification: Run dev server (`npm install` then `npm run dev`) and confirm BacktestPage loads and shows results for example payload.

### Verification (end-to-end)
1. Start backend (see `backend/app/main.py` how to run) and frontend dev server.
2. Run `python -m pytest -q` — all tests pass.
3. Manually run BacktestPage to ensure API call succeeds.

---

**Decisions**
- Work in an isolated worktree named `feature/backtest-pipeline` (recommended).
- Keep the initial backtest runner minimal; extend later for more realistic execution.

**Further Considerations**
1. Add a database table for backtest results in `backend/db.py` once API/proof-of-concept is validated.
2. Add sample strategy fixtures for deterministic tests.
