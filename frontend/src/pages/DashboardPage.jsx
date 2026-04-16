import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";

// ── Colours ──────────────────────────────────────────────────────────────────
const SECTOR_COLORS = [
  "#f78166", "#e05a3f", "#f0883e",
  "#3fb950", "#56d364", "#26a641",
  "#a371f7", "#8b5cf6", "#7c3aed",
  "#58a6ff", "#d29922", "#ff7b72",
];

const PIE_COLORS = ["#f78166", "#3fb950", "#a371f7", "#58a6ff", "#d29922", "#f85149"];

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 12,
  },
  labelStyle: { color: "#7d8590" },
  itemStyle: { color: "#e6edf3" },
};

// ── Time range presets ────────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: "7D",  title: "Show data from the last 7 days",       days: 7 },
  { label: "30D", title: "Show data from the last 30 days",      days: 30 },
  { label: "1Q",  title: "Show data from the last quarter (91 days)",  days: 91 },
  { label: "2Q",  title: "Show data from the last 2 quarters",   days: 182 },
  { label: "3Q",  title: "Show data from the last 3 quarters",   days: 274 },
  { label: "YTD", title: "Show data from January 1st this year", ytd: true },
  { label: "1Y",  title: "Show data from the last 12 months",    days: 365 },
];

function toISODate(d) {
  return d.toISOString().split("T")[0];
}

function getRangeFrom(range) {
  const now = new Date();
  if (range.ytd) {
    return toISODate(new Date(now.getFullYear(), 0, 1));
  }
  if (range.days) {
    const d = new Date(now);
    d.setDate(d.getDate() - range.days);
    return toISODate(d);
  }
  return "";
}

// ── Default filters ───────────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
  politician_search: "",
  ticker: "",
  party: "",
  chamber: "",
  state: "",
  transaction_type: "",
  owner_type: "",
  sector: "",
  date_from: "",
  date_to: "",
};

const integerFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

// ── Custom treemap cell ───────────────────────────────────────────────────────
function CustomTreemapContent({ x, y, width, height, name, value, depth, colors, index }) {
  if (depth !== 1 || width < 36) return null;
  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill={colors[index % colors.length]}
        fillOpacity={0.85}
        stroke="rgba(13,17,23,0.6)"
        strokeWidth={2}
        rx={6}
      />
      {width > 64 && height > 34 ? (
        <text
          x={x + width / 2} y={y + height / 2 - 6}
          textAnchor="middle" dominantBaseline="middle"
          fill="#fff" fontSize={Math.min(13, width / 7)} fontWeight={700}
        >
          {name}
        </text>
      ) : null}
      {width > 64 && height > 54 ? (
        <text
          x={x + width / 2} y={y + height / 2 + 12}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)" fontSize={10}
        >
          {integerFormatter.format(value)}
        </text>
      ) : null}
    </g>
  );
}

