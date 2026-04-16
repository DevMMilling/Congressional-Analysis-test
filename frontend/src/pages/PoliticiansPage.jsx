import { useEffect, useState } from "react";
import {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Official US Congress portrait URL via bioguide */
function getPhotoUrl(bioguideId) {
  if (!bioguideId) return null;
  return `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0].toUpperCase()}/${bioguideId}.jpg`;
}

const CHART_TOOLTIP = {
  contentStyle: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    color: "#e6edf3",
    fontSize: 12,
  },
  labelStyle: { color: "#7d8590" },
};

const SECTOR_COLORS = [
  "#f78166", "#3fb950", "#a371f7", "#58a6ff",
  "#d29922", "#f85149", "#56d364", "#79c0ff",
];

function partyColor(party) {
  if (!party) return "#7d8590";
  const p = party.toLowerCase();
  if (p.includes("democrat") || p === "d") return "#58a6ff";
  if (p.includes("republican") || p === "r") return "#f85149";
  return "#d29922";
}

function signalBadgeClass(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("high")) return "badge badge-high";
  if (t.includes("cluster")) return "badge badge-cluster";
  if (t.includes("unusual")) return "badge badge-unusual";
  if (t.includes("insider")) return "badge badge-insider";
  return "badge";
}

function signalLabel(type) {
  const map = {
    high_confidence: "HIGH CONF",
    clustered_activity: "CLUSTER",
    unusual_buying: "UNUSUAL",
    insider_risk: "INSIDER",
  };
  return map[type] || (type || "").toUpperCase();
}

function txClass(type) {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t.includes("buy") || t.includes("purchase")) return "badge badge-buy";
  if (t.includes("sell") || t.includes("sale")) return "badge badge-sell";
  return "";
}

function riskLevel(ratio) {
  if (ratio >= 0.3) return { level: "HIGH", cls: "risk-high", label: "High insider risk — many prompt disclosures" };
  if (ratio >= 0.1) return { level: "MED", cls: "risk-mid", label: "Moderate risk" };
  return { level: "LOW", cls: "risk-low", label: "Low risk" };
}

const intFmt = new Intl.NumberFormat("en-US");
const pctFmt = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

// ── Avatar ────────────────────────────────────────────────────────────────────
function PoliticianAvatar({ bioguideId, fullName, size = 80 }) {
  const [imgError, setImgError] = useState(false);
  const photoUrl = getPhotoUrl(bioguideId);
  const initials = (fullName || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={fullName}
        onError={() => setImgError(true)}
        style={{
          width: size, height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: "3px solid #30363d",
          background: "#161b22",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size,
      borderRadius: "50%",
      background: "linear-gradient(135deg, #21262d, #30363d)",
      border: "3px solid #30363d",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 700, color: "#7d8590",
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfBar({ value }) {
  const cls = value >= 0.75 ? "conf-high" : value >= 0.5 ? "conf-mid" : "conf-low";
  return (
    <div className={`conf-bar-wrap ${cls}`}>
      <div className="conf-bar-bg">
        <div className="conf-bar-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontWeight: 600, minWidth: 34, textAlign: "right" }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ── Profile panel ─────────────────────────────────────────────────────────────
function ProfilePanel({ profile, activity }) {
  const summary = activity?.summary || {};
  const trades = activity?.trades || [];
  const signals = activity?.signals || [];

  const promptRatio = profile.insider_risk_summary?.prompt_disclosure_ratio || 0;
  const risk = riskLevel(promptRatio);
  const buyCount = profile.buy_count || 0;
  const sellCount = profile.sell_count || 0;
  const total = buyCount + sellCount;
  const buyRatio = total > 0 ? buyCount / total : 0;

  const sectorData = (summary.sector_exposure || []).length > 0
    ? summary.sector_exposure.map((s) => ({
        label: s.sector || s.label || "Unknown",
        count: s.count || s.trade_count || 0,
      }))
    : (profile.most_traded_sectors || []).map((s, i) => ({ label: s, count: 10 - i }));

  return (
    <>
      {/* Hero */}
      <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <PoliticianAvatar bioguideId={profile.bioguide_id} fullName={profile.full_name} size={88} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.3rem", color: "var(--ink)" }}>
            {profile.full_name}
          </h2>
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.75rem" }}>
            {profile.party && (
              <span className="badge" style={{
                background: `${partyColor(profile.party)}22`,
                color: partyColor(profile.party),
                border: `1px solid ${partyColor(profile.party)}44`,
              }}>
                {profile.party}
              </span>
            )}
            {profile.chamber && <span className="pill">{profile.chamber}</span>}
            {profile.state && <span className="pill">{profile.state}</span>}
            {profile.district && (
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                District {profile.district}
              </span>
            )}
          </div>
          <div
            className={`risk-ring ${risk.cls}`}
            title={risk.label}
            style={{ width: 50, height: 50, fontSize: "0.78rem" }}
          >
            {risk.level}
          </div>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem", marginBottom: "1.25rem" }}>
        {[
          { label: "Trades", value: intFmt.format(profile.trade_count || 0), color: null },
          { label: "Buys", value: intFmt.format(buyCount), color: "var(--green)" },
          { label: "Sells", value: intFmt.format(sellCount), color: "var(--red)" },
          {
            label: "Avg Lag",
            value: profile.average_disclosure_lag != null
              ? `${profile.average_disclosure_lag.toFixed(1)}d`
              : "—",
            color: null,
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign: "center", padding: "0.65rem 0.4rem" }}>
            <p className="eyebrow" style={{ marginBottom: "0.2rem" }}>{label}</p>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, color: color || "var(--ink)" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Buy/Sell performance bar */}
      <div className="card" style={{ marginBottom: "1.25rem", padding: "1rem" }}>
        <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>Trading Profile</p>
        <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", height: 14, marginBottom: "0.45rem" }}>
          <div style={{
            width: `${buyRatio * 100}%`, background: "var(--green)",
            transition: "width 0.4s", minWidth: buyRatio > 0 ? 4 : 0,
          }} />
          <div style={{ flex: 1, background: "var(--red)", minWidth: (1 - buyRatio) > 0 ? 4 : 0 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.75rem" }}>
          <span style={{ color: "var(--green)" }}>■ Buys {pctFmt.format(buyRatio)}</span>
          <span style={{ color: "var(--red)" }}>Sells {pctFmt.format(1 - buyRatio)} ■</span>
        </div>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div>
            <div className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Prompt Disclosures
            </div>
            <div style={{
              fontWeight: 700,
              color: promptRatio >= 0.3 ? "var(--red)" : promptRatio >= 0.1 ? "#d29922" : "var(--green)",
            }}>
              {pctFmt.format(promptRatio)}
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Signals
            </div>
            <div style={{ fontWeight: 700 }}>{intFmt.format(summary.signal_count || signals.length)}</div>
          </div>
          {profile.most_traded_sectors?.length > 0 && (
            <div>
              <div className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Top Sector
              </div>
              <div style={{ fontWeight: 700 }}>{profile.most_traded_sectors[0]}</div>
            </div>
          )}
        </div>
      </div>

      {/* Sector exposure chart */}
      {sectorData.length > 0 && (
        <div className="card" style={{ marginBottom: "1.25rem", padding: "1rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Sector Exposure</p>
          <ResponsiveContainer width="100%" height={Math.min(180, sectorData.length * 28 + 30)}>
            <BarChart data={sectorData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis type="number" stroke="#7d8590" tick={{ fill: "#7d8590", fontSize: 10 }} />
              <YAxis dataKey="label" type="category" width={110} stroke="#7d8590" tick={{ fill: "#7d8590", fontSize: 10 }} />
              <Tooltip {...CHART_TOOLTIP} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {sectorData.map((_, i) => (
                  <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Signals */}
      {signals.length > 0 && (
        <div className="card" style={{ marginBottom: "1.25rem", padding: "1rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
            Trading Signals ({signals.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {signals.slice(0, 8).map((sig) => (
              <div key={sig.id} style={{
                display: "grid",
                gridTemplateColumns: "auto auto 1fr auto",
                gap: "0.6rem", alignItems: "center",
                padding: "0.5rem 0",
                borderBottom: "1px solid #30363d",
              }}>
                <span className={signalBadgeClass(sig.signal_type)}>
                  {signalLabel(sig.signal_type)}
                </span>
                <span style={{ fontWeight: 700, color: "#f78166", fontSize: "0.88rem", minWidth: 42 }}>
                  {sig.ticker || "—"}
                </span>
                <span className="muted" style={{
                  fontSize: "0.78rem",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {sig.rationale}
                </span>
                <ConfBar value={sig.confidence || sig.score || 0} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history */}
      {trades.length > 0 && (
        <div className="card" style={{ marginBottom: "1.25rem", padding: "1rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>
            Transaction History ({trades.length})
          </p>
          <div className="table-like">
            <div className="table-head" style={{ gridTemplateColumns: "0.9fr 0.7fr 0.8fr 1fr 0.7fr" }}>
              <span>Date</span>
              <span>Ticker</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Lag</span>
            </div>
            {trades.slice(0, 30).map((trade) => (
              <div key={trade.id} className="table-row"
                style={{ gridTemplateColumns: "0.9fr 0.7fr 0.8fr 1fr 0.7fr" }}>
                <span style={{ color: "#7d8590", fontSize: "0.82rem" }}>
                  {trade.disclosure_date || trade.transaction_date || "—"}
                </span>
                <span style={{ fontWeight: 600, color: "#f78166" }}>{trade.ticker || "—"}</span>
                <span>
                  {trade.transaction_type
                    ? <span className={txClass(trade.transaction_type) || undefined}>{trade.transaction_type}</span>
                    : "—"}
                </span>
                <span style={{ fontSize: "0.82rem" }}>{trade.amount_text || "Undisclosed"}</span>
                <span style={{ color: "#7d8590", fontSize: "0.82rem" }}>
                  {trade.disclosure_lag_days != null ? `${trade.disclosure_lag_days}d` : "—"}
                </span>
              </div>
            ))}
          </div>
          {trades.length > 30 && (
            <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.78rem" }}>
              Showing 30 of {trades.length} trades
            </p>
          )}
        </div>
      )}

      {/* Committee roles */}
      {profile.roles?.length > 0 && (
        <div className="card" style={{ padding: "1rem" }}>
          <p className="eyebrow" style={{ marginBottom: "0.75rem" }}>Committee Roles</p>
          <div className="list">
            {profile.roles.map((role, i) => (
              <div key={i} className="list-row">
                <div>
                  <strong style={{ fontSize: "0.88rem" }}>{role.committee_name}</strong>
                  <p className="muted" style={{ margin: "0.1rem 0 0", fontSize: "0.78rem" }}>
                    {role.role_title || "Member"}
                  </p>
                </div>
                <span className="muted" style={{ fontSize: "0.78rem" }}>{role.chamber || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Compare panel ─────────────────────────────────────────────────────────────
function ComparePanel({ result, onBack }) {
  const cols = `repeat(${result.length + 1}, 1fr)`;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
        <button className="btn-ghost btn-sm" onClick={onBack}
          title="Go back to a single politician profile">
          ← Back
        </button>
        <div>
          <p className="eyebrow">Comparison</p>
          <h2 style={{ margin: 0 }}>Side-by-side</h2>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols, gap: "0.75rem", marginBottom: "1rem" }}>
        <div />
        {result.map((p) => (
          <div key={p.politician_id || p.id} style={{ textAlign: "center" }}>
            <PoliticianAvatar bioguideId={null} fullName={p.name || p.full_name} size={52} />
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.82rem", fontWeight: 600 }}>
              {p.name || p.full_name}
            </p>
            <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>
              {[p.party, p.chamber].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))}
      </div>

      <div className="table-like">
        <div className="table-head" style={{ gridTemplateColumns: cols }}>
          <span>Metric</span>
          {result.map((p) => (
            <span key={p.politician_id || p.id}>
              {(p.name || p.full_name || "").split(" ").pop()}
            </span>
          ))}
        </div>
        {[
          ["State", (p) => p.state || "—"],
          ["Trades", (p) => intFmt.format(p.trade_count ?? 0)],
          ["Buys", (p) => intFmt.format(p.buy_count ?? 0)],
          ["Sells", (p) => intFmt.format(p.sell_count ?? 0)],
          ["Avg Lag", (p) => p.average_disclosure_lag != null ? `${p.average_disclosure_lag.toFixed(1)}d` : "—"],
          ["Signals", (p) => intFmt.format(p.signal_count ?? 0)],
          ["Insider Risk", (p) => pctFmt.format(p.insider_risk_ratio ?? 0)],
        ].map(([label, accessor]) => (
          <div key={label} className="table-row" style={{ gridTemplateColumns: cols }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>{label}</span>
            {result.map((p) => (
              <span key={p.politician_id || p.id} style={{ fontWeight: 500, fontSize: "0.88rem" }}>
                {accessor(p)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PoliticiansPage() {
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activity, setActivity] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");

  useEffect(() => {
    api.getPoliticians(search)
      .then((data) => setPeople(Array.isArray(data) ? data : (data?.items || [])))
      .catch(console.error);
  }, [search]);

  useEffect(() => {
    if (people.length && !selectedId) {
      loadPolitician(people[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  function loadPolitician(id) {
    setSelectedId(id);
    setCompareResult(null);
    setCompareError("");
    setProfileLoading(true);
    setProfile(null);
    setActivity(null);
    Promise.all([
      api.getPolitician(id),
      api.getPoliticianActivity(id, { trade_limit: 50, signal_limit: 20 }),
    ])
      .then(([prof, act]) => { setProfile(prof); setActivity(act); })
      .catch(console.error)
      .finally(() => setProfileLoading(false));
  }

  function toggleCompare(id) {
    setCompareIds((cur) => cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]);
    setCompareResult(null);
    setCompareError("");
  }

  function runCompare() {
    if (compareIds.length < 2) return;
    setCompareLoading(true);
    setCompareError("");
    setCompareResult(null);
    api.comparePoliticians(compareIds)
      .then((res) => setCompareResult(Array.isArray(res) ? res : (res?.entries || [])))
      .catch((err) => setCompareError(err.message || "Comparison failed"))
      .finally(() => setCompareLoading(false));
  }

  function clearCompare() {
    setCompareIds([]);
    setCompareResult(null);
    setCompareError("");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Politicians</h1>
          <p className="muted dashboard-subtitle">
            Browse profiles, trade history, signals, and sector exposure for every congressional member.
          </p>
        </div>
        {compareIds.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>{compareIds.length} selected</span>
            <button type="button" onClick={runCompare}
              disabled={compareIds.length < 2 || compareLoading}
              title="Compare selected politicians side-by-side">
              {compareLoading ? "Comparing…" : "Compare"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={clearCompare}
              title="Clear the comparison selection">
              Clear
            </button>
          </div>
        )}
      </div>
      {compareError && <p className="error-state" style={{ marginBottom: "1rem" }}>{compareError}</p>}

      <div className="split-layout">
        {/* Sidebar list */}
        <section className="card split-left">
          <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>All members</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            title="Filter the politician list by name"
            style={{ marginBottom: "0.75rem" }}
          />
          <div className="list">
            {people.map((person) => {
              const isActive = selectedId === person.id && !compareResult;
              const isChecked = compareIds.includes(person.id);
              return (
                <div key={person.id} className="list-row"
                  style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${person.full_name} for comparison`}
                    checked={isChecked}
                    onChange={() => toggleCompare(person.id)}
                    title="Check to add to comparison"
                    style={{ flexShrink: 0, width: "auto", margin: 0 }}
                  />
                  <button
                    className={`button-link${isActive ? " active" : ""}`}
                    style={{ flex: 1, padding: "0.4rem 0.5rem" }}
                    onClick={() => loadPolitician(person.id)}
                    title={`View ${person.full_name}'s trading profile`}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <PoliticianAvatar bioguideId={null} fullName={person.full_name} size={28} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {person.full_name}
                        </div>
                        <div className="muted" style={{ fontSize: "0.74rem" }}>
                          {[person.party, person.chamber, person.state].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
            {people.length === 0 && (
              <p className="muted" style={{ padding: "1rem 0", textAlign: "center" }}>No members found</p>
            )}
          </div>
        </section>

        {/* Profile / compare */}
        <section className="card" style={{ minWidth: 0, overflowY: "auto" }}>
          {compareResult ? (
            <ComparePanel result={compareResult} onBack={clearCompare} />
          ) : profileLoading ? (
            <div>{Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton-row" style={{ marginBottom: "0.5rem" }} />
            ))}</div>
          ) : profile ? (
            <ProfilePanel profile={profile} activity={activity} />
          ) : (
            <div className="empty-state">
              <p style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>⬡</p>
              <p>Select a politician to view their trading profile.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
