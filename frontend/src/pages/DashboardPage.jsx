import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";

// ── Sector Treemap ──────────────────────────────────────────────────────────

const SECTOR_COLORS = [
  "#c2410c",
  "#ea580c",
  "#f97316",
  "#0f766e",
  "#0d9488",
  "#14b8a6",
  "#7c3aed",
  "#8b5cf6",
  "#a78bfa",
  "#059669",
  "#10b981",
  "#d97706",
];

function CustomTreemapContent({
  x,
  y,
  width,
  height,
  name,
  value,
  depth,
  colors,
  index,
}) {
  if (depth !== 1 || width < 40) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={colors[index % colors.length]}
        fillOpacity={0.85}
        stroke="#fff"
        strokeWidth={2}
        rx={6}
      />
      {width > 60 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={Math.min(12, width / 8)}
          fontWeight={600}
        >
          {name}
        </text>
      )}
      {width > 60 && height > 50 && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 16}
          textAnchor="middle"
          fill="rgba(255,255,255,0.8)"
          fontSize={10}
        >
          {value}
        </text>
      )}
    </g>
  );
}

function SectorTreemap({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <Treemap
        data={data}
        dataKey="count"
        nameKey="sector"
        aspectRatio={4 / 3}
        content={<CustomTreemapContent colors={SECTOR_COLORS} />}
      >
        <Tooltip formatter={(v, n) => [v + " trades", n]} />
      </Treemap>
    </ResponsiveContainer>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pct(val) {
  return (val * 100).toFixed(1) + "%";
}

// ── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.getSummary(),
      api.getSystemStatus().catch(() => null),
    ])
      .then(([s, st]) => {
        setSummary(s);
        setSystemStatus(st);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="content" style={{ padding: 0 }}>
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton-row" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="error-state">{error}</div>
      </div>
    );
  }

  const { metrics, prediction_counter, sector_heatmap, lag_distribution, top_traders, top_stocks } = summary;

  const isRecent = systemStatus?.status === "ok" || systemStatus?.recent_data === true;

  // Build 4 primary metric cards in canonical order
  const metricOrder = ["Trades", "Politicians", "Tickers", "Signals"];
  const metricsMap = Object.fromEntries((metrics || []).map((m) => [m.label, m.value]));

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isRecent ? "var(--green)" : "#9ca3af",
              display: "inline-block",
              boxShadow: isRecent ? "0 0 6px var(--green)" : "none",
            }}
          />
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {isRecent ? "Live data" : "No recent data"}
          </span>
        </div>
      </div>

      {/* ── 4 Metric Cards ── */}
      <div className="metrics-row" style={{ marginBottom: "1.25rem" }}>
        {metricOrder.map((label) => (
          <div key={label} className="card metric-card">
            <p className="eyebrow">{label}</p>
            <div className="metric-value">{(metricsMap[label] ?? 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* ── Prediction Counter Hero ── */}
      <div className="card full-width" style={{ marginBottom: "1.25rem" }}>
        <p className="eyebrow">Strategy Performance</p>
        <h2 style={{ margin: "0.25rem 0 0.75rem" }}>Prediction Counter</h2>
        <div className="stat-row">
          <div className="stat-item">
            <p className="stat-label">Strategy Return</p>
            <p
              className="stat-value"
              style={{
                color:
                  prediction_counter.cumulative_return >= prediction_counter.benchmark_return
                    ? "var(--green)"
                    : "var(--red)",
              }}
            >
              {pct(prediction_counter.cumulative_return)}
            </p>
          </div>
          <div className="stat-item">
            <p className="stat-label">Benchmark (SPY)</p>
            <p className="stat-value">{pct(prediction_counter.benchmark_return)}</p>
          </div>
          <div className="stat-item">
            <p className="stat-label">Hit Rate</p>
            <p
              className="stat-value"
              style={{
                color: prediction_counter.hit_rate >= 0.5 ? "var(--green)" : "var(--red)",
              }}
            >
              {pct(prediction_counter.hit_rate)}
            </p>
          </div>
          <div className="stat-item">
            <p className="stat-label">Signal Trades</p>
            <p className="stat-value">{prediction_counter.trade_count}</p>
          </div>
        </div>
        <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>
          Strategy outperforms benchmark by{" "}
          <strong>
            {pct(prediction_counter.cumulative_return - prediction_counter.benchmark_return)}
          </strong>{" "}
          over {prediction_counter.trade_count} tracked signal trades.
        </p>
      </div>

      {/* ── Row 1: Sector Heatmap + Lag Distribution ── */}
      <div className="dashboard-grid" style={{ marginBottom: "1.25rem" }}>
        <div className="card">
          <h3>Sector Heatmap</h3>
          <SectorTreemap data={sector_heatmap || []} />
        </div>
        <div className="card">
          <h3>Disclosure Lag Distribution</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={lag_distribution || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
                <XAxis dataKey="bucket" stroke="#5f5348" />
                <YAxis stroke="#5f5348" />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Row 2: Top Traders + Most Traded Stocks ── */}
      <div className="dashboard-grid">
        <div className="card">
          <h3>Top Congressional Traders</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={top_traders || []}
                layout="vertical"
                margin={{ left: 16, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
                <XAxis type="number" stroke="#5f5348" />
                <YAxis
                  type="category"
                  dataKey="politician"
                  stroke="#5f5348"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="trade_count" fill="#0f766e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Most Traded Stocks</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top_stocks || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
                <XAxis dataKey="ticker" stroke="#5f5348" />
                <YAxis stroke="#5f5348" />
                <Tooltip />
                <Bar dataKey="trade_count" fill="#c2410c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}