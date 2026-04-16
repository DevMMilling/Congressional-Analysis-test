import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import PaginationBar from "../components/PaginationBar";
import PresetShelf from "../components/PresetShelf";
import TradeDetailCard from "../components/TradeDetailCard";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const STORAGE_KEY = "congressional-trades-presets-v1";
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    searchParams.set(key, value);
  });
  return searchParams.toString();
}

async function requestPagedCollection(path, params = {}, signal) {
  const query = buildQuery(params);
  const response = await fetch(`${API_BASE}${path}${query ? `?${query}` : ""}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const text = await response.text();

  if (!response.ok) {
    let message = `API error ${response.status}`;
    try {
      const payload = JSON.parse(text);
      message = payload.detail || payload.message || message;
    } catch {
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }

  const data = text ? JSON.parse(text) : [];
  const rows = Array.isArray(data) ? data : data.items || data.results || data.data || [];
  const totalCount = Number(response.headers.get("x-total-count") || rows.length);
  const page = Number(response.headers.get("x-page") || params.page || 1);
  const pageSize = Number(response.headers.get("x-page-size") || params.page_size || rows.length || 20);
  const pageCountHeader = Number(response.headers.get("x-page-count") || 0);
  const pageCount = pageCountHeader > 0 ? pageCountHeader : totalCount > 0 && pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;

  return {
    rows,
    pagination: {
      totalCount,
      page,
      pageSize,
      pageCount,
      hasNext: pageCount ? page < pageCount : rows.length === pageSize,
    },
  };
}

async function loadTradeDetail(tradeId, signal) {
  if (typeof api.getTrade === "function") {
    return api.getTrade(tradeId);
  }

  const response = await fetch(`${API_BASE}/trades/${tradeId}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const text = await response.text();

  if (!response.ok) {
    let message = `API error ${response.status}`;
    try {
      const payload = JSON.parse(text);
      message = payload.detail || payload.message || message;
    } catch {
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }

  return text ? JSON.parse(text) : null;
}

function parseIntParam(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function updateSearchParams(searchParams, setSearchParams, updates, { replace = true } = {}) {
  const next = new URLSearchParams(searchParams);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  });
  setSearchParams(next, { replace });
}

function readTradeFilters(searchParams) {
  return {
    ticker: searchParams.get("ticker") || "",
    politician_id: searchParams.get("politician_id") || "",
    transaction_type: searchParams.get("transaction_type") || "",
    chamber: searchParams.get("chamber") || "",
    party: searchParams.get("party") || "",
    state: searchParams.get("state") || "",
    sort: searchParams.get("sort") || "disclosure_date",
    order: searchParams.get("order") || "desc",
    page_size: searchParams.get("page_size") || "20",
  };
}

function formatCurrency(value) {
  return typeof value === "number" && Number.isFinite(value) ? currencyFormatter.format(value) : "n/a";
}

function toQuery(filters, page) {
  return {
    ticker: filters.ticker.trim().toUpperCase(),
    politician_id: filters.politician_id.trim(),
    transaction_type: filters.transaction_type,
    chamber: filters.chamber.trim(),
    party: filters.party.trim().toUpperCase(),
    state: filters.state.trim().toUpperCase(),
    sort: filters.sort,
    order: filters.order,
    page,
    page_size: filters.page_size,
  };
}

function readPresets() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writePresets(presets) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export default function TradesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const tradeFilters = useMemo(() => readTradeFilters(searchParams), [queryKey]);
  const currentPage = parseIntParam(searchParams.get("page"), 1);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ totalCount: 0, page: 1, pageSize: 20, pageCount: 0, hasNext: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [presets, setPresets] = useState(() => readPresets());
  const [activePresetId, setActivePresetId] = useState("");

  const query = useMemo(() => toQuery(tradeFilters, currentPage), [tradeFilters, currentPage]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError("");

    requestPagedCollection("/trades", query, controller.signal)
      .then(({ rows: data, pagination: nextPagination }) => {
        if (!active) {
          return;
        }
        setRows(data);
        setPagination(nextPagination);
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message || "Unable to load trades");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (loading || error) {
      return;
    }

    if (!rows.length) {
      setSelectedTradeId(null);
      setSelectedTrade(null);
      return;
    }

    const currentVisible = selectedTradeId && rows.some((trade) => trade.id === selectedTradeId);
    if (!currentVisible) {
      setSelectedTradeId(rows[0].id);
      setSelectedTrade(rows[0]);
    }
  }, [rows, selectedTradeId, loading, error]);

  useEffect(() => {
    if (!selectedTradeId) {
      setDetailLoading(false);
      setDetailError("");
      return;
    }

    const controller = new AbortController();
    let active = true;

    setDetailLoading(true);
    setDetailError("");

    loadTradeDetail(selectedTradeId, controller.signal)
      .then((trade) => {
        if (active && trade) {
          setSelectedTrade(trade);
        }
      })
      .catch((fetchError) => {
        if (active) {
          setDetailError(fetchError.message || "Unable to load trade detail");
        }
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedTradeId, detailRefreshToken]);

  const updateFilter = (field, value) => {
    updateSearchParams(searchParams, setSearchParams, { [field]: value, page: 1 });
    setActivePresetId("");
  };

  const selectPage = (page) => {
    updateSearchParams(searchParams, setSearchParams, { page }, { replace: false });
  };

  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
    setActivePresetId("");
  };
  const savePreset = (name) => {
    const preset = {
      id: window.crypto?.randomUUID?.() || `trades-${Date.now()}`,
      name,
      query: searchParams.toString(),
    };
    const next = [...presets.filter((item) => item.name !== name), preset];
    setPresets(next);
    writePresets(next);
    setActivePresetId(preset.id);
  };
  const applyPreset = (preset) => {
    setSearchParams(new URLSearchParams(preset.query || ""), { replace: false });
    setActivePresetId(preset.id);
  };
  const deletePreset = (presetId) => {
    const next = presets.filter((preset) => preset.id !== presetId);
    setPresets(next);
    writePresets(next);
    if (activePresetId === presetId) {
      setActivePresetId("");
    }
  };
  const clearPresets = () => {
    setPresets([]);
    writePresets([]);
    setActivePresetId("");
  };

  const pageSizeValue = parseIntParam(tradeFilters.page_size, 20);

  return (
    <div className="page-grid">
      <PresetShelf
        title="Trade views"
        presets={presets}
        activePresetId={activePresetId}
        onApplyPreset={applyPreset}
        onSavePreset={savePreset}
        onDeletePreset={deletePreset}
        onClearPresets={clearPresets}
      />
      <div className="split-layout" style={{ gridColumn: "1 / -1" }}>
      <section className="card" style={{ display: "grid", gap: "1rem" }}>
        <div>
          <p className="eyebrow">Trade explorer</p>
          <h2>Filter congressional trades</h2>
          <p className="muted">Server-side filters, paging, and selection for drilling into individual trades.</p>
        </div>

        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <label>
            Ticker
            <input value={tradeFilters.ticker} onChange={(event) => updateFilter("ticker", event.target.value)} placeholder="AAPL" />
          </label>
          <label>
            Politician ID
            <input value={tradeFilters.politician_id} onChange={(event) => updateFilter("politician_id", event.target.value)} placeholder="123" />
          </label>
          <label>
            Transaction type
            <select value={tradeFilters.transaction_type} onChange={(event) => updateFilter("transaction_type", event.target.value)}>
              <option value="">All types</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <label>
            Chamber
            <input value={tradeFilters.chamber} onChange={(event) => updateFilter("chamber", event.target.value)} placeholder="House" />
          </label>
          <label>
            Party
            <input value={tradeFilters.party} onChange={(event) => updateFilter("party", event.target.value)} placeholder="D" />
          </label>
          <label>
            State
            <input value={tradeFilters.state} onChange={(event) => updateFilter("state", event.target.value)} placeholder="CA" />
          </label>
          <label>
            Sort
            <select value={tradeFilters.sort} onChange={(event) => updateFilter("sort", event.target.value)}>
              <option value="disclosure_date">Disclosure date</option>
              <option value="transaction_date">Transaction date</option>
              <option value="amount_mid">Amount mid</option>
              <option value="ticker">Ticker</option>
              <option value="politician_name">Politician</option>
            </select>
          </label>
          <label>
            Order
            <select value={tradeFilters.order} onChange={(event) => updateFilter("order", event.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <label>
            Page size
            <select
              value={tradeFilters.page_size}
              onChange={(event) => {
                updateFilter("page_size", event.target.value);
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
        </div>

        <div className="signal-toolbar">
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
          <button type="button" onClick={() => api.downloadTradesCsv({ ...query, page: undefined, page_size: undefined })}>
            Download CSV
          </button>
          <span className="muted">{loading ? "Refreshing trades..." : `${pagination.totalCount || rows.length} trades loaded`}</span>
        </div>

        {error ? <p className="signal-error">{error}</p> : null}

        <PaginationBar
          page={pagination.page}
          pageSize={pagination.pageSize || pageSizeValue}
          totalCount={pagination.totalCount}
          pageCount={pagination.pageCount}
          hasNext={pagination.hasNext}
          loading={loading}
          onPageChange={selectPage}
        />

        <div className="table-like" style={{ minHeight: "18rem" }}>
          <div className="table-head" style={{ gridTemplateColumns: "1.2fr 1.1fr 0.7fr 0.8fr 0.8fr 0.7fr" }}>
            <span>Date</span>
            <span>Politician</span>
            <span>Ticker</span>
            <span>Type</span>
            <span>Amount</span>
            <span>Lag</span>
          </div>
          {loading && rows.length === 0 && (
            <div>{[...Array(5)].map((_, i) => <div key={i} className="skeleton-row" />)}</div>
          )}
          {!loading && !error && rows.length === 0 ? <p className="muted signal-empty">No trades match the current filters.</p> : null}
          {rows.map((trade) => {
            const selected = selectedTradeId === trade.id;
            return (
              <button
                key={trade.id}
                type="button"
                className="table-row button-link"
                aria-selected={selected}
                onClick={() => {
                  setSelectedTradeId(trade.id);
                  setSelectedTrade(trade);
                }}
                style={{
                  gridTemplateColumns: "1.2fr 1.1fr 0.7fr 0.8fr 0.8fr 0.7fr",
                  background: selected ? "rgba(15, 118, 110, 0.08)" : "transparent",
                }}
              >
                <span>{trade.disclosure_date || trade.transaction_date || "n/a"}</span>
                <span>{trade.politician_name || "Unknown"}</span>
                <span>{trade.ticker || "n/a"}</span>
                <span>{trade.transaction_type || "unknown"}</span>
                <span>{trade.amount_mid ? formatCurrency(trade.amount_mid) : trade.amount_text || "n/a"}</span>
                <span>{trade.disclosure_lag_days ?? "n/a"}d</span>
              </button>
            );
          })}
        </div>

        <PaginationBar
          page={pagination.page}
          pageSize={pagination.pageSize || pageSizeValue}
          totalCount={pagination.totalCount}
          pageCount={pagination.pageCount}
          hasNext={pagination.hasNext}
          loading={loading}
          onPageChange={selectPage}
        />
      </section>

      <TradeDetailCard
        trade={selectedTrade}
        loading={detailLoading}
        error={detailError}
        onRetry={selectedTradeId ? () => setDetailRefreshToken((token) => token + 1) : null}
      />
      </div>
    </div>
  );
}
