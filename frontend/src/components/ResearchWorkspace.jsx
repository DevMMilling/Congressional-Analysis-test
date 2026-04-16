import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import SimpleBarChart from "./SimpleBarChart";
import SimpleLineChart from "./SimpleLineChart";

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.items)) {
    return value.items;
  }

  if (Array.isArray(value?.results)) {
    return value.results;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
}

function asBars(value) {
  if (Array.isArray(value)) {
    return value.map((item) => ({
      ...item,
      label: item.label ?? item.bucket ?? item.sector ?? item.name ?? "Unknown",
      value: Number(item.value ?? item.count ?? item.total ?? item.amount ?? 0),
    }));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).map(([label, rawValue]) => ({
    label,
    value: Number(rawValue?.value ?? rawValue?.count ?? rawValue ?? 0),
  }));
}

function activityPills(activity = {}, politician = {}) {
  const pills = [];
  const summary = activity?.summary || politician;

  if (summary.trade_count !== undefined) {
    pills.push(`Trades ${summary.trade_count}`);
  }
  if (summary.buy_count !== undefined) {
    pills.push(`Buys ${summary.buy_count}`);
  }
  if (summary.sell_count !== undefined) {
    pills.push(`Sells ${summary.sell_count}`);
  }
  if (summary.average_disclosure_lag !== undefined && summary.average_disclosure_lag !== null) {
    pills.push(`Avg lag ${Number(summary.average_disclosure_lag).toFixed(1)}d`);
  }
  if (summary.risk_score !== undefined && summary.risk_score !== null) {
    pills.push(`Risk ${Number(summary.risk_score).toFixed(2)}`);
  }

  return pills;
}

function normalizeTradeItems(activity) {
  return asArray(activity?.recent_activity ?? activity?.trades ?? activity?.recent_trades).map((trade) => ({
    id: trade.id ?? `${trade.transaction_date ?? trade.disclosure_date ?? trade.date}-${trade.ticker ?? trade.issuer_name ?? trade.transaction_type}`,
    headline: trade.ticker || trade.issuer_name || trade.politician_name || "Trade",
    detail: trade.transaction_type || trade.amount_text || trade.summary || "Trade activity",
    date: trade.transaction_date ?? trade.disclosure_date ?? trade.date ?? trade.created_at ?? "n/a",
    signalId: trade.signal_id || trade.related_signal_id || trade.signal?.id,
    raw: trade,
  }));
}

function normalizeSignalItems(signals) {
  return asArray(signals).map((signal) => ({
    id: signal.id ?? `${signal.signal_date ?? signal.created_at ?? signal.ticker}-${signal.signal_type}`,
    headline: signal.ticker || signal.signal_type || "Signal",
    detail: signal.recommendation || signal.signal_reason || signal.summary || "Signal detail",
    date: signal.signal_date ?? signal.created_at ?? signal.date ?? "n/a",
    confidence: signal.confidence,
    raw: signal,
  }));
}

function normalizeHistory(historyPayload) {
  const history = asArray(historyPayload?.history ?? historyPayload?.series ?? historyPayload?.points ?? historyPayload);
  if (history.length) {
    return history;
  }

  return [];
}

function normalizeHistorySeries(history) {
  if (!history.length) {
    return [];
  }

  return Object.keys(history[0])
    .filter((key) => key !== "date" && key !== "timestamp" && key !== "day")
    .map((key, index) => ({
      key,
      name: key,
      color: ["#0f766e", "#c2410c", "#8b5cf6", "#2563eb"][index % 4],
    }));
}

