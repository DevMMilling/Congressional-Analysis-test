import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";

// ── Constants ─────────────────────────────────────────────────────────────────
const SECTORS = [
  "Technology", "Health Care", "Financials", "Consumer Discretionary",
  "Communication Services", "Industrials", "Consumer Staples",
  "Energy", "Utilities", "Real Estate", "Materials",
];

const TOOLTIP_STYLE = {
  contentStyle: { background: "#262730", border: "1px solid rgba(250,250,250,0.08)", borderRadius: 6, color: "#fafafa", fontSize: 12 },
  labelStyle: { color: "rgba(250,250,250,0.55)" },
  itemStyle: { color: "#fafafa" },
};

const intFmt = new Intl.NumberFormat("en-US");
const pctFmt = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

// ── Buy/sell verdict ──────────────────────────────────────────────────────────
function computeVerdict(stock, priceHistory) {
  if (!stock) return null;

  const total = (stock.buy_count || 0) + (stock.sell_count || 0);
  const buyRatio = total > 0 ? stock.buy_count / total : 0.5;
  const signals = stock.latest_signals || [];

  let score = 50;

  // Congressional sentiment (±25 pts)
  score += (buyRatio - 0.5) * 50;

  // Signal quality (±20 pts)
  const hasHighConf   = signals.some(s => s.signal_type === "high_confidence"    && (s.confidence || 0) > 0.65);
  const hasUnusual    = signals.some(s => s.signal_type === "unusual_buying");
  const hasCluster    = signals.some(s => s.signal_type === "clustered_activity");
  const hasInsider    = signals.some(s => s.signal_type === "insider_risk");
  if (hasHighConf)  score += 15;
  if (hasUnusual)   score += 10;
  if (hasCluster)   score += 5;
  if (hasInsider)   score -= 20;

  // Price momentum (±5 pts)
  if (priceHistory?.change_pct != null) score += priceHistory.change_pct > 0 ? 5 : -5;

  // Volume of activity bonus
  if ((stock.politician_count || 0) >= 5) score += 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score >= 68) return {
    verdict: "BUY",
    cls: "buy",
    color: "var(--green)",
    headline: "Congressional activity is bullish",
    reasons: [
      buyRatio > 0.6 && `${pctFmt.format(buyRatio)} of congressional trades are buys`,
      hasHighConf   && "High-confidence signal active",
      hasUnusual    && "Unusual buying volume detected",
      hasCluster    && "Clustered activity from multiple members",
      priceHistory?.change_pct > 0 && `Price up ${pctFmt.format(priceHistory.change_pct)} recently`,
    ].filter(Boolean),
    score,
  };
  if (score >= 54) return {
    verdict: "WATCH",
    cls: "watch",
    color: "var(--yellow)",
    headline: "Mixed signals — monitor closely",
    reasons: [
      `Buy/sell split is ${pctFmt.format(buyRatio)} / ${pctFmt.format(1 - buyRatio)}`,
      (stock.politician_count || 0) > 0 && `${stock.politician_count} member${stock.politician_count > 1 ? "s" : ""} trading this stock`,
    ].filter(Boolean),
    score,
  };
  if (score >= 40) return {
    verdict: "HOLD",
    cls: "hold",
    color: "var(--accent-3)",
    headline: "No strong directional signal",
    reasons: [
      "Congressional activity does not lean heavily either way",
      `Buy/sell ratio: ${pctFmt.format(buyRatio)}`,
    ].filter(Boolean),
    score,
  };
  return {
    verdict: "CAUTION",
    cls: "sell",
    color: "var(--red)",
    headline: "Selling pressure or risk flags detected",
    reasons: [
      buyRatio < 0.4 && `${pctFmt.format(1 - buyRatio)} of trades are sells`,
      hasInsider   && "Insider risk flag raised",
      priceHistory?.change_pct < 0 && `Price down ${pctFmt.format(Math.abs(priceHistory.change_pct))} recently`,
    ].filter(Boolean),
    score,
  };
}

