import { useEffect, useMemo, useState } from "react";
import { invokeAdminApi } from "./adminApi";

const statusOptions = ["", "sent", "failed", "smtp_disabled"];

function formatDateTime(value) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function statusPillStyle(status) {
  const styles = {
    sent: { background: "#dcfce7", color: "#166534" },
    failed: { background: "#fee2e2", color: "#991b1b" },
    smtp_disabled: { background: "#fef3c7", color: "#92400e" },
  };
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "7.5rem",
    padding: "0.45rem 0.7rem",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: 600,
    ...(styles[status] || { background: "#e5e7eb", color: "#374151" }),
  };
}

export default function AlertHistoryPanel({ refreshSignal = 0 }) {
  const [history, setHistory] = useState([]);
  const [filters, setFilters] = useState({
    limit: "20",
    subscription_id: "",
    status: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(
    () => ({
      limit: Number(filters.limit) || 20,
      subscription_id: filters.subscription_id.trim() ? Number(filters.subscription_id) : undefined,
      status: filters.status || undefined,
    }),
    [filters],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    invokeAdminApi("getAlertHistory", "Alert history API is not available yet", query)
      .then((data) => {
        if (active) {
          setHistory(Array.isArray(data) ? data : []);
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError?.message || "Unable to load alert history");
          setHistory([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [query, refreshSignal]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="card controls">
      <div className="signal-results-header">
        <div>
          <p className="eyebrow">Alert history</p>
          <h2>Delivery center</h2>
        </div>
        <span className="pill">{loading ? "Loading" : `${history.length} events`}</span>
      </div>

      <div className="signal-toolbar" style={{ marginTop: 0 }}>
        <button type="button" onClick={() => setFilters((current) => ({ ...current }))}>
          Refresh history
        </button>
        <span className="muted">Filter recent delivery attempts by subscription and status.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.85rem" }}>
        <label>
          Limit
          <input type="number" min="1" max="200" value={filters.limit} onChange={(event) => updateFilter("limit", event.target.value)} />
        </label>
        <label>
          Subscription ID
          <input value={filters.subscription_id} onChange={(event) => updateFilter("subscription_id", event.target.value)} placeholder="12" />
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            {statusOptions.map((option) => (
              <option key={option || "all"} value={option}>
                {option ? option.replace("_", " ") : "All statuses"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="signal-error">{error}</p> : null}

      <div className="table-like" style={{ overflowX: "auto" }}>
        <div className="table-head" style={{ minWidth: "780px" }}>
          <span>Time</span>
          <span>Subscription</span>
          <span>Signal</span>
          <span>Ticker</span>
          <span>Status</span>
        </div>
        {!loading && !error && history.length === 0 ? <p className="muted signal-empty">No alert history matched the current filters.</p> : null}
        {history.map((entry) => (
          <div className="table-row" key={entry.id} style={{ minWidth: "780px" }}>
            <span>{formatDateTime(entry.created_at || entry.sent_at)}</span>
            <span>{entry.subscription_email || entry.subscription_id || "n/a"}</span>
            <span>{entry.signal_type || "test"}</span>
            <span>{entry.ticker || "n/a"}</span>
            <span>
              <span style={statusPillStyle(entry.status)}>{entry.status}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
