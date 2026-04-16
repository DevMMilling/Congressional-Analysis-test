import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function SignalsPage() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    signal_type: "",
    ticker: "",
    politician_id: "",
    min_confidence: "0",
    limit: "100",
  });

  const query = useMemo(
    () => ({
      signal_type: filters.signal_type,
      ticker: filters.ticker.trim().toUpperCase(),
      politician_id: filters.politician_id.trim(),
      min_confidence: filters.min_confidence,
      limit: filters.limit,
    }),
    [filters],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .getSignals(query)
      .then((data) => {
        if (active) {
          setSignals(data);
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message || "Unable to load signals");
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
  }, [query]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const resetFilters = () => {
    setFilters({
      signal_type: "",
      ticker: "",
      politician_id: "",
      min_confidence: "0",
      limit: "100",
    });
  };

  return (
    <div className="signals-layout">
      <section className="card signal-filters">
        <p className="eyebrow">Signal ranking</p>
        <h2>Filter the signal feed</h2>
        <p className="muted">Refine by type, ticker, politician ID, confidence, and result count.</p>
        <div className="controls signal-controls">
          <label>
            Signal type
            <select value={filters.signal_type} onChange={(event) => updateFilter("signal_type", event.target.value)}>
              <option value="">All types</option>
              <option value="high_confidence">High confidence</option>
              <option value="clustered_activity">Clustered activity</option>
              <option value="unusual_buying">Unusual buying</option>
              <option value="insider_risk">Insider risk</option>
            </select>
          </label>
          <label>
            Ticker
            <input
              value={filters.ticker}
              onChange={(event) => updateFilter("ticker", event.target.value)}
              placeholder="AAPL"
            />
          </label>
          <label>
            Politician ID
            <input
              value={filters.politician_id}
              onChange={(event) => updateFilter("politician_id", event.target.value)}
              placeholder="123"
            />
          </label>
          <label>
            Minimum confidence
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={filters.min_confidence}
              onChange={(event) => updateFilter("min_confidence", event.target.value)}
            />
          </label>
          <label>
            Result limit
            <input
              type="number"
              min="1"
              max="500"
              step="1"
              value={filters.limit}
              onChange={(event) => updateFilter("limit", event.target.value)}
            />
          </label>
        </div>
        <div className="signal-toolbar">
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
          <span className="muted">{loading ? "Refreshing signals..." : `${signals.length} results loaded`}</span>
        </div>
      </section>

      <section className="card">
        <div className="signal-results-header">
          <div>
            <p className="eyebrow">Actionable feed</p>
            <h2>Signals</h2>
          </div>
          <span className="pill">{loading ? "Loading" : "Live query"}</span>
        </div>
        {error ? <p className="signal-error">{error}</p> : null}
        <div className="table-like">
          <div className="table-head">
            <span>Date</span>
            <span>Type</span>
            <span>Ticker</span>
            <span>Confidence</span>
            <span>Action</span>
          </div>
          {!loading && !error && signals.length === 0 ? <p className="muted signal-empty">No signals match the current filters.</p> : null}
          {signals.map((signal) => (
            <div className="table-row" key={signal.id}>
              <span>{signal.signal_date}</span>
              <span>{signal.signal_type}</span>
              <span>{signal.ticker || "n/a"}</span>
              <span>{((signal.confidence || 0) * 100).toFixed(0)}%</span>
              <span>{signal.recommendation || "watch"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
