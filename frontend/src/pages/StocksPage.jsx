import { useEffect, useState } from "react";
import { api } from "../api";
import SimpleLineChart from "../components/SimpleLineChart";

const SECTOR_OPTIONS = [
  "",
  "Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
];

function ScoreTable({ scores }) {
  if (!scores || typeof scores !== "object" || !Object.keys(scores).length) {
    return <p className="muted">No model scores available.</p>;
  }
  return (
    <div className="table-like">
      <div className="table-head" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <span>Metric</span>
        <span>Value</span>
      </div>
      {Object.entries(scores).map(([key, value]) => (
        <div className="table-row" key={key} style={{ gridTemplateColumns: "1fr 1fr" }}>
          <span>{key.replace(/_/g, " ")}</span>
          <span>{typeof value === "number" ? value.toFixed(4) : String(value ?? "n/a")}</span>
        </div>
      ))}
    </div>
  );
}

export default function StocksPage() {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [stocks, setStocks] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [priceHistory, setPriceHistory] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [historyDays, setHistoryDays] = useState("180");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const params = {};
    if (search) params.search = search;
    if (sector) params.sector = sector;
    api
      .getStocks(params)
      .then(setStocks)
      .catch(console.error);
  }, [search, sector]);

  useEffect(() => {
    if (!selectedTicker) {
      setSelectedStock(null);
      setPriceHistory(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDetails(true);

    const historyParams = { include_trades: "true" };
    if (historyDays) historyParams.days = historyDays;
    if (dateFrom) historyParams.date_from = dateFrom;
    if (dateTo) historyParams.date_to = dateTo;

    Promise.all([api.getStock(selectedTicker), api.getStockHistory(selectedTicker, historyParams)])
      .then(([stock, history]) => {
        if (cancelled) {
          return;
        }
        setSelectedStock(stock);
        setPriceHistory(history);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDetails(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTicker, historyDays, dateFrom, dateTo]);

  const latestPrice = priceHistory?.latest_close ?? priceHistory?.history?.at(-1)?.close;
  const visibleMarkers = (priceHistory?.trade_markers || []).filter((marker) => marker.price !== null && marker.price !== undefined);
  const markerCount = visibleMarkers.length;

  return (
    <div className="split-layout">
      <section className="card">
        <h3>Stocks</h3>
        <div className="controls" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label>
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ticker or issuer" />
          </label>
          <label>
            Sector
            <select value={sector} onChange={(event) => setSector(event.target.value)}>
              {SECTOR_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || "All sectors"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="list">
          {stocks.map((stock) => (
            <button
              key={stock.ticker}
              className={`list-row button-link ${selectedTicker === stock.ticker ? "active" : ""}`}
              onClick={() => setSelectedTicker(stock.ticker)}
            >
              <div>
                <strong>{stock.ticker}</strong>
                <p className="muted">{stock.issuer_name}</p>
              </div>
              <span className="muted">{stock.sector || "Unknown"}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        {selectedStock ? (
          <>
            <p className="eyebrow">Ticker profile</p>
            <h2>
              {selectedStock.ticker} <span className="muted">{selectedStock.issuer_name}</span>
            </h2>
            <div className="pill-row">
              <span className="pill">Trades {selectedStock.trade_count}</span>
              <span className="pill">Politicians {selectedStock.politician_count}</span>
              <span className="pill">Buys {selectedStock.buy_count}</span>
              <span className="pill">Sells {selectedStock.sell_count}</span>
              <span className="pill">
                Latest close{" "}
                {latestPrice !== null && latestPrice !== undefined ? `$${latestPrice.toFixed(2)}` : "n/a"}
              </span>
              <span className="pill">Markers {markerCount}</span>
            </div>

            <h3>Price history window</h3>
            <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <label>
                Days (rolling)
                <input
                  type="number"
                  min="7"
                  max="1825"
                  step="1"
                  value={historyDays}
                  onChange={(event) => {
                    setHistoryDays(event.target.value);
                    setDateFrom("");
                    setDateTo("");
                  }}
                  placeholder="180"
                />
              </label>
              <label>
                Date from
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setHistoryDays("");
                  }}
                />
              </label>
              <label>
                Date to
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setHistoryDays("");
                  }}
                />
              </label>
            </div>

            {isLoadingDetails ? (
              <p className="muted">Loading price history...</p>
            ) : null}

            {priceHistory?.history?.length ? (
              <>
                <h3>Price history</h3>
                <SimpleLineChart
                  data={priceHistory.history}
                  series={[{ key: "close", color: "#0f766e", name: "Close" }]}
                  markers={visibleMarkers}
                />
                {visibleMarkers.length ? (
                  <div className="list" style={{ marginTop: "1rem" }}>
                    {visibleMarkers.map((marker) => (
                      <div key={marker.id} className="list-row">
                        <div>
                          <strong>{marker.label}</strong>
                          <p className="muted">
                            {marker.transaction_date || marker.disclosure_date || marker.date} {marker.amount_text || ""}
                          </p>
                        </div>
                        <div>
                          <strong>{marker.date}</strong>
                          <p className="muted">{marker.price ? `$${marker.price.toFixed(2)}` : "n/a"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              !isLoadingDetails && <p className="muted">No recent price history was found for this ticker.</p>
            )}

            <h3>Model scores</h3>
            <ScoreTable scores={selectedStock.model_scores} />

            <h3>Recent trades</h3>
            <div className="list">
              {selectedStock.recent_trades.map((trade) => (
                <div key={trade.id} className="list-row">
                  <div>
                    <strong>{trade.politician_name}</strong>
                    <p className="muted">{trade.transaction_type}</p>
                  </div>
                  <div>
                    <strong>{trade.disclosure_date || "n/a"}</strong>
                    <p className="muted">{trade.amount_text || "Undisclosed"}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>Select a stock to inspect congressional activity, recent price history, and model output.</p>
        )}
      </section>
    </div>
  );
}