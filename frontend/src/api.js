const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

export function buildQueryString(params = {}) {
  if (typeof params === "string") return params;
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.set(k, v);
  });
  return sp.toString();
}

export async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function requestPage(path, params = {}) {
  const query = buildQueryString(params);
  const res = await fetch(`${API_BASE}${path}${query ? `?${query}` : ""}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  const data = await res.json();
  return {
    items: data,
    total: parseInt(res.headers.get("X-Total-Count") || "0", 10),
    page: parseInt(res.headers.get("X-Page") || "1", 10),
    pageSize: parseInt(res.headers.get("X-Page-Size") || "50", 10),
    pageCount: parseInt(res.headers.get("X-Page-Count") || "1", 10),
  };
}

async function download(path, params = {}) {
  const query = buildQueryString(params);
  const res = await fetch(`${API_BASE}${path}${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  // ── Analytics ──────────────────────────────────────
  getSummary: () => request("/analytics/summary"),
  getSectorBreakdown: (sector) => request(`/analytics/sector-breakdown?sector=${encodeURIComponent(sector)}`),

  // ── Stocks ─────────────────────────────────────────
  getStocks: (search = "") => request(`/stocks${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getStock: (ticker) => request(`/stocks/${encodeURIComponent(ticker)}`),
  getStockHistory: (ticker, params = {}) => {
    const q = buildQueryString(typeof params === "string" ? {} : params);
    return request(`/stocks/${encodeURIComponent(ticker)}/history${q ? `?${q}` : ""}`);
  },

  // ── Politicians ────────────────────────────────────
  getPoliticians: (params = {}) => {
    const q = typeof params === "string" ? `?search=${encodeURIComponent(params)}` : buildQueryString(params) ? `?${buildQueryString(params)}` : "";
    return request(`/politicians${q}`);
  },
  getPolitician: (id) => request(`/politicians/${id}`),
  comparePoliticians: (ids) => request(`/politicians/compare?ids=${ids.join(",")}`),

  // ── Trades ─────────────────────────────────────────
  getTrades: (params = {}) => requestPage("/trades", params),
  getTradeStats: () => request("/trades/stats"),
  downloadTrades: (params = {}) => download("/exports/trades.csv", params),

  // ── Signals ────────────────────────────────────────
  getSignals: (params = {}) => requestPage("/signals", params),
  getSignalsSummary: () => request("/signals/summary"),
  downloadSignals: (params = {}) => download("/exports/signals.csv", params),

  // ── Backtest ───────────────────────────────────────
  getBacktest: (params = {}) => {
    const q = buildQueryString(params);
    return request(`/backtest${q ? `?${q}` : ""}`);
  },

  // ── Models ─────────────────────────────────────────
  getModelReport: () => request("/models/report"),
  postRetrain: () => request("/models/retrain", { method: "POST" }),

  // ── Ingest ─────────────────────────────────────────
  postBackfill: () => request("/ingest/backfill", { method: "POST" }),
  postUpdate: () => request("/ingest/update", { method: "POST" }),

  // ── System ─────────────────────────────────────────
  getSystemStatus: () => request("/system/status"),

  // ── Alerts ─────────────────────────────────────────
  createSubscription: (payload) => request("/alerts/subscriptions", { method: "POST", body: JSON.stringify(payload) }),
  getSubscriptions: () => request("/alerts/subscriptions"),

  // ── Jobs ───────────────────────────────────────────
  getJob: (id) => request(`/jobs/${id}`),
};