// ── Guide sheet ───────────────────────────────────────────────────────────────
function GuideSheet({ open }) {
  if (!open) return null;
  return (
    <section className="card dashboard-guide-card">
      <div className="dashboard-guide-header">
        <div>
          <p className="eyebrow">Field Guide</p>
          <h2 style={{ margin: "0.2rem 0 0.35rem" }}>How to use this dashboard</h2>
          <p className="muted" style={{ margin: 0 }}>
            Start broad with time-range presets, then narrow with filters — party, state, ticker.
            The charts reveal patterns; the feed at the bottom is your audit trail.
          </p>
        </div>
      </div>
      <div className="dashboard-guide-grid">
        <article className="dashboard-guide-block">
          <h3>1. Pick a time window</h3>
          <p className="muted">
            Use the quick-select bar (7D, 30D, 1Q …) to set the date range instantly.
            Hit <strong>ALL DATA</strong> to load the complete history.
          </p>
          <div className="guide-chip-row">
            <span className="guide-chip">7D / 30D</span>
            <span className="guide-chip">Quarters</span>
            <span className="guide-chip">ALL DATA</span>
          </div>
        </article>
        <article className="dashboard-guide-block">
          <h3>2. Narrow with filters</h3>
          <p className="muted">
            Search or pick a politician by name, filter by party, chamber, state, sector, or
            transaction type. All dropdowns are pre-populated — no IDs needed.
          </p>
          <div className="guide-chip-row">
            <span className="guide-chip">Politician</span>
            <span className="guide-chip">State</span>
            <span className="guide-chip">Sector</span>
          </div>
        </article>
        <article className="dashboard-guide-block">
          <h3>3. Read the patterns</h3>
          <p className="muted">
            The activity timeline shows when disclosures cluster. Amount, lag, and chamber/party
            charts explain what is driving the spike.
          </p>
          <div className="guide-chip-row">
            <span className="guide-chip">Timeline</span>
            <span className="guide-chip">Trade Size</span>
            <span className="guide-chip">Lag Profile</span>
          </div>
        </article>
        <article className="dashboard-guide-block">
          <h3>4. Drill into leads</h3>
          <p className="muted">
            Top Politicians, Top Tickers, and the Sector Map show concentration.
            Use the Recent Disclosures feed to verify anomalies, then jump to Trades or Stocks.
          </p>
          <div className="guide-chip-row">
            <span className="guide-chip">Top Politicians</span>
            <span className="guide-chip">Top Tickers</span>
            <span className="guide-chip">Sector Map</span>
          </div>
        </article>
      </div>
    </section>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, helper }) {
  return (
    <div className="card metric-card dashboard-metric-card">
      <p className="eyebrow">{label}</p>
      <div className="metric-value">{value}</div>
      {helper ? <p className="metric-helper">{helper}</p> : null}
    </div>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BreakdownBarChart({ data, dataKey = "count", layout = "horizontal", color = "#f78166", xKey = "label" }) {
  if (!data?.length) {
    return <p className="muted" style={{ padding: "0.5rem 0" }}>No data for this filter set.</p>;
  }

  const gridColor = "#30363d";
  const axisColor = "#7d8590";

  if (layout === "vertical") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis type="number" stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} />
          <YAxis dataKey={xKey} type="category" width={130} stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} />
          <Tooltip {...CHART_TOOLTIP_STYLE} />
          <Bar dataKey={dataKey} fill={color} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey={xKey} angle={-25} textAnchor="end" interval={0} height={56}
          stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} />
        <YAxis stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} />
        <Tooltip {...CHART_TOOLTIP_STYLE} />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Pie chart ─────────────────────────────────────────────────────────────────