export default function ResearchWorkspace({ initialPoliticianId = "", initialTicker = "", initialSignalId = "" }) {
  const [draft, setDraft] = useState({
    politicianId: initialPoliticianId,
    ticker: initialTicker,
    signalId: initialSignalId,
  });
  const [workspace, setWorkspace] = useState({
    politicianId: initialPoliticianId,
    ticker: initialTicker,
    signalId: initialSignalId,
  });
  const [politician, setPolitician] = useState(null);
  const [activity, setActivity] = useState(null);
  const [politicianSignals, setPoliticianSignals] = useState([]);
  const [stock, setStock] = useState(null);
  const [stockHistory, setStockHistory] = useState(null);
  const [selectedSignalDetail, setSelectedSignalDetail] = useState(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [selectedSignalLoading, setSelectedSignalLoading] = useState(false);
  const [selectedSignalError, setSelectedSignalError] = useState("");
  const [activityTab, setActivityTab] = useState("overview");

  useEffect(() => {
    if (initialPoliticianId || initialTicker || initialSignalId) {
      setDraft({
        politicianId: initialPoliticianId,
        ticker: initialTicker,
        signalId: initialSignalId,
      });
      setWorkspace({
        politicianId: initialPoliticianId,
        ticker: initialTicker,
        signalId: initialSignalId,
      });
    }
  }, [initialPoliticianId, initialTicker, initialSignalId]);

  useEffect(() => {
    if (!workspace.politicianId) {
      setPolitician(null);
      setActivity(null);
      setPoliticianSignals([]);
    }

    if (!workspace.ticker) {
      setStock(null);
      setStockHistory(null);
    }

    if (!workspace.politicianId && !workspace.ticker) {
      if (!workspace.signalId) {
        setSelectedSignalDetail(null);
      }
      setWorkspaceError("");
      setIsLoadingWorkspace(false);
      return;
    }

    let active = true;
    const hasProfileRequests = Boolean(workspace.politicianId || workspace.ticker);
    setIsLoadingWorkspace(hasProfileRequests);
    setWorkspaceError("");
    setSelectedSignalDetail(null);
    setSelectedSignalError("");

    const requests = [];

    if (workspace.politicianId) {
      requests.push(
        api.getPolitician(workspace.politicianId).then((result) => {
          if (active) {
            setPolitician(result);
          }
        }),
      );
      requests.push(
        api.getPoliticianActivity(workspace.politicianId, { limit: 12, tab: activityTab }).then((result) => {
          if (active) {
            setActivity(result);
          }
        }),
      );
      requests.push(
        api.getPoliticianSignals(workspace.politicianId, { limit: 12, tab: activityTab }).then((result) => {
          if (active) {
            setPoliticianSignals(asArray(result));
          }
        }),
      );
    }

    if (workspace.ticker) {
      requests.push(
        api.getStock(workspace.ticker).then((result) => {
          if (active) {
            setStock(result);
          }
        }),
      );
      requests.push(
        api.getStockHistory(workspace.ticker, "days=180&include_trades=true").then((result) => {
          if (active) {
            setStockHistory(result);
          }
        }),
      );
    }

    Promise.allSettled(requests).then((results) => {
      if (!active) {
        return;
      }

      const failure = results.find((result) => result.status === "rejected");
      if (failure) {
        setWorkspaceError(failure.reason?.message || "Unable to load workspace");
      }
      setIsLoadingWorkspace(false);
    });

      return () => {
      active = false;
    };
  }, [workspace.politicianId, workspace.ticker, activityTab]);

  useEffect(() => {
    if (!workspace.signalId) {
      return;
    }

    handleExplainSignal(workspace.signalId);
    // Only re-run when the requested signal changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.signalId]);

  const politicianPills = useMemo(() => activityPills(activity, politician || {}), [activity, politician]);
  const sectorExposure = useMemo(
    () => asBars(activity?.summary?.sector_exposure || activity?.sector_exposure || activity?.sector_breakdown || activity?.exposure_by_sector),
    [activity],
  );
  const lagDistribution = useMemo(
    () => asBars(activity?.summary?.lag_distribution || activity?.lag_distribution || activity?.lag_buckets || activity?.disclosure_lag_distribution),
    [activity],
  );
  const tradeItems = useMemo(() => normalizeTradeItems(activity), [activity]);
  const signalItems = useMemo(() => normalizeSignalItems(politicianSignals), [politicianSignals]);
  const history = useMemo(() => normalizeHistory(stockHistory), [stockHistory]);
  const historySeries = useMemo(() => normalizeHistorySeries(history), [history]);
  const compareSummary = useMemo(() => activity?.summary || stock?.model_scores || {}, [activity, stock]);

  const handleLoadWorkspace = () => {
    setWorkspace({
      politicianId: draft.politicianId.trim(),
      ticker: draft.ticker.trim().toUpperCase(),
      signalId: draft.signalId.trim(),
    });
  };

  const handleExplainSignal = (signalId) => {
    if (!signalId) {
      return;
    }

    setSelectedSignalLoading(true);
    setSelectedSignalError("");
    api
      .explainSignal(signalId)
      .then(setSelectedSignalDetail)
      .catch((error) => {
        setSelectedSignalError(error.message || "Unable to explain signal");
      })
      .finally(() => {
        setSelectedSignalLoading(false);
      });
  };

  return (
    <div className="page-grid">
      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <p className="eyebrow">Research workspace</p>
        <h2>Compose a politician and ticker in one view</h2>
        <p className="muted">
          Load a politician profile, activity timeline, related signals, stock profile, and price history without sharing any global state.
        </p>
        <div className="controls" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <label>
            Politician ID
            <input
              value={draft.politicianId}
              onChange={(event) => setDraft((current) => ({ ...current, politicianId: event.target.value }))}
              placeholder="123"
            />
          </label>
          <label>
            Ticker
            <input
              value={draft.ticker}
              onChange={(event) => setDraft((current) => ({ ...current, ticker: event.target.value }))}
              placeholder="AAPL"
            />
          </label>
          <label>
            Signal ID
            <input
              value={draft.signalId}
              onChange={(event) => setDraft((current) => ({ ...current, signalId: event.target.value }))}
              placeholder="Optional explainability target"
            />
          </label>
        </div>
        <div className="signal-toolbar">
          <button type="button" onClick={handleLoadWorkspace}>
            Load workspace
          </button>
          <span className="muted">
            {isLoadingWorkspace ? "Loading profiles, trades, signals, and market history..." : "Local state only, no shared store"}
          </span>
        </div>
        {workspaceError ? <p className="signal-error">{workspaceError}</p> : null}
      </section>

      {politician ? (
        <section className="card">
          <p className="eyebrow">Politician profile</p>
          <h3>{politician.full_name}</h3>
          <p className="muted">
            {politician.party} {politician.chamber} {politician.state}
          </p>
          <div className="pill-row">
            {politicianPills.map((pill) => (
              <span key={pill} className="pill">
                {pill}
              </span>
            ))}
          </div>
          <h4>Committee roles</h4>
          <div className="list">
            {asArray(politician.roles).map((role) => (
              <div key={`${role.committee_name}-${role.role_title}`} className="list-row">
                <div>
                  <strong>{role.committee_name}</strong>
                  <p className="muted">{role.role_title || "Member"}</p>
                </div>
                <span className="muted">{role.chamber || ""}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="card">
          <p className="eyebrow">Politician profile</p>
          <p className="muted">Enter a politician ID to view profile data and activity.</p>
        </section>
      )}

      {stock ? (
        <section className="card">
          <p className="eyebrow">Ticker profile</p>
          <h3>
            {stock.ticker} <span className="muted">{stock.issuer_name}</span>
          </h3>
          <p className="muted">{stock.sector || "Unknown sector"}</p>
          <div className="pill-row">
            <span className="pill">Trades {stock.trade_count}</span>
            <span className="pill">Politicians {stock.politician_count}</span>
            <span className="pill">Buys {stock.buy_count}</span>
            <span className="pill">Sells {stock.sell_count}</span>
          </div>
          <h4>Recent price history</h4>
          {history.length ? <SimpleLineChart data={history} series={historySeries.length ? historySeries : [{ key: "close", color: "#0f766e", name: "Close" }]} /> : <p className="muted">No recent price history found.</p>}
        </section>
      ) : (
        <section className="card">
          <p className="eyebrow">Ticker profile</p>
          <p className="muted">Enter a ticker to inspect the current issuer profile and history.</p>
        </section>
      )}

      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="signal-results-header">
          <div>
            <p className="eyebrow">Research detail</p>
            <h3>Activity, signals, and price context</h3>
          </div>
          <div className="pill-row" style={{ margin: 0 }}>
            {["overview", "trades", "signals"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActivityTab(tab)}
                style={{
                  background: activityTab === tab ? "var(--accent-2)" : "#f9f4ee",
                  color: activityTab === tab ? "white" : "var(--ink)",
                  border: `1px solid ${activityTab === tab ? "transparent" : "var(--line)"}`,
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {sectorExposure.length ? (
          <>
            <h4>Sector exposure</h4>
            <SimpleBarChart data={sectorExposure} xKey="label" yKey="value" color="#0f766e" />
          </>
        ) : null}

        {lagDistribution.length ? (
          <>
            <h4>Disclosure lag distribution</h4>
            <SimpleBarChart data={lagDistribution} xKey="label" yKey="value" color="#8b5cf6" />
          </>
        ) : null}

        {activityTab === "overview" ? (
          <>
            <h4>Recent activity</h4>
            <div className="list">
              {tradeItems.map((trade) => (
                <div key={trade.id} className="list-row">
                  <div>
                    <strong>{trade.headline}</strong>
                    <p className="muted">
                      {trade.detail} {trade.signalId ? " - explainable" : ""}
                    </p>
                  </div>
                  <span className="muted">{trade.date}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {activityTab === "trades" ? (
          <>
            <h4>Related trades</h4>
            <div className="list">
              {tradeItems.map((trade) => (
                <div key={trade.id} className="list-row">
                  <div>
                    <strong>{trade.headline}</strong>
                    <p className="muted">{trade.detail}</p>
                  </div>
                  <div>
                    <strong>{trade.date}</strong>
                    {trade.signalId ? (
                      <button type="button" onClick={() => handleExplainSignal(trade.signalId)} style={{ marginTop: "0.5rem" }}>
                        Explain signal
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {activityTab === "signals" ? (
          <>
            <h4>Related signals</h4>
            <div className="list">
              {signalItems.map((signal) => (
                <div key={signal.id} className="list-row">
                  <div>
                    <strong>{signal.headline}</strong>
                    <p className="muted">
                      {signal.detail} {signal.confidence !== undefined && signal.confidence !== null ? ` - ${(Number(signal.confidence) * 100).toFixed(0)}% confidence` : ""}
                    </p>
                  </div>
                  <div>
                    <strong>{signal.date}</strong>
                    <button type="button" onClick={() => handleExplainSignal(signal.id)} style={{ marginTop: "0.5rem" }}>
                      Explain
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {selectedSignalLoading ? <p className="muted">Loading signal explainability...</p> : null}
        {selectedSignalError ? <p className="signal-error">{selectedSignalError}</p> : null}
        {selectedSignalDetail ? <pre>{JSON.stringify(selectedSignalDetail, null, 2)}</pre> : null}

        {Object.keys(compareSummary).length ? (
          <>
            <h4>Combined snapshot</h4>
            <div className="pill-row">
              {Object.entries(compareSummary).map(([key, value]) => (
                <span key={key} className="pill">
                  {key}: {typeof value === "number" ? Number(value).toFixed(2) : String(value)}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
