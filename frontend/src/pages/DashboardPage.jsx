import { useEffect, useState } from "react";
import { api } from "../api";
import MetricCard from "../components/MetricCard";
import SimpleBarChart from "../components/SimpleBarChart";

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [signals, setSignals] = useState([]);

  useEffect(() => {
    api.getSummary().then(setSummary).catch(console.error);
    api.getTopSignals().then(setSignals).catch(console.error);
  }, []);

  if (!summary) {
    return <div className="panel">Loading dashboard...</div>;
  }

  return (
    <div className="page-grid">
      <section className="hero card">
        <p className="eyebrow">Live Research Snapshot</p>
        <h2>Prediction counter</h2>
        <p className="hero-stat">{(summary.prediction_counter.cumulative_return * 100).toFixed(1)}%</p>
        <p className="muted">
          Strategy return vs benchmark {(summary.prediction_counter.benchmark_return * 100).toFixed(1)}% across{" "}
          {summary.prediction_counter.trade_count} signal trades.
        </p>
      </section>

      <section className="metrics-grid">
        {summary.metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="card">
        <h3>Top Congressional Traders</h3>
        <SimpleBarChart data={summary.top_traders} xKey="politician" yKey="trade_count" color="#0f766e" />
      </section>

      <section className="card">
        <h3>Most Traded Stocks</h3>
        <SimpleBarChart data={summary.top_stocks} xKey="ticker" yKey="trade_count" />
      </section>

      <section className="card">
        <h3>Disclosure Lag Distribution</h3>
        <SimpleBarChart data={summary.lag_distribution} xKey="bucket" yKey="count" color="#8b5cf6" />
      </section>

      <section className="card">
        <h3>Top Signals</h3>
        <div className="list">
          {signals.map((signal) => (
            <article key={signal.id} className="list-row">
              <div>
                <strong>{signal.ticker || "Multi-name"}</strong>
                <p className="muted">{signal.signal_type}</p>
              </div>
              <div>
                <strong>{(signal.confidence * 100).toFixed(0)}%</strong>
                <p className="muted">{signal.recommendation || "watch"}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