function BreakdownPie({ data }) {
  if (!data?.length) {
    return <p className="muted" style={{ padding: "0.5rem 0" }}>No data for this filter set.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label"
          innerRadius={58} outerRadius={92} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={`${entry.label}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [integerFormatter.format(value), name]}
          {...CHART_TOOLTIP_STYLE}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Recent disclosures table ──────────────────────────────────────────────────
function typeClass(type) {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t.includes("buy") || t.includes("purchase")) return "badge badge-buy";
  if (t.includes("sell") || t.includes("sale")) return "badge badge-sell";
  return "";
}

function RecentDisclosureTable({ items }) {
  if (!items?.length) {
    return <p className="muted">No disclosures match the current filters.</p>;
  }
  return (
    <div className="table-like dashboard-feed-table">
      <div className="table-head" style={{ gridTemplateColumns: "1.1fr 0.7fr 1.6fr 0.9fr 0.8fr 0.9fr" }}>
        <span>Disclosure</span>
        <span>Ticker</span>
        <span>Politician</span>
        <span>Type</span>
        <span>Owner</span>
        <span>Amount</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="table-row"
          style={{ gridTemplateColumns: "1.1fr 0.7fr 1.6fr 0.9fr 0.8fr 0.9fr" }}>
          <span style={{ color: "#7d8590", fontSize: "0.82rem" }}>
            {item.disclosure_date || item.transaction_date || "n/a"}
          </span>
          <span style={{ fontWeight: 600, color: "#f78166" }}>{item.ticker || "n/a"}</span>
          <span>{item.politician_name}</span>
          <span>
            {item.transaction_type ? (
              <span className={typeClass(item.transaction_type) || undefined}>
                {item.transaction_type}
              </span>
            ) : "n/a"}
          </span>
          <span style={{ color: "#7d8590" }}>{item.owner_type || "n/a"}</span>
          <span style={{ fontWeight: 500 }}>{item.amount_text || "Undisclosed"}</span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMetricValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return integerFormatter.format(value);
  return String(value);
}

function metricHelper(count, total) {
  if (!total) return null;
  return percentFormatter.format(count / total);
}

function useRecentFlag(systemStatus) {
  return useMemo(() => {
    const latestDisclosure = systemStatus?.latest_trade_disclosure_date;
    if (!latestDisclosure) return false;
    const parsed = new Date(latestDisclosure);
    if (Number.isNaN(parsed.getTime())) return false;
    return (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24) <= 14;
  }, [systemStatus]);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeRange, setActiveRange] = useState(null);
  const [explorer, setExplorer] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [politicians, setPoliticians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const recentFlag = useRecentFlag(systemStatus);

  // Load system status and politician list once
  useEffect(() => {
    api.getSystemStatus().then(setSystemStatus).catch(() => null);
    api.getPoliticians({ page_size: 500 })
      .then((data) => {
        // API may return array directly or { items: [...] }
        const list = Array.isArray(data) ? data : (data?.items || []);
        setPoliticians(list);
      })
      .catch(() => null);
  }, []);

  // Fetch explorer data whenever filters change
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.getDashboardExplorer(filters)
      .then((payload) => { if (active) setExplorer(payload); })
      .catch((err) => { if (active) setError(err.message || "Unable to load dashboard explorer"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters]);

  const options = explorer?.available_filters || {
    parties: [], chambers: [], states: [],
    transaction_types: [], owner_types: [], sectors: [],
  };

  const metrics = explorer?.headline_metrics || {};
  const topPoliticians = (explorer?.top_politicians || []).slice(0, 8);
  const topTickers = (explorer?.top_tickers || []).slice(0, 8);
  const sectorMap = (explorer?.sector_breakdown || []).map((item) => ({
    sector: item.label, count: item.count,
  }));

  const handleFilterChange = (key, value) => {
    // Clear active time-range highlight when dates are edited manually
    if (key === "date_from" || key === "date_to") setActiveRange(null);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActiveRange(null);
  };

  const applyTimeRange = (range) => {
    if (range.all) {
      setFilters((current) => ({ ...current, date_from: "", date_to: "" }));
      setActiveRange("ALL");
      return;
    }
    const date_from = getRangeFrom(range);
    const date_to = toISODate(new Date());
    setFilters((current) => ({ ...current, date_from, date_to }));
    setActiveRange(range.label);
  };

  const gridColor = "#30363d";
  const axisColor = "#7d8590";

  return (
    <div>
      {/* ── Page header ─────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="muted dashboard-subtitle">
            Congressional trading explorer — filter by time, politician, state, sector, and more.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <span className={`dashboard-status-pill${recentFlag ? " is-live" : ""}`}>
            <span className="dashboard-status-dot" />
            {recentFlag ? "Live data" : "Historical mode"}
          </span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setShowGuide((open) => !open)}
            title="Toggle the step-by-step guide explaining how to use each section"
          >
            {showGuide ? "Hide guide" : "How to use"}
          </button>
        </div>
      </div>

      <GuideSheet open={showGuide} />

      {/* ── Time range bar ──────────────────────────── */}
      <div className="time-range-bar">
        <span className="time-range-label">Range:</span>
        {TIME_RANGES.map((range) => (
          <button
            key={range.label}
            type="button"
            className={`time-range-btn${activeRange === range.label ? " active" : ""}`}
            onClick={() => applyTimeRange(range)}
            title={range.title}
          >
            {range.label}
          </button>
        ))}
        <button
          type="button"
          className={`time-range-btn all-data${activeRange === "ALL" ? " active" : ""}`}
          onClick={() => applyTimeRange({ all: true })}
          title="Remove all date filters and load the complete dataset"
        >
          ALL DATA
        </button>
      </div>

      {/* ── Filter card ─────────────────────────────── */}
      <section className="card dashboard-filter-card">
        <div className="dashboard-filter-header">
          <div>
            <p className="eyebrow">Filters</p>
            <h2 style={{ margin: "0.2rem 0 0" }}>Narrow your analysis</h2>
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={clearFilters}
            title="Reset every filter to show all available trades"
          >
            Clear all
          </button>
        </div>

        <div className="dashboard-filter-grid">
          {/* Politician — searchable datalist */}
          <label>
            Politician
            <input
              list="pol-list"
              value={filters.politician_search}
              onChange={(e) => handleFilterChange("politician_search", e.target.value)}
              placeholder="Search by name…"
              title="Type a name to search — pick from the dropdown or type freely"
            />
            <datalist id="pol-list">
              {politicians.map((p) => {
                const name = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
                const label = [name, p.party, p.state].filter(Boolean).join(" · ");
                return <option key={p.id || p.bioguide_id} value={name}>{label}</option>;
              })}
            </datalist>
          </label>

          {/* Ticker */}
          <label>
            Ticker
            <input
              value={filters.ticker}
              onChange={(e) => handleFilterChange("ticker", e.target.value.toUpperCase())}
              placeholder="e.g. AAPL, NVDA"
              title="Filter by stock ticker symbol"
            />
          </label>

          {/* Party */}
          <label>
            Party
            <select
              value={filters.party}
              onChange={(e) => handleFilterChange("party", e.target.value)}
              title="Filter by political party"
            >
              <option value="">All parties</option>
              {options.parties.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          {/* Chamber */}
          <label>
            Chamber
            <select
              value={filters.chamber}
              onChange={(e) => handleFilterChange("chamber", e.target.value)}
              title="Filter by Senate or House of Representatives"
            >
              <option value="">All chambers</option>
              {options.chambers.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          {/* State */}
          <label>
            State
            <select
              value={filters.state}
              onChange={(e) => handleFilterChange("state", e.target.value)}
              title="Filter by US state represented by the politician"
            >
              <option value="">All states</option>
              {options.states.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          {/* Transaction type */}
          <label>
            Transaction
            <select
              value={filters.transaction_type}
              onChange={(e) => handleFilterChange("transaction_type", e.target.value)}
              title="Filter by buy, sell, or other transaction type"
            >
              <option value="">All types</option>
              {options.transaction_types.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          {/* Owner type */}
          <label>
            Owner
            <select
              value={filters.owner_type}
              onChange={(e) => handleFilterChange("owner_type", e.target.value)}
              title="Filter by who owns the position: the politician, their spouse, or a dependent"
            >
              <option value="">All owners</option>
              {options.owner_types.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          {/* Sector */}
          <label>
            Sector
            <select
              value={filters.sector}
              onChange={(e) => handleFilterChange("sector", e.target.value)}
              title="Filter by market sector of the traded stock"
            >
              <option value="">All sectors</option>
              {options.sectors.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>

          {/* Date from */}
          <label>
            From date
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange("date_from", e.target.value)}
              title="Show only disclosures on or after this date"
            />
          </label>

          {/* Date to */}
          <label>
            To date
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange("date_to", e.target.value)}
              title="Show only disclosures on or before this date"
            />
          </label>
        </div>
      </section>

      {/* ── Loading skeleton ─────────────────────────── */}
      {loading ? (
        <div style={{ marginTop: "1rem" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      ) : null}

      {error ? <div className="error-state" style={{ marginTop: "1rem" }}>{error}</div> : null}

      {/* ── Main content ────────────────────────────── */}
      {!loading && !error && explorer ? (
        <>
          {/* Metrics row */}
          <div className="metrics-row" style={{ marginTop: "1rem" }}>
            <MetricCard label="Total Trades" value={formatMetricValue(metrics.total_trades)} />
            <MetricCard
              label="Buys"
              value={formatMetricValue(metrics.buy_count)}
              helper={metricHelper(metrics.buy_count, metrics.total_trades)}
            />
            <MetricCard
              label="Sells"
              value={formatMetricValue(metrics.sell_count)}
              helper={metricHelper(metrics.sell_count, metrics.total_trades)}
            />
            <MetricCard label="Politicians" value={formatMetricValue(metrics.unique_politicians)} />
            <MetricCard label="Tickers" value={formatMetricValue(metrics.unique_tickers)} />
            <MetricCard
              label="Avg Lag"
              value={metrics.average_lag_days != null ? `${metrics.average_lag_days}d` : "—"}
              helper={`Prompt ${percentFormatter.format(metrics.prompt_disclosure_ratio || 0)}`}
            />
          </div>

          {/* Charts grid */}
          <div className="dashboard-grid" style={{ marginTop: "1rem" }}>

            {/* Activity timeline */}
            <section className="card full-width">
              <p className="eyebrow">Activity Timeline</p>
              <h2 style={{ marginTop: "0.2rem" }}>Disclosure flow by day</h2>
              <div className="chart-wrap-xl" style={{ marginTop: "0.75rem" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={explorer.timeline} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
                    <defs>
                      <linearGradient id="grad-trades" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a371f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a371f7" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="grad-buys" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3fb950" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="grad-sells" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f85149" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f85149" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="date" stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} />
                    <YAxis stroke={axisColor} tick={{ fill: axisColor, fontSize: 11 }} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="trades" stroke="#a371f7" fill="url(#grad-trades)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="buys"   stroke="#3fb950" fill="url(#grad-buys)"   strokeWidth={2}   dot={false} />
                    <Area type="monotone" dataKey="sells"  stroke="#f85149" fill="url(#grad-sells)"  strokeWidth={2}   dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.6rem", fontSize: "0.78rem" }}>
                <span style={{ color: "#a371f7" }}>■ All trades</span>
                <span style={{ color: "#3fb950" }}>■ Buys</span>
                <span style={{ color: "#f85149" }}>■ Sells</span>
              </div>
            </section>

            {/* Trade size */}
            <section className="card">
              <p className="eyebrow">Trade Size</p>
              <h3>Amount distribution</h3>
              <BreakdownBarChart data={explorer.amount_distribution} color="#f78166" />
            </section>

            {/* Disclosure speed */}
            <section className="card">
              <p className="eyebrow">Disclosure Speed</p>
              <h3>Lag buckets (days)</h3>
              <BreakdownBarChart data={explorer.lag_distribution} color="#a371f7" />
            </section>

            {/* Chamber / party mix */}
            <section className="card">
              <p className="eyebrow">Legislator Mix</p>
              <h3>Chamber and party</h3>
              <BreakdownBarChart data={explorer.chamber_party_breakdown.slice(0, 8)} color="#3fb950" />
            </section>

            {/* Owner type */}
            <section className="card">
              <p className="eyebrow">Ownership</p>
              <h3>Owner type split</h3>
              <BreakdownPie data={explorer.owner_breakdown.slice(0, 6)} />
            </section>

            {/* Top politicians */}
            <section className="card">
              <p className="eyebrow">Who is active</p>
              <h3>Top politicians by trade count</h3>
              <BreakdownBarChart data={topPoliticians} layout="vertical" color="#3fb950" />
            </section>

            {/* Top tickers */}
            <section className="card">
              <p className="eyebrow">What is active</p>
              <h3>Most traded tickers</h3>
              <BreakdownBarChart data={topTickers} color="#f78166" />
            </section>

            {/* Sector treemap */}
            <section className="card full-width">
              <p className="eyebrow">Sector Concentration</p>
              <h3>Where disclosures cluster</h3>
              {sectorMap.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <Treemap
                    data={sectorMap}
                    dataKey="count"
                    nameKey="sector"
                    aspectRatio={4 / 2}
                    content={<CustomTreemapContent colors={SECTOR_COLORS} />}
                  >
                    <Tooltip
                      formatter={(value, name) => [integerFormatter.format(value), name]}
                      {...CHART_TOOLTIP_STYLE}
                    />
                  </Treemap>
                </ResponsiveContainer>
              ) : (
                <p className="muted">No sector data available for this filter set.</p>
              )}
            </section>

            {/* Recent disclosures */}
            <section className="card full-width">
              <div className="dashboard-feed-header">
                <div>
                  <p className="eyebrow">Audit Feed</p>
                  <h3>Recent disclosures</h3>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                  Validate anything that stands out in the charts above.
                </p>
              </div>
              <RecentDisclosureTable items={explorer.recent_disclosures} />
            </section>

          </div>
        </>
      ) : null}
    </div>
  );
}
