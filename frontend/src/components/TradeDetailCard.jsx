import { Link } from "react-router-dom";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? currencyFormatter.format(value) : "n/a";
}

function formatConfidence(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "n/a";
}

export default function TradeDetailCard({ trade, loading = false, error = "", onRetry }) {
  if (!trade && loading) {
    return (
      <section className="card">
        <p className="eyebrow">Trade detail</p>
        <h2>Loading trade...</h2>
        <p className="muted">Fetching the selected trade and its linked metadata.</p>
      </section>
    );
  }

  if (!trade) {
    return (
      <section className="card">
        <p className="eyebrow">Trade detail</p>
        <h2>Select a trade</h2>
        <p className="muted">Choose a row in the explorer to inspect the full trade, linked issuer, and raw payload.</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">Trade detail</p>
          <h2>
            {trade.politician_name || "Unknown politician"} <span className="muted">{trade.ticker || "No ticker"}</span>
            {trade.ticker && (
              <Link to={`/stocks?ticker=${encodeURIComponent(trade.ticker)}`} style={{ marginLeft: "0.5rem", fontSize: "0.8em" }}>View {trade.ticker} →</Link>
            )}
          </h2>
          <p className="muted">
            {trade.disclosure_date || "n/a"} disclosure, {trade.transaction_date || "n/a"} transaction
          </p>
        </div>
        {loading ? <span className="pill">Refreshing</span> : null}
      </div>

      {error ? (
        <div className="signal-error" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <span>{error}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pill-row">
        <span className="pill">{trade.transaction_type || "unknown"}</span>
        <span className="pill">{trade.amount_text || "Amount n/a"}</span>
        <span className="pill">Lag {trade.disclosure_lag_days ?? "n/a"}d</span>
        <span className="pill">Price {formatCurrency(trade.price_at_trade)}</span>
        <span className="pill">Mid {formatCurrency(trade.amount_mid)}</span>
        <span className="pill">Confidence {formatConfidence(trade.confidence)}</span>
      </div>

      <div className="list">
        <div className="list-row">
          <div>
            <strong>Issuer</strong>
            <p className="muted">
              {trade.issuer_name || "n/a"}
              {trade.issuer_sector ? ` - ${trade.issuer_sector}` : ""}
              {trade.issuer_industry ? ` - ${trade.issuer_industry}` : ""}
            </p>
          </div>
          <span className="muted">{trade.issuer_exchange || "n/a"}</span>
        </div>
        <div className="list-row">
          <div>
            <strong>Politician</strong>
            <p className="muted">
              {trade.politician_party || trade.party || "n/a"} {trade.politician_chamber || trade.chamber || ""}
              {trade.politician_state || trade.state ? ` - ${trade.politician_state || trade.state}` : ""}
            </p>
          </div>
          <span className="muted">
            ID {trade.politician_id ?? "n/a"}
            {trade.politician_id && (
              <Link to={`/politicians?id=${trade.politician_id}`} style={{ marginLeft: "0.5rem", fontSize: "0.8em" }}>View profile →</Link>
            )}
          </span>
        </div>
        {trade.notes ? (
          <div className="list-row">
            <div>
              <strong>Notes</strong>
              <p className="muted">{trade.notes}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <h3>Related committee roles</h3>
        {trade.politician_roles?.length ? (
          <div className="list">
            {trade.politician_roles.map((role) => (
              <div key={`${role.committee_name}-${role.role_title || "member"}`} className="list-row">
                <div>
                  <strong>{role.committee_name}</strong>
                  <p className="muted">{role.role_title || "Member"}</p>
                </div>
                <span className="muted">{role.chamber || "n/a"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No committee role data returned for this trade.</p>
        )}
      </div>

      <div>
        <h3>Raw payload</h3>
        <pre>{JSON.stringify(trade.raw_payload || { trade_id: trade.id }, null, 2)}</pre>
      </div>
    </section>
  );
}
