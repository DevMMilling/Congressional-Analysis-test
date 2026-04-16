import { useEffect, useState } from "react";
import { invokeAdminApi } from "./adminApi";

const statGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.75rem",
};

const statCardStyle = {
  border: "1px solid var(--line)",
  borderRadius: "18px",
  padding: "0.85rem",
  background: "rgba(255, 255, 255, 0.72)",
};

function formatDate(value) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderJobLabel(job) {
  if (!job) {
    return "No completed ingest job yet";
  }
  return `${job.job_type || "job"} - ${job.status || "unknown"}`;
}

export default function SystemStatusPanel({ refreshSignal = 0, onDataChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recipient, setRecipient] = useState("");
  const [dispatchResult, setDispatchResult] = useState(null);
  const [dispatchError, setDispatchError] = useState("");
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    invokeAdminApi("getSystemStatus", "System status API is not available yet")
      .then((data) => {
        if (active) {
          setStatus(data);
          setLastLoadedAt(new Date());
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError?.message || "Unable to load system status");
          setStatus(null);
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
  }, [refreshSignal]);

  const handleTestDispatch = async () => {
    setDispatchLoading(true);
    setDispatchError("");
    setDispatchResult(null);
    try {
      const response = await invokeAdminApi(
        "postTestDispatch",
        "Test dispatch API is not available yet",
        recipient.trim() || undefined,
      );
      setDispatchResult(response);
      onDataChange?.();
    } catch (dispatchFailure) {
      setDispatchError(dispatchFailure?.message || "Unable to send test dispatch");
    } finally {
      setDispatchLoading(false);
    }
  };

  const latestJob = status?.latest_completed_ingest_job;

  return (
    <section className="card controls">
      <div className="signal-results-header">
        <div>
          <p className="eyebrow">System freshness</p>
          <h2>Latest data snapshot</h2>
        </div>
        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
          <span className="pill">{loading ? "Refreshing" : "Current"}</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
        <p className="muted" style={{ margin: 0 }}>
          {lastLoadedAt ? `Updated ${formatDateTime(lastLoadedAt)}` : "Waiting for the first refresh."}
        </p>
        <button type="button" onClick={() => onDataChange?.()} disabled={loading}>
          Refresh snapshot
        </button>
      </div>

      {error ? <p className="signal-error">{error}</p> : null}

      {status ? (
        <>
          <div style={statGridStyle}>
            <div style={statCardStyle}>
              <p className="eyebrow">Trade disclosures</p>
              <strong>{formatDate(status.latest_trade_disclosure_date)}</strong>
            </div>
            <div style={statCardStyle}>
              <p className="eyebrow">Market bars</p>
              <strong>{formatDate(status.latest_market_bar_date)}</strong>
            </div>
            <div style={statCardStyle}>
              <p className="eyebrow">Signals indexed</p>
              <strong>{status.signal_count ?? 0}</strong>
            </div>
            <div style={statCardStyle}>
              <p className="eyebrow">Alert subscriptions</p>
              <strong>{status.subscription_count ?? 0}</strong>
            </div>
          </div>

          <div style={{ ...statCardStyle, gridColumn: "1 / -1" }}>
            <p className="eyebrow">Latest retrain</p>
            <strong>{formatDateTime(status.latest_model_retrain_at)}</strong>
          </div>

          <div style={{ ...statCardStyle, gridColumn: "1 / -1" }}>
            <p className="eyebrow">Most recent ingest</p>
            <strong>{renderJobLabel(latestJob)}</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              {latestJob
                ? `Started ${formatDateTime(latestJob.started_at)} - Finished ${formatDateTime(latestJob.finished_at)}`
                : "No completed ingest job has been recorded yet."}
            </p>
            {latestJob?.message ? <p className="muted">{latestJob.message}</p> : null}
          </div>
        </>
      ) : null}

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: "0.85rem" }}>
        <p className="eyebrow">Test alert dispatch</p>
        <p className="muted">Send a one-off alert to verify SMTP and local alert history recording.</p>
        <label>
          Recipient email
          <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="ops@example.com" />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button type="button" onClick={handleTestDispatch} disabled={dispatchLoading}>
            {dispatchLoading ? "Sending..." : "Send test alert"}
          </button>
          <span className="muted">{status?.latest_completed_ingest_job ? "Freshness loaded" : "Ready"}</span>
        </div>
        {dispatchError ? <p className="signal-error">{dispatchError}</p> : null}
        {dispatchResult ? <pre>{JSON.stringify(dispatchResult, null, 2)}</pre> : null}
      </div>
    </section>
  );
}
