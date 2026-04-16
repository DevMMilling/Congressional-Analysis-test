import { useEffect, useState } from "react";
import { api } from "../api";

export default function PoliticiansPage() {
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");

  useEffect(() => {
    api.getPoliticians(search).then(setPeople).catch(console.error);
  }, [search]);

  useEffect(() => {
    if (people.length && !selectedId) {
      const first = people[0];
      setSelectedId(first.id);
      api.getPolitician(first.id).then(setSelected).catch(console.error);
    }
  }, [people, selectedId]);

  const selectPolitician = (person) => {
    setSelectedId(person.id);
    api.getPolitician(person.id).then(setSelected).catch(console.error);
    setCompareResult(null);
    setCompareError("");
  };

  const toggleCompare = (id) => {
    setCompareIds((current) =>
      current.includes(id) ? current.filter((cid) => cid !== id) : [...current, id],
    );
    setCompareResult(null);
    setCompareError("");
  };

  const runCompare = () => {
    if (compareIds.length < 2) {
      return;
    }
    setCompareLoading(true);
    setCompareError("");
    setCompareResult(null);
    api
      .comparePoliticians(compareIds)
      .then(setCompareResult)
      .catch((err) => setCompareError(err.message || "Comparison failed"))
      .finally(() => setCompareLoading(false));
  };

  const clearCompare = () => {
    setCompareIds([]);
    setCompareResult(null);
    setCompareError("");
  };

  return (
    <div className="split-layout">
      <section className="card">
        <h3>Politicians</h3>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member" />
        {compareIds.length > 0 && (
          <div className="signal-toolbar" style={{ marginBottom: "0.5rem" }}>
            <span className="muted">{compareIds.length} selected for comparison</span>
            <button type="button" onClick={runCompare} disabled={compareIds.length < 2 || compareLoading}>
              {compareLoading ? "Comparing..." : "Compare"}
            </button>
            <button type="button" onClick={clearCompare}>
              Clear
            </button>
          </div>
        )}
        <div className="list">
          {people.map((person) => {
            const isActive = selectedId === person.id;
            const isChecked = compareIds.includes(person.id);
            return (
              <div
                key={person.id}
                className={`list-row ${isActive ? "active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${person.full_name} for comparison`}
                  checked={isChecked}
                  onChange={() => toggleCompare(person.id)}
                  style={{ flexShrink: 0 }}
                />
                <button
                  className="button-link"
                  style={{ flex: 1, textAlign: "left" }}
                  onClick={() => selectPolitician(person)}
                >
                  <strong>{person.full_name}</strong>
                  <p className="muted">
                    {person.party || "Unknown"} {person.chamber || ""} {person.state || ""}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        {compareResult ? (
          <>
            <p className="eyebrow">Comparison</p>
            <h2>Side-by-side</h2>
            <button type="button" className="muted" style={{ marginBottom: "1rem" }} onClick={clearCompare}>
              Back to profile
            </button>
            {compareError ? <p className="signal-error">{compareError}</p> : null}
            <div className="table-like">
              <div
                className="table-head"
                style={{ gridTemplateColumns: `repeat(${compareResult.length + 1}, 1fr)` }}
              >
                <span>Metric</span>
                {compareResult.map((p) => (
                  <span key={p.id}>{p.full_name}</span>
                ))}
              </div>
              {[
                ["Party", (p) => p.party || "n/a"],
                ["Chamber", (p) => p.chamber || "n/a"],
                ["State", (p) => p.state || "n/a"],
                ["Trades", (p) => p.trade_count ?? "n/a"],
                ["Buys", (p) => p.buy_count ?? "n/a"],
                ["Sells", (p) => p.sell_count ?? "n/a"],
                ["Avg lag (d)", (p) => p.average_disclosure_lag?.toFixed(1) ?? "n/a"],
              ].map(([label, accessor]) => (
                <div
                  className="table-row"
                  key={label}
                  style={{ gridTemplateColumns: `repeat(${compareResult.length + 1}, 1fr)` }}
                >
                  <span>{label}</span>
                  {compareResult.map((p) => (
                    <span key={p.id}>{accessor(p)}</span>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : selected ? (
          <>
            <p className="eyebrow">Profile</p>
            <h2>{selected.full_name}</h2>
            <p className="muted">
              {selected.party} {selected.chamber} {selected.state}
            </p>
            <div className="pill-row">
              <span className="pill">Trades {selected.trade_count}</span>
              <span className="pill">Buys {selected.buy_count}</span>
              <span className="pill">Sells {selected.sell_count}</span>
              <span className="pill">Avg lag {selected.average_disclosure_lag?.toFixed(1) || "n/a"}d</span>
            </div>
            <h3>Committee and Role Data</h3>
            <div className="list">
              {selected.roles?.map((role) => (
                <div key={`${role.committee_name}-${role.role_title}`} className="list-row">
                  <div>
                    <strong>{role.committee_name}</strong>
                    <p className="muted">{role.role_title || "Member"}</p>
                  </div>
                  <span className="muted">{role.chamber || ""}</span>
                </div>
              ))}
            </div>
            {selected.recent_trades?.length ? (
              <>
                <h3>Recent trades</h3>
                <div className="list">
                  {selected.recent_trades.map((trade) => (
                    <div key={trade.id} className="list-row">
                      <div>
                        <strong>{trade.ticker || "n/a"}</strong>
                        <p className="muted">{trade.transaction_type || "unknown"}</p>
                      </div>
                      <div>
                        <strong>{trade.disclosure_date || "n/a"}</strong>
                        <p className="muted">{trade.amount_text || "Undisclosed"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <h3>Risk Summary</h3>
            <pre>{JSON.stringify(selected.insider_risk_summary, null, 2)}</pre>
          </>
        ) : (
          <p>Select a politician to inspect trading behavior.</p>
        )}
        {compareError && !compareResult ? <p className="signal-error">{compareError}</p> : null}
      </section>
    </div>
  );
}