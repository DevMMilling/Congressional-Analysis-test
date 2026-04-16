import { useEffect, useState } from "react";
import { api } from "../api";
import SimpleLineChart from "../components/SimpleLineChart";

export default function BacktestPage() {
  const [holdingDays, setHoldingDays] = useState(30);
  const [minConfidence, setMinConfidence] = useState(0.65);
  const [result, setResult] = useState(null);

  const load = () => {
    api.getBacktest(`holding_days=${holdingDays}&min_confidence=${minConfidence}`).then(setResult).catch(console.error);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page-grid">
      <section className="card controls">
        <p className="eyebrow">Strategy simulator</p>
        <h2>How would the predictions have done?</h2>
        <label>
          Holding days
          <input type="number" value={holdingDays} onChange={(event) => setHoldingDays(event.target.value)} />
        </label>
        <label>
          Minimum confidence
          <input type="number" step="0.01" value={minConfidence} onChange={(event) => setMinConfidence(event.target.value)} />
        </label>
        <button onClick={load}>Recalculate</button>
      </section>

      {result ? (
        <>
          <section className="metrics-grid">
            <div className="card metric-card">
              <p className="eyebrow">Portfolio return</p>
              <h2>{(result.cumulative_return * 100).toFixed(1)}%</h2>
            </div>
            <div className="card metric-card">
              <p className="eyebrow">Benchmark return</p>
              <h2>{(result.benchmark_return * 100).toFixed(1)}%</h2>
            </div>
            <div className="card metric-card">
              <p className="eyebrow">Hit rate</p>
              <h2>{(result.hit_rate * 100).toFixed(1)}%</h2>
            </div>
            <div className="card metric-card">
              <p className="eyebrow">Trades</p>
              <h2>{result.trade_count}</h2>
            </div>
          </section>
          <section className="card">
            <h3>Equity curve</h3>
            <SimpleLineChart data={result.daily_curve} />
          </section>
          <section className="card">
            <h3>Trade ledger</h3>
            <div className="table-like">
              <div className="table-head">
                <span>Date</span>
                <span>Ticker</span>
                <span>Action</span>
                <span>Return</span>
                <span>Benchmark</span>
              </div>
              {result.trade_ledger.map((trade) => (
                <div className="table-row" key={`${trade.signal_id}-${trade.ticker}`}>
                  <span>{trade.signal_date}</span>
                  <span>{trade.ticker}</span>
                  <span>{trade.recommendation}</span>
                  <span>{(trade.return * 100).toFixed(2)}%</span>
                  <span>{(trade.benchmark_return * 100).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="card">Loading backtest...</section>
      )}
    </div>
  );
}
