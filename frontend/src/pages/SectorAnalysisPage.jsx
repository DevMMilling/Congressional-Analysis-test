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

// ── Shared Treemap ───────────────────────────────────────────────────────────

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

function SectorTreemap({ data, height = 380 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
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

// ── Sector Drill-Down Panel ──────────────────────────────────────────────────

function DrillDown({ sector, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    api
      .getSectorBreakdown(sector)
      .then(setData)
      .catch((err) => {
        if (err.message && err.message.includes("404")) {
          setError("not_found");
        } else {
          setError(err.message || "Unknown error");
        }
      })
      .finally(() => setLoading(false));
  }, [sector]);

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <button
          className="btn-ghost"
          onClick={onBack}
          style={{ marginRight: "1rem" }}
        >
          ← Back to overview
        </button>
        <span className="eyebrow" style={{ verticalAlign: "middle" }}>
          Selected sector
        </span>{" "}
        <strong style={{ fontSize: "1rem" }}>{sector}</strong>
      </div>

      {loading && (
        <div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      )}

      {error === "not_found" && (
        <div className="card">
          <div className="empty-state">
            <p style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
              Sector data not available yet
            </p>
            <p className="muted">
              Run an ingest and retrain first to populate sector breakdowns.
            </p>
          </div>
        </div>
      )}

      {error && error !== "not_found" && (
        <div className="error-state">{error}</div>
      )}

      {!loading && !error && data && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {/* Stats pills */}
          <div className="card">
            <h3>Overview — {sector}</h3>
            <div className="pill-row">
              <span className="pill">
                {(data.trade_count ?? 0).toLocaleString()} trades
              </span>
              <span className="pill green">
                {(data.buy_count ?? 0).toLocaleString()} buys
              </span>
              <span className="pill red">
                {(data.sell_count ?? 0).toLocaleString()} sells
              </span>
              {data.average_lag_days != null && (
                <span className="pill blue">
                  Avg lag: {Number(data.average_lag_days).toFixed(1)} days
                </span>
              )}
            </div>
          </div>

          {/* Top tickers */}
          {data.top_tickers && data.top_tickers.length > 0 && (
            <div className="card">
              <h3>Top Tickers in {sector}</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.top_tickers}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
                    <XAxis dataKey="ticker" stroke="#5f5348" />
                    <YAxis stroke="#5f5348" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Most active members */}
          {data.top_politicians && data.top_politicians.length > 0 && (
            <div className="card">
              <h3>Most Active Members</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={data.top_politicians}
                    layout="vertical"
                    margin={{ left: 16, right: 16, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ddd6cb" />
                    <XAxis type="number" stroke="#5f5348" />
                    <YAxis
                      type="category"
                      dataKey="politician"
                      stroke="#5f5348"
                      width={130}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div>
            <button className="btn-ghost" onClick={onBack}>
              ← Back to overview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sector Analysis Page ─────────────────────────────────────────────────────

export default function SectorAnalysisPage() {
  const [sectors, setSectors] = useState([]);
  const [sectorHeatmap, setSectorHeatmap] = useState([]);
  const [selectedSector, setSelectedSector] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  useEffect(() => {
    api
      .getSummary()
      .then((data) => {
        const heatmap = data.sector_heatmap || [];
        setSectorHeatmap(heatmap);
        setSectors(heatmap.map((s) => s.sector));
      })
      .catch((err) => setSummaryError(err.message))
      .finally(() => setSummaryLoading(false));
  }, []);

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <h1 className="page-title">Sector Analysis</h1>
      </div>

      {summaryLoading && (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      )}

      {summaryError && (
        <div className="error-state">{summaryError}</div>
      )}

      {!summaryLoading && !summaryError && (
        <>
          {/* ── Sector Pills ── */}
          {!selectedSector && (
            <>
              <p className="muted" style={{ marginBottom: "0.25rem", fontSize: "0.82rem" }}>
                Select a sector to drill down, or explore the heatmap below.
              </p>
              <div className="pill-row">
                {sectors.map((sector) => (
                  <button
                    key={sector}
                    onClick={() => setSelectedSector(sector)}
                    style={{
                      padding: "0.3rem 0.75rem",
                      borderRadius: "999px",
                      border: "none",
                      background: "#fff4ea",
                      color: "#9a3412",
                      fontSize: "0.82rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--accent)";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fff4ea";
                      e.currentTarget.style.color = "#9a3412";
                    }}
                  >
                    {sector}
                  </button>
                ))}
              </div>

              {/* ── Overview Treemap ── */}
              <div className="card" style={{ marginTop: "1rem" }}>
                <h3>All Sectors — Trade Volume</h3>
                <div className="chart-wrap-xl">
                  <SectorTreemap data={sectorHeatmap} height={380} />
                </div>
              </div>
            </>
          )}

          {/* ── Pill row even when drill-down is active (for navigation) ── */}
          {selectedSector && (
            <>
              <div className="pill-row" style={{ marginBottom: "1rem" }}>
                {sectors.map((sector) => (
                  <button
                    key={sector}
                    onClick={() => setSelectedSector(sector)}
                    style={{
                      padding: "0.3rem 0.75rem",
                      borderRadius: "999px",
                      border: "none",
                      background:
                        sector === selectedSector
                          ? "var(--accent)"
                          : "#fff4ea",
                      color:
                        sector === selectedSector ? "#fff" : "#9a3412",
                      fontSize: "0.82rem",
                      fontWeight: sector === selectedSector ? 600 : 500,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {sector}
                  </button>
                ))}
              </div>

              <DrillDown
                sector={selectedSector}
                onBack={() => setSelectedSector(null)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
