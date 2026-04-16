import { useEffect, useState } from "react";
import { api } from "../api";

export default function PoliticiansPage() {
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.getPoliticians(search).then(setPeople).catch(console.error);
  }, [search]);

  useEffect(() => {
    if (people[0] && !selected) {
      api.getPolitician(people[0].id).then(setSelected).catch(console.error);
    }
  }, [people, selected]);

  return (
    <div className="split-layout">
      <section className="card">
        <h3>Politicians</h3>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member" />
        <div className="list">
          {people.map((person) => (
            <button key={person.id} className="list-row button-link" onClick={() => api.getPolitician(person.id).then(setSelected)}>
              <div>
                <strong>{person.full_name}</strong>
                <p className="muted">
                  {person.party || "Unknown"} {person.chamber || ""} {person.state || ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        {selected ? (
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
              {selected.roles.map((role) => (
                <div key={`${role.committee_name}-${role.role_title}`} className="list-row">
                  <div>
                    <strong>{role.committee_name}</strong>
                    <p className="muted">{role.role_title || "Member"}</p>
                  </div>
                  <span className="muted">{role.chamber || ""}</span>
                </div>
              ))}
            </div>
            <h3>Risk Summary</h3>
            <pre>{JSON.stringify(selected.insider_risk_summary, null, 2)}</pre>
          </>
        ) : (
          <p>Select a politician to inspect trading behavior.</p>
        )}
      </section>
    </div>
  );
}
