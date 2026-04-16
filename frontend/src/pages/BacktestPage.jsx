import { useEffect, useState } from "react";
import { api } from "../api";
import SimpleLineChart from "../components/SimpleLineChart";

const SIGNAL_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "high_confidence", label: "High confidence" },
  { value: "clustered_activity", label: "Clustered activity" },
  { value: "unusual_buying", label: "Unusual buying" },
  { value: "insider_risk", label: "Insider risk" },
];

function pct(value, decimals = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(decimals)}%`;
}

function alpha(portfolio, benchmark) {
  if (typeof portfolio !== "number" || typeof benchmark !== "number") return "n/a";
  const diff = (portfolio - benchmark) * 100;
  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
}

export default function BacktestPage() {
  const [holdingDays, setHoldingDays] = useState(30);
  const [minConfidence, setMinConfidence] = useState(0.65);
  const [signalType, setSignalType] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    const params = { holding_days: holdingDays, min_confidence: minConfidence };
    if (signalType) params.signal_type = signalType;
    api
      .getBacktest(params)
      .then((data) => {
        setResult(data);
      })
      .catch((err) => {
        setError(err.message || "Backtest failed");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const alphaValue = result ? alpha(result.cumulative_return, result.benchmark_return) : null;

  return (
    <div className="page-grid">
      <section className="card controls">
        <p className="eyebrow">Strategy simulator</p>
        <h2>How would the predictions have done?</h2>
        <label>
          Holding days
          <input
            type="number"
            min="1"
            max="365"
            step="1"
            value={holdingDays}
            onChange={(event) => setHoldingDays(event.target.value)}
          />
        </label>
        <label>
          Minimum confidence
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={minConfidence}
            onChange={(event) => setMinConfidence(event.target.value)}
          />
        </label>
        <label>
          Signal type
          <select value={signalType} onChange={(event) => setSignalType(event.target.value)}>
            {SIGNAL_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={load} disabled={loading}>
          {loading ? "Running..." : "Recalculate"}
        </button>
        {error ? <p className="signal-error">{error}</p> : null}
      </section>

      {loading && !result ? (
        <section className="card">Running backtest...</section>
      ) : result ? (
        <>
          <section className="metrics-grid">
            <div className="card metric-card">
              <p className="eyebrow">Portfolio return</p>
              <h2>{pct(result.cumulative_return)}</h2>
            </div>
            <div className="card metric-card">
              <p className="eyebrow">Benchmark return</p>
              <h2>{pct(result.benchmark_return)}</h2>
            </div>
            <div className="card metric-card">
              <p className="eyebrow">Alpha vs benchmark</p>
              <h2
                style={{
                  color:
                    typeof result.cumulative_return === "number" && typeof result.benchmark_return === "number"
                      ? result.cumulative_return >= result.benchmark_return
                        ? "var(--color-positive, #0f766e)"
                        : "var(--color-negative, #be123c)"
                      : undefined,
                }}
              >
                {alphaValue}
              </h2>
            </div>
            <div className="card metric-card">
              <p className="eyebrow">Hit rate</p>
              <h2>{pct(result.hit_rate)}</h2>
            </div>
            <div className="card metric-card">
              <p className="eyebrow">Trades</p>
              <h2>{result.trade_count}</h2>
            </div>
            {typeof result.sharpe_ratio === "number" ? (
              <div className="card metric-card">
                <p className="eyebrow">Sharpe ratio</p>
                <h2>{result.sharpe_ratio.toFixed(2)}</h2>
              </div>
            ) : null}
            {typeof result.max_drawdown === "number" ? (
              <div className="card metric-card">
                <p className="eyebrow">Max drawdown</p>
                <h2>{pct(result.max_drawdown)}</h2>
              </div>
            ) : null}
          </section>
          <section className="card">
            <h3>Equity curve</h3>
            <SimpleLineChart
              data={result.daily_curve}
              series={[
                { key: "portfolio", color: "#0f766e", name: "Portfolio" },
                { key: "benchmark", color: "#64748b", name: "Benchmark" },
              ]}
            />
          </section>
          <section className="card">
            <h3>Trade ledger</h3>
            <div className="table-like">
              <div className="table-head" style={{ gridTemplateColumns: "1fr 0.8fr 1fr 0.8fr 0.9fr" }}>
                <span>Date</span>
                <span>Ticker</span>
                <span>Action</span>
                <span>Return</span>
                <span>Benchmark</span>
              </div>
              {result.trade_ledger.map((trade) => {
                const outperformed =
                  typeof trade.return === "number" &&
                  typeof trade.benchmark_return === "number" &&
                  trade.return >= trade.benchmark_return;
                return (
                  <div
                    className="table-row"
                    key={`${trade.signal_id}-${trade.ticker}`}
                    style={{ gridTemplateColumns: "1fr 0.8fr 1fr 0.8fr 0.9fr" }}
                  >
                    <span>{trade.signal_date}</span>
                    <span>{trade.ticker}</span>
                    <span>{trade.recommendation}</span>
                    <span
                      style={{
                        color: outperformed
                          ? "var(--color-positive, #0f766e)"
                          : "var(--color-negative, #be123c)",
                      }}
                    >
                      {pct(trade.return, 2)}
                    </span>
                    <span>{pct(trade.benchmark_return, 2)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        !loading && <section className="card">No backtest results. Click Recalculate to run.</section>
      )}
    </div>
  );
}