// ── Verdict card ──────────────────────────────────────────────────────────────
function VerdictCard({ stock, priceHistory }) {
  const v = computeVerdict(stock, priceHistory);
  if (!v) return null;

  return (
    <div className={`verdict-card ${v.cls}`} title="AI-assisted verdict based on congressional trading patterns — not financial advice">
      <div className="verdict-badge" style={{ color: v.color, borderColor: v.color }}>
        {v.verdict}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.25rem" }}>
          {v.headline}
        </div>
        <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--muted)", fontSize: "0.83rem" }}>
          {v.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="eyebrow" style={{ marginBottom: "0.2rem" }}>Confidence</div>
        <div style={{ fontSize: "1.5rem", fontWeight: 800, color: v.color }}>{v.score}</div>
        <div className="muted" style={{ fontSize: "0.72rem" }}>/ 100</div>
      </div>
    </div>
  );
}

// ── Price chart ───────────────────────────────────────────────────────────────
function PriceChart({ history, markers, change_pct }) {
  if (!history?.length) return <p className="muted">No price history available for this ticker.</p>;

  const isPositive = (change_pct ?? 0) >= 0;
  const lineColor = isPositive ? "var(--green)" : "var(--red)";
  const gradId = isPositive ? "grad-pos" : "grad-neg";
  const gradColor = isPositive ? "#09ab3b" : "#ff4b4b";

  // Thin out x-axis labels
  const tickInterval = Math.max(1, Math.floor(history.length / 8));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={history} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={gradColor} stopOpacity={0.25} />
            <stop offset="95%" stopColor={gradColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(250,250,250,0.06)" />
        <XAxis dataKey="date" stroke="rgba(250,250,250,0.3)"
          tick={{ fill: "rgba(250,250,250,0.45)", fontSize: 10 }}
          interval={tickInterval} />
        <YAxis stroke="rgba(250,250,250,0.3)"
          tick={{ fill: "rgba(250,250,250,0.45)", fontSize: 10 }}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          width={52} />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(v) => [`$${Number(v).toFixed(2)}`, "Close"]}
        />
        <Area type="monotone" dataKey="close"
          stroke={lineColor} strokeWidth={2}
          fill={`url(#${gradId})`} dot={false} />
        {(markers || []).map((m) => (
          <ReferenceDot key={m.id}
            x={m.date} y={m.price}
            r={5}
            fill={m.transaction_type?.toLowerCase().includes("buy") ? "#09ab3b" : "#ff4b4b"}
            stroke="#0e1117" strokeWidth={2}
            isFront
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Activity bar ──────────────────────────────────────────────────────────────
function ActivityBar({ buyCount, sellCount }) {
  const total = (buyCount || 0) + (sellCount || 0);
  if (!total) return null;
  const buyPct = buyCount / total;
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 10, borderRadius: 4, overflow: "hidden", marginBottom: "0.35rem" }}>
        <div style={{ width: `${buyPct * 100}%`, background: "var(--green)", minWidth: buyPct > 0 ? 3 : 0 }} />
        <div style={{ flex: 1, background: "var(--red)", minWidth: (1 - buyPct) > 0 ? 3 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
        <span style={{ color: "var(--green)" }}>■ Buys {pctFmt.format(buyPct)}</span>
        <span style={{ color: "var(--red)" }}>Sells {pctFmt.format(1 - buyPct)} ■</span>
      </div>
    </div>
  );
}

// ── Politician activity chart ─────────────────────────────────────────────────
function PoliticianChart({ trades }) {
  if (!trades?.length) return null;

  // Count trades per politician
  const counts = {};
  trades.forEach((t) => {
    const k = t.politician_name || "Unknown";
    if (!counts[k]) counts[k] = { label: k, buys: 0, sells: 0 };
    if (t.transaction_type?.toLowerCase().includes("buy")) counts[k].buys++;
    else counts[k].sells++;
  });

  const data = Object.values(counts)
    .map((d) => ({ ...d, total: d.buys + d.sells }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={Math.min(240, data.length * 32 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(250,250,250,0.06)" />
        <XAxis type="number" stroke="rgba(250,250,250,0.3)" tick={{ fill: "rgba(250,250,250,0.45)", fontSize: 10 }} />
        <YAxis dataKey="label" type="category" width={130} stroke="rgba(250,250,250,0.3)"
          tick={{ fill: "rgba(250,250,250,0.45)", fontSize: 10 }} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="buys"  stackId="a" fill="#09ab3b" name="Buys"  radius={[0,0,0,0]} />
        <Bar dataKey="sells" stackId="a" fill="#ff4b4b" name="Sells" radius={[0,4,4,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Signal list ───────────────────────────────────────────────────────────────
function SignalList({ signals }) {
  if (!signals?.length) return <p className="muted" style={{ fontSize: "0.875rem" }}>No signals generated yet for this ticker.</p>;

  const labels = { high_confidence: "HIGH CONF", clustered_activity: "CLUSTER", unusual_buying: "UNUSUAL", insider_risk: "INSIDER" };
  const classes = { high_confidence: "badge-high", clustered_activity: "badge-cluster", unusual_buying: "badge-unusual", insider_risk: "badge-insider" };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {signals.map((s) => (
        <div key={s.id} style={{
          display: "grid", gridTemplateColumns: "auto 1fr auto",
          gap: "0.75rem", alignItems: "center",
          padding: "0.55rem 0", borderBottom: "1px solid rgba(250,250,250,0.05)",
        }}>
          <span className={`badge ${classes[s.signal_type] || ""}`}>
            {labels[s.signal_type] || s.signal_type}
          </span>
          <span style={{ fontSize: "0.83rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.rationale}
          </span>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexShrink: 0 }}>
            <div style={{ width: 60, height: 5, borderRadius: 3, background: "rgba(250,250,250,0.1)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${((s.confidence || s.score || 0) * 100).toFixed(0)}%`,
                background: (s.confidence || 0) >= 0.75 ? "var(--green)" : (s.confidence || 0) >= 0.5 ? "var(--yellow)" : "var(--red)",
                borderRadius: 3,
              }} />
            </div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, minWidth: 30 }}>
              {Math.round((s.confidence || s.score || 0) * 100)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Trade history table ───────────────────────────────────────────────────────
function TradeTable({ trades }) {
  if (!trades?.length) return <p className="muted" style={{ fontSize: "0.875rem" }}>No recent trades found.</p>;
  return (
    <div className="table-like">
      <div className="table-head" style={{ gridTemplateColumns: "0.9fr 1.5fr 0.8fr 1fr 0.6fr" }}>
        <span>Date</span><span>Politician</span><span>Type</span><span>Amount</span><span>Lag</span>
      </div>
      {trades.map((t) => (
        <div key={t.id} className="table-row" style={{ gridTemplateColumns: "0.9fr 1.5fr 0.8fr 1fr 0.6fr" }}>
          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{t.disclosure_date || t.transaction_date || "—"}</span>
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{t.politician_name}</span>
          <span>
            {t.transaction_type ? (
              <span className={`badge ${t.transaction_type.toLowerCase().includes("buy") ? "badge-buy" : "badge-sell"}`}>
                {t.transaction_type}
              </span>
            ) : "—"}
          </span>
          <span style={{ fontSize: "0.82rem" }}>{t.amount_text || "Undisclosed"}</span>
          <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{t.disclosure_lag_days != null ? `${t.disclosure_lag_days}d` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const [search, setSearch]           = useState("");
  const [sector, setSector]           = useState("");
  const [stocks, setStocks]           = useState([]);
  const [selectedTicker, setSelected] = useState(null);
  const [stock, setStock]             = useState(null);
  const [priceHistory, setHistory]    = useState(null);
  const [loading, setLoading]         = useState(false);
  const [historyDays, setHistoryDays] = useState("365");

  // Load stock list
  useEffect(() => {
    api.getStocks({ search: search || undefined, sector: sector || undefined })
      .then(setStocks).catch(console.error);
  }, [search, sector]);

  // Load detail when ticker changes
  useEffect(() => {
    if (!selectedTicker) { setStock(null); setHistory(null); return; }
    let cancelled = false;
    setLoading(true);
    setStock(null);
    setHistory(null);
    Promise.all([
      api.getStock(selectedTicker),
      api.getStockHistory(selectedTicker, { days: historyDays, include_trades: "true" }),
    ])
      .then(([s, h]) => { if (!cancelled) { setStock(s); setHistory(h); } })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTicker, historyDays]);

  const latestClose   = priceHistory?.latest_close;
  const changePct     = priceHistory?.change_pct;
  const changeAbs     = priceHistory?.change;
  const tradeMarkers  = (priceHistory?.trade_markers || []).filter(m => m.price != null);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stocks</h1>
          <p className="muted dashboard-subtitle">
            Explore every traded ticker — congressional activity, signals, price history, and buy/sell verdict.
          </p>
        </div>
      </div>

      <div className="split-layout">
        {/* ── Sidebar ──────────────────────────── */}
        <aside className="card split-left" style={{ padding: "1rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>Filter stocks</p>
          <label style={{ marginBottom: "0.5rem" }}>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticker or company…" title="Search by ticker symbol or company name" />
          </label>
          <label style={{ marginBottom: "0.75rem" }}>
            Sector
            <select value={sector} onChange={(e) => setSector(e.target.value)} title="Filter by market sector">
              <option value="">All sectors</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>{stocks.length} tickers</p>
          <div className="list" style={{ gap: 0 }}>
            {stocks.map((s) => (
              <button
                key={s.ticker}
                className={`button-link${selectedTicker === s.ticker ? " active" : ""}`}
                style={{ padding: "0.5rem 0.6rem", borderRadius: "var(--radius-sm)" }}
                onClick={() => setSelected(s.ticker)}
                title={`View ${s.issuer_name} (${s.ticker}) trading profile`}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{s.ticker}</span>
                    <p className="muted" style={{ margin: 0, fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                      {s.issuer_name}
                    </p>
                  </div>
                  {s.sector && (
                    <span style={{
                      fontSize: "0.65rem", fontWeight: 700,
                      padding: "0.15rem 0.4rem", borderRadius: "var(--radius-sm)",
                      background: "rgba(250,250,250,0.06)",
                      color: "var(--muted)", flexShrink: 0,
                    }}>
                      {s.sector.split(" ")[0]}
                    </span>
                  )}
                </div>
              </button>
            ))}
            {stocks.length === 0 && <p className="muted" style={{ textAlign: "center", padding: "1rem 0", fontSize: "0.875rem" }}>No tickers found</p>}
          </div>
        </aside>

        {/* ── Detail panel ─────────────────────── */}
        <main style={{ minWidth: 0 }}>
          {!selectedTicker ? (
            <div className="card empty-state" style={{ paddingTop: "4rem", paddingBottom: "4rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>↗</div>
              <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Select a stock</p>
              <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
                Pick a ticker from the list to see price history, congressional trades, signals, and a buy/sell verdict.
              </p>
            </div>
          ) : loading ? (
            <div>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton-row" />)}</div>
          ) : stock ? (
            <>
              {/* ── Stock hero ──────────────────── */}
              <div className="card" style={{ marginBottom: "1rem", padding: "1.25rem 1.5rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
                      <h1 style={{ fontSize: "2rem", marginBottom: 0 }}>{stock.ticker}</h1>
                      <h2 style={{ fontWeight: 400, color: "var(--muted)", fontSize: "1rem" }}>{stock.issuer_name}</h2>
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                      {priceHistory?.sector && (
                        <span className="pill blue">{priceHistory.sector}</span>
                      )}
                      {stock.sector && !priceHistory?.sector && (
                        <span className="pill blue">{stock.sector}</span>
                      )}
                      <span className="pill">{stock.politician_count} politician{stock.politician_count !== 1 ? "s" : ""}</span>
                      <span className="pill">{intFmt.format(stock.trade_count)} trades</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {latestClose != null ? (
                      <>
                        <div style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                          {usdFmt.format(latestClose)}
                        </div>
                        {changePct != null && (
                          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: changePct >= 0 ? "var(--green)" : "var(--red)" }}>
                            {changePct >= 0 ? "▲" : "▼"} {usdFmt.format(Math.abs(changeAbs || 0))} ({pctFmt.format(Math.abs(changePct))})
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="muted">Price data unavailable</span>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginTop: "1.25rem" }}>
                  {[
                    { label: "Trades",     value: intFmt.format(stock.trade_count)      },
                    { label: "Buys",       value: intFmt.format(stock.buy_count),  color: "var(--green)" },
                    { label: "Sells",      value: intFmt.format(stock.sell_count), color: "var(--red)"   },
                    { label: "Politicians",value: intFmt.format(stock.politician_count)  },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      background: "var(--bg-2)", borderRadius: "var(--radius-sm)",
                      padding: "0.65rem 0.75rem", border: "1px solid var(--line)",
                    }}>
                      <div className="eyebrow" style={{ marginBottom: "0.2rem" }}>{label}</div>
                      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: color || "var(--ink)", letterSpacing: "-0.01em" }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Verdict ─────────────────────── */}
              <VerdictCard stock={stock} priceHistory={priceHistory} />

              {/* ── Price chart ─────────────────── */}
              <div className="card" style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <p className="eyebrow">Price History</p>
                    <h3 style={{ margin: 0 }}>Close price with congressional trade markers</h3>
                  </div>
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    {[["90", "3M"], ["180", "6M"], ["365", "1Y"], ["730", "2Y"]].map(([days, label]) => (
                      <button key={days}
                        className={`time-range-btn${historyDays === days ? " active" : ""}`}
                        onClick={() => setHistoryDays(days)}
                        title={`Show ${label} of price history`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <PriceChart history={priceHistory?.history} markers={tradeMarkers} change_pct={changePct} />
                {tradeMarkers.length > 0 && (
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.6rem", fontSize: "0.75rem" }}>
                    <span style={{ color: "var(--green)" }}>● Buy trades</span>
                    <span style={{ color: "var(--red)" }}>● Sell trades</span>
                    <span className="muted">{tradeMarkers.length} trade marker{tradeMarkers.length !== 1 ? "s" : ""} shown</span>
                  </div>
                )}
              </div>

              {/* ── Buy / sell ratio ────────────── */}
              <div className="card" style={{ marginBottom: "1rem" }}>
                <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Congressional Sentiment</p>
                <ActivityBar buyCount={stock.buy_count} sellCount={stock.sell_count} />
              </div>

              {/* ── Who is trading this ──────────── */}
              {stock.recent_trades?.length > 0 && (
                <div className="card" style={{ marginBottom: "1rem" }}>
                  <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Who Is Trading This</p>
                  <PoliticianChart trades={stock.recent_trades} />
                </div>
              )}

              {/* ── Signals ─────────────────────── */}
              <div className="card" style={{ marginBottom: "1rem" }}>
                <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
                  AI Signals ({stock.latest_signals?.length || 0})
                </p>
                <SignalList signals={stock.latest_signals} />
              </div>

              {/* ── Full trade history ───────────── */}
              <div className="card">
                <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
                  Transaction History ({stock.recent_trades?.length || 0} recent)
                </p>
                <TradeTable trades={stock.recent_trades} />
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
