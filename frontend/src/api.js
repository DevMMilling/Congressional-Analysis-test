const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

function buildQueryString(params = {}) {
  if (typeof params === "string") {
    return params;
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    searchParams.set(key, value);
  });
  return searchParams.toString();
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json();
}

export const api = {
  getSummary: () => request("/analytics/summary"),
  getTopSignals: () => request("/signals/top"),
  getPoliticians: (search = "") => request(`/politicians${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getPolitician: (id) => request(`/politicians/${id}`),
  getStocks: (search = "") => request(`/stocks${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getStock: (ticker) => request(`/stocks/${ticker}`),
  getStockHistory: (ticker, params = "") => request(`/stocks/${ticker}/history${params ? `?${params}` : ""}`),
  getTrades: (params = "") => request(`/trades${params ? `?${params}` : ""}`),
  getSignals: (params = "") => {
    const query = buildQueryString(params);
    return request(`/signals${query ? `?${query}` : ""}`);
  },
  getBacktest: (params = "") => request(`/backtest${params ? `?${params}` : ""}`),
  postBackfill: () => request("/ingest/backfill", { method: "POST" }),
  postUpdate: () => request("/ingest/update", { method: "POST" }),
  postRetrain: () => request("/models/retrain", { method: "POST" }),
  createSubscription: (payload) => request("/alerts/subscriptions", { method: "POST", body: JSON.stringify(payload) }),
};
