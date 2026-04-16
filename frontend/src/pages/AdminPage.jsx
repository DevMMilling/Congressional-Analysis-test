import { useState } from "react";
import { api } from "../api";

export default function AdminPage() {
  const [jobResponse, setJobResponse] = useState(null);
  const [running, setRunning] = useState("");
  const [form, setForm] = useState({ email: "", minimum_confidence: 0.7 });

  async function run(label, fn) {
    setRunning(label);
    setJobResponse(null);
    try {
      const res = await fn();
      setJobResponse(res);
    } catch (err) {
      setJobResponse({ error: err.message });
    } finally {
      setRunning("");
    }
  }

  const submitSubscription = async () => {
    const response = await api.createSubscription({
      email: form.email,
      enabled: true,
      minimum_confidence: Number(form.minimum_confidence),
      signal_types: ["high_confidence", "clustered_activity", "unusual_buying"],
    });
    setJobResponse({ message: `Subscription created for ${response.email}` });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="muted dashboard-subtitle">Data operations, sector enrichment, and alert subscriptions.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem" }}>

        {/* Data operations */}
        <section className="card">
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Data Operations</p>
          <h2 style={{ marginBottom: "1rem" }}>Refresh & retrain</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <button
              onClick={() => run("backfill", api.postBackfill)}
              disabled={!!running}
              title="Scrape Capitol Trades (last 3 pages), refresh market data, retrain models and rebuild signals"
            >
              {running === "backfill" ? "Running…" : "Run historical backfill"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => run("update", api.postUpdate)}
              disabled={!!running}
              title="Scrape the latest Capitol Trades page and update market data incrementally"
            >
              {running === "update" ? "Running…" : "Run incremental update"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => run("retrain", api.postRetrain)}
              disabled={!!running}
              title="Retrain the ML prediction models on current data"
            >
              {running === "retrain" ? "Running…" : "Retrain models"}
            </button>
            <button
              className="btn-green"
              onClick={() => run("sectors", api.postEnrichSectors)}
              disabled={!!running}
              title="Fetch sector and industry data from Yahoo Finance for all tickers that are missing it — needed for the Sectors page and stock filters"
            >
              {running === "sectors" ? "Enriching sectors…" : "Enrich sector data (yfinance)"}
            </button>
          </div>
          {jobResponse && (
            <div style={{ marginTop: "1rem" }}>
              <p className="eyebrow" style={{ marginBottom: "0.4rem" }}>Result</p>
              <pre style={{ fontSize: "0.78rem", maxHeight: 200, overflow: "auto" }}>
                {JSON.stringify(jobResponse, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {/* Alert subscriptions */}
        <section className="card">
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Alerts</p>
          <h2 style={{ marginBottom: "1rem" }}>Email subscription</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                placeholder="you@example.com"
                title="Email to receive trading signal alerts"
              />
            </label>
            <label>
              Minimum confidence (0–1)
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={form.minimum_confidence}
                onChange={(e) => setForm((c) => ({ ...c, minimum_confidence: e.target.value }))}
                title="Only receive alerts for signals above this confidence threshold"
              />
            </label>
            <button
              onClick={submitSubscription}
              disabled={!form.email}
              title="Subscribe this email to receive automated trading signal alerts"
            >
              Create alert subscription
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
