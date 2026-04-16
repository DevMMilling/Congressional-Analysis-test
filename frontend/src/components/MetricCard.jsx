export default function MetricCard({ label, value, delta }) {
  return (
    <div className="card metric-card">
      <p className="eyebrow">{label}</p>
      <h2>{value}</h2>
      {delta ? <p className="muted">{delta}</p> : null}
    </div>
  );
}
