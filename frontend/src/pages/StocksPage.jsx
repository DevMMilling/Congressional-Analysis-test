import { useEffect, useState } from "react";
import { api } from "../api";
import SimpleLineChart from "../components/SimpleLineChart";

export default function StocksPage() {
  const [search, setSearch] = useState("");
  const [stocks, setStocks] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [priceHistory, setPriceHistory] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    api.getStocks(search).then(setStocks).catch(console.error);
  }, [search]);

  useEffect(() => {
    if (!selectedTicker) {
      setSelectedStock(null);
      setPriceHistory(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDetails(true);
    Promise.all([api.getStock(selectedTicker), api.getStockHistory(selectedTicker, "days=180&include_trades=true")])
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
  }, [selectedTicker]);

  const latestPrice = priceHistory?.latest_close ?? priceHistory?.history?.at(-1)?.close;
  const visibleMarkers = (priceHistory?.trade_markers || []).filter((marker) => marker.price !== null && marker.price !== undefined);
  const markerCount = visibleMarkers.length;

  return (
    <div className="split-layout">
      <section className="card">
        <h3>Stocks</h3>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ticker or issuer" />
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
              <span className="pill">Latest close {latestPrice !== null && latestPrice !== undefined ? `$${latestPrice.toFixed(2)}` : "n/a"}</span>
              <span className="pill">Markers {markerCount}</span>
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
              <p className="muted">No recent price history was found for this ticker.</p>
            )}

            <h3>Model scores</h3>
            <pre>{JSON.stringify(selectedStock.model_scores, null, 2)}</pre>
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
