import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(val, decimals = 1) {
  if (val == null) return "—";
  return (val * 100).toFixed(decimals) + "%";
}

function fmt(val, decimals = 2) {
  if (val == null) return "—";
  return Number(val).toFixed(decimals);
}

const SIGNAL_COLORS = {
  high_confidence: "#059669",
  cluster: "#1d4ed8",
  unusual: "#d97706",
  insider: "#dc2626",
};

function signalColor(type) {
  return SIGNAL_COLORS[type] || "#7c3aed";
}

// ── Model Metric Cards ───────────────────────────────────────────────────────

function ModelMetrics({ report, onRetrain, retraining }) {
  if (!report) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
        <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
          ML Model
        </p>
        <p
          style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: "0.5rem" }}
        >
          No model trained yet
        </p>
        <p className="muted" style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
          Train a model to see AUC, RMSE and performance metrics here.
        </p>
        <button onClick={onRetrain} disabled={retraining}>
          {retraining ? "Training…" : "Train Model"}
        </button>
      </div>
    );
  }

  return (
    <div className="metrics-row" style={{ marginBottom: "1.25rem" }}>
      <div className="card metric-card">
        <p className="eyebrow">Classifier AUC</p>
        <div
          className="metric-value"
          style={{
            color:
              report.classifier_auc >= 0.7
                ? "var(--green)"
                : report.classifier_auc >= 0.6
                ? "#d97706"
                : "var(--red)",
          }}
        >
          {fmt(report.classifier_auc, 3)}
        </div>
        <p className="muted metric-delta">
          {report.classifier_auc >= 0.7 ? "Good" : report.classifier_auc >= 0.6 ? "Fair" : "Weak"}
        </p>
      </div>
      <div className="card metric-card">
        <p className="eyebrow">Regressor RMSE</p>
        <div className="metric-value">{fmt(report.regressor_rmse, 4)}</div>
        {report.regressor_mae != null && (
          <p className="muted metric-delta">MAE: {fmt(report.regressor_mae, 4)}</p>
        )}
      </div>
      <div className="card metric-card">
        <p className="eyebrow">Last Trained</p>
        <div
          className="metric-value"
          style={{ fontSize: "1.1rem", paddingTop: "0.35rem" }}
        >
          {report.trained_at
            ? new Date(report.trained_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </div>
        <button
          className="btn-ghost btn-sm"
          onClick={onRetrain}
          disabled={retraining}
          style={{ marginTop: "0.5rem" }}
        >
          {retraining ? "Training…" : "Retrain"}
        </button>
      </div>
    </div>
  );
}

// ── Backtest Section ─────────────────────────────────────────────────────────

function BacktestSection({ data }) {
  if (!data) {
    return (
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h3>Backtest Performance</h3>
        <div className="empty-state">No backtest data available.</div>
      </div>
    );
  }

  const comparisonData = [
    {
      name: "Strategy",
      value: data.cumulative_return != null ? Number((data.cumulative_return * 100).toFixed(2)) : 0,
    },
    {
      name: "Benchmark (SPY)",
      value: data.benchmark_return != null ? Number((data.benchmark_return * 100).toFixed(2)) : 0,
    },
  ];

  const strategyAhead = (data.cumulative_return ?? 0) >= (data.benchmark_return ?? 0);

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <h3>Backtest Performance</h3>

      {/* 4 inline stats */}
      <div className="stat-row" style={{ marginBottom: "1rem" }}>
        <div className="stat-item">
          <p className="stat-label">Strategy Return</p>
          <p
            className="stat-value"
            style={{ color: strategyAhead ? "var(--green)" : "var(--red)" }}
          >
            {pct(data.cumulative_return)}
          </p>
        </div>
        <div className="stat-item">
          <p className="stat-label">Benchmark Return</p>
          <p className="stat-value">{pct(data.benchmark_return)}</p>
        </div>
        <div className="stat-item">
          <p className="stat-label">Hit Rate</p>
          <p
            className="stat-value"
            style={{
              color: (data.hit_rate ?? 0) >= 0.5 ? "var(--green)" : "var(--red)",
            }}
          >
            {pct(data.hit_rate)}
          </p>
        </div>
        <div className="stat-item">
          <p className="stat-label">Sharpe Ratio</p>
          <p
            className="stat-value"
            style={{
              color:
                data.sharpe_ratio == null
                  ? "var(--ink)"
                  : data.sharpe_ratio >= 1
                  ? "var(--green)"
                  : data.sharpe_ratio >= 0
                  ? "#d97706"
                  : "var(--red)",
            }}
          >
            {data.sharpe_ratio != null ? fmt(data.sharpe_ratio, 2) : "—"}
          </p>
        </div>
      </div>

      {/* Side-by-side comparison bar chart */}
      <div className="chart-wrap-sm" style={{ marginBottom: "1rem" }}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={comparisonData} barCategoryGap="40%">
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
            <XAxis dataKey="name" stroke="#5f5348" />
            <YAxis stroke="#5f5348" tickFormatter={(v) => v + "%"} />
            <Tooltip formatter={(v) => [v + "%", "Return"]} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {comparisonData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? (strategyAhead ? "#059669" : "#dc2626") : "#64748b"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Max drawdown + volatility pills */}
      <div className="pill-row">
        {data.max_drawdown != null && (
          <span className="pill red">
            Max Drawdown: {pct(data.max_drawdown)}
          </span>
        )}
        {data.annualized_volatility != null && (
          <span className="pill blue">
            Annualized Volatility: {pct(data.annualized_volatility)}
          </span>
        )}
        {data.trade_count != null && (
          <span className="pill">
            {data.trade_count} signal trades
          </span>
        )}
      </div>
    </div>
  );
}

// ── Signal Win Rates ─────────────────────────────────────────────────────────

function SignalWinRates({ data }) {
  if (!data || !data.by_type || data.by_type.length === 0) {
    return (
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h3>Signal Win Rates</h3>
        <div className="empty-state">No signal data available.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <h3>Signal Win Rates</h3>
      <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
        {data.total_signals ?? 0} total signals across {data.by_type.length} type
        {data.by_type.length !== 1 ? "s" : ""}
      </p>

      <div className="chart-wrap-sm" style={{ marginBottom: "1rem" }}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={data.by_type}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
            <XAxis type="number" stroke="#5f5348" />
            <YAxis
              type="category"
              dataKey="signal_type"
              stroke="#5f5348"
              width={110}
              tick={{ fontSize: 11 }}
            />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
              {data.by_type.map((entry, index) => (
                <Cell
                  key={`sig-${index}`}
                  fill={signalColor(entry.signal_type)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Avg confidence per type */}
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {data.by_type.map((item) => (
          <div
            key={item.signal_type}
            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: signalColor(item.signal_type),
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "0.85rem", flex: 1 }}>
              {item.signal_type}
            </span>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {item.avg_confidence != null
                ? `Avg confidence: ${pct(item.avg_confidence)}`
                : "No confidence data"}
            </span>
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: signalColor(item.signal_type),
              }}
            >
              {item.count} signals
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Trade Ledger ─────────────────────────────────────────────────────────────

function TradeLedger({ ledger }) {
  if (!ledger || ledger.length === 0) return null;

  const rows = ledger.slice(0, 10);

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <h3>Recent Trade Ledger</h3>
      <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
        Top {rows.length} of {ledger.length} signal trades
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Net Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const ret = row.net_return ?? row.return ?? null;
              const isPositive = ret != null && ret >= 0;
              return (
                <tr key={row.signal_id ?? i}>
                  <td>
                    <strong>{row.ticker || "—"}</strong>
                  </td>
                  <td>{row.entry_date || row.signal_date || "—"}</td>
                  <td>{row.exit_date || "—"}</td>
                  <td
                    style={{
                      fontWeight: 600,
                      color:
                        ret == null
                          ? "var(--muted)"
                          : isPositive
                          ? "var(--green)"
                          : "var(--red)",
                    }}
                  >
                    {ret != null ? pct(ret, 2) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Model Performance Page ───────────────────────────────────────────────────

export default function ModelPerformancePage() {
  const [modelReport, setModelReport] = useState(null);
  const [modelError, setModelError] = useState(null);
  const [signalsSummary, setSignalsSummary] = useState(null);
  const [backtest, setBacktest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getModelReport().catch((err) => {
        setModelError(err.message);
        return null;
      }),
      api.getSignalsSummary().catch(() => null),
      api.getBacktest().catch(() => null),
    ])
      .then(([report, signals, bt]) => {
        setModelReport(report);
        setSignalsSummary(signals);
        setBacktest(bt);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRetrain = () => {
    setRetraining(true);
    setRetrainMsg(null);
    api
      .postRetrain()
      .then(() => {
        setRetrainMsg("Retraining started. Refresh the page in a moment to see updated metrics.");
        // Re-fetch report after a brief wait
        setTimeout(() => {
          api
            .getModelReport()
            .then((r) => {
              setModelReport(r);
              setModelError(null);
            })
            .catch(() => {});
        }, 3000);
      })
      .catch((err) => setRetrainMsg("Retrain failed: " + err.message))
      .finally(() => setRetraining(false));
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Model Performance</h1>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton-row" />
        ))}
      </div>
    );
  }

  // Determine if model is missing (404 or null)
  const modelMissing =
    !modelReport ||
    (modelError && modelError.includes("404"));

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <h1 className="page-title">Model Performance</h1>
      </div>

      {retrainMsg && (
        <div
          className={retrainMsg.startsWith("Retrain failed") ? "error-state" : "card"}
          style={{ marginBottom: "1.25rem", fontSize: "0.88rem" }}
        >
          {retrainMsg}
        </div>
      )}

      {/* ── Model Metric Cards (or "No model" state) ── */}
      <ModelMetrics
        report={modelMissing ? null : modelReport}
        onRetrain={handleRetrain}
        retraining={retraining}
      />

      {/* Show feature columns if available */}
      {!modelMissing && modelReport?.feature_columns?.length > 0 && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3>Feature Columns</h3>
          <div className="pill-row">
            {modelReport.feature_columns.map((col) => (
              <span key={col} className="pill purple">
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Backtest Performance ── */}
      <BacktestSection data={backtest} />

      {/* ── Signal Win Rates ── */}
      <SignalWinRates data={signalsSummary} />

      {/* ── Trade Ledger ── */}
      {backtest && (backtest.ledger || backtest.trade_ledger) && (
        <TradeLedger ledger={backtest.ledger || backtest.trade_ledger} />
      )}
    </div>
  );
}