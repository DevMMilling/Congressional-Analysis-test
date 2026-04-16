import { useEffect, useMemo, useState } from "react";
import { invokeAdminApi } from "./adminApi";

function formatDateTime(value) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function statusStyle(status) {
  const colors = {
    completed: { background: "#dcfce7", color: "#166534" },
    running: { background: "#dbeafe", color: "#1d4ed8" },
    queued: { background: "#e0e7ff", color: "#4338ca" },
    failed: { background: "#fee2e2", color: "#991b1b" },
  };
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "7rem",
    padding: "0.45rem 0.7rem",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: 600,
    ...(colors[status] || { background: "#e5e7eb", color: "#374151" }),
  };
}

export default function JobRunTable({ refreshSignal = 0 }) {
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState("10");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedJobId, setSelectedJobId] = useState(null);

  const queryLimit = useMemo(() => Number(limit) || 10, [limit]);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0] || null;

  useEffect(() => {
    let active = true;

    const loadJobs = () => {
      setLoading(true);
      setError("");
      invokeAdminApi("getJobs", "Jobs API is not available yet", queryLimit)
        .then((data) => {
          if (active) {
            const nextJobs = Array.isArray(data) ? data : [];
            setJobs(nextJobs);
            setSelectedJobId((current) => (current && nextJobs.some((job) => job.id === current) ? current : nextJobs[0]?.id ?? null));
          }
        })
        .catch((fetchError) => {
          if (active) {
            setError(fetchError?.message || "Unable to load job history");
            setJobs([]);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    };

    loadJobs();
    const intervalId = window.setInterval(loadJobs, 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [queryLimit, refreshSignal]);

  return (
    <section className="card controls">
      <div className="signal-results-header">
        <div>
          <p className="eyebrow">Job history</p>
          <h2>Recent runs</h2>
        </div>
        <span className="pill">{loading ? "Loading" : `${jobs.length} jobs`}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <label style={{ maxWidth: "140px" }}>
          Limit
          <input type="number" min="1" max="200" value={limit} onChange={(event) => setLimit(event.target.value)} />
        </label>
        <span className="muted">Auto-refreshes every 30 seconds and after admin actions.</span>
      </div>

      {error ? <p className="signal-error">{error}</p> : null}

      <div className="table-like" style={{ overflowX: "auto" }}>
        <div className="table-head" style={{ minWidth: "820px" }}>
          <span>Job</span>
          <span>Status</span>
          <span>Started</span>
          <span>Finished</span>
          <span>Message</span>
        </div>
        {!loading && !error && jobs.length === 0 ? <p className="muted signal-empty">No job runs have been recorded yet.</p> : null}
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className="button-link table-row"
            onClick={() => setSelectedJobId(job.id)}
            style={{
              minWidth: "820px",
              cursor: "pointer",
              textAlign: "left",
              background: selectedJob?.id === job.id ? "rgba(255, 244, 234, 0.9)" : "transparent",
            }}
          >
            <span>{job.job_type}</span>
            <span>
              <span style={statusStyle(job.status)}>{job.status}</span>
            </span>
            <span>{formatDateTime(job.started_at)}</span>
            <span>{formatDateTime(job.finished_at)}</span>
            <span>{job.message || "n/a"}</span>
          </button>
        ))}
      </div>

      {selectedJob ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "0.85rem" }}>
          <p className="eyebrow">Selected run</p>
          <pre>{JSON.stringify(selectedJob, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}
