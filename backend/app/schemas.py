from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class APIMessage(BaseModel):
    message: str


class JobRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_type: str
    status: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    message: str | None = None
    details: dict | None = None


class PagingEnvelope(BaseModel):
    total_count: int
    page: int
    page_size: int
    page_count: int


class CommitteeRoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    committee_name: str
    role_title: str | None = None
    chamber: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class PoliticianSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    party: str | None = None
    chamber: str | None = None
    state: str | None = None


class PoliticianProfile(PoliticianSummary):
    bioguide_id: str | None = None
    district: str | None = None
    roles: list[CommitteeRoleResponse] = Field(default_factory=list)
    trade_count: int = 0
    buy_count: int = 0
    sell_count: int = 0
    average_disclosure_lag: float | None = None
    most_traded_sectors: list[str] = Field(default_factory=list)
    insider_risk_summary: dict = Field(default_factory=dict)


class PoliticianActivitySummary(BaseModel):
    trade_count: int = 0
    signal_count: int = 0
    buy_count: int = 0
    sell_count: int = 0
    average_disclosure_lag: float | None = None
    lag_distribution: list[dict] = Field(default_factory=list)
    sector_exposure: list[dict] = Field(default_factory=list)


class PoliticianActivityResponse(BaseModel):
    politician: PoliticianSummary
    summary: PoliticianActivitySummary
    trades: list["TradeEvent"] = Field(default_factory=list)
    signals: list["SignalResponse"] = Field(default_factory=list)


class PoliticianComparisonEntry(BaseModel):
    politician_id: int
    name: str
    party: str | None = None
    chamber: str | None = None
    trade_count: int
    buy_count: int
    sell_count: int
    average_disclosure_lag: float | None = None
    top_sectors: list[str] = Field(default_factory=list)
    signal_count: int = 0
    insider_risk_ratio: float = 0.0


class PoliticianComparisonResponse(BaseModel):
    entries: list[PoliticianComparisonEntry] = Field(default_factory=list)


class TickerSummary(BaseModel):
    ticker: str
    issuer_name: str
    sector: str | None = None


class PriceHistoryPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    adj_close: float | None = None
    volume: float | None = None


class TradeMarker(BaseModel):
    id: int
    date: date
    price: float | None = None
    label: str
    politician_name: str
    transaction_type: str
    transaction_date: date | None = None
    disclosure_date: date | None = None
    amount_text: str | None = None
    disclosure_lag_days: int | None = None


class TradeEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    politician_id: int
    politician_name: str
    ticker: str | None = None
    issuer_name: str
    transaction_type: str
    owner_type: str | None = None
    transaction_date: date | None = None
    disclosure_date: date | None = None
    disclosure_lag_days: int | None = None
    amount_text: str | None = None
    amount_low: float | None = None
    amount_high: float | None = None
    amount_mid: float | None = None
    price_at_trade: float | None = None
    chamber: str | None = None
    party: str | None = None
    state: str | None = None
    notes: str | None = None


class TradeDetailResponse(TradeEvent):
    raw_payload: dict | None = None
    issuer_sector: str | None = None
    issuer_industry: str | None = None
    issuer_exchange: str | None = None
    politician_slug: str | None = None
    politician_party: str | None = None
    politician_chamber: str | None = None
    politician_state: str | None = None
    politician_roles: list[CommitteeRoleResponse] = Field(default_factory=list)


class SignalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    signal_date: date
    signal_type: str
    ticker: str | None = None
    politician_id: int | None = None
    score: float
    confidence: float | None = None
    rationale: str
    recommendation: str | None = None
    historical_win_rate: float | None = None
    metadata_json: dict | None = None


class SignalExplainabilityResponse(BaseModel):
    signal: SignalResponse
    linked_trade: TradeEvent | None = None
    linked_prediction: dict | None = None
    linked_feature_snapshot: dict | None = None
    related_predictions: list[dict] = Field(default_factory=list)


class TickerProfile(TickerSummary):
    trade_count: int = 0
    politician_count: int = 0
    buy_count: int = 0
    sell_count: int = 0
    latest_signals: list[SignalResponse] = Field(default_factory=list)
    recent_trades: list[TradeEvent] = Field(default_factory=list)
    model_scores: dict = Field(default_factory=dict)


class StockComparisonSeries(BaseModel):
    ticker: str
    issuer_name: str
    sector: str | None = None
    latest_close: float | None = None
    change_pct: float | None = None
    history: list[PriceHistoryPoint] = Field(default_factory=list)
    trade_markers: list[TradeMarker] = Field(default_factory=list)


class StockComparisonResponse(BaseModel):
    tickers: list[str] = Field(default_factory=list)
    series: list[StockComparisonSeries] = Field(default_factory=list)


class TickerPriceHistoryResponse(BaseModel):
    ticker: str
    issuer_name: str
    sector: str | None = None
    history: list[PriceHistoryPoint] = Field(default_factory=list)
    trade_markers: list[TradeMarker] = Field(default_factory=list)
    latest_close: float | None = None
    previous_close: float | None = None
    change: float | None = None
    change_pct: float | None = None


class SummaryMetric(BaseModel):
    label: str
    value: str | float | int
    delta: str | None = None


class SystemStatusResponse(BaseModel):
    latest_trade_disclosure_date: date | None = None
    latest_market_bar_date: date | None = None
    latest_completed_ingest_job: JobRunResponse | None = None
    latest_model_retrain_at: datetime | None = None
    signal_count: int = 0
    subscription_count: int = 0


class AnalyticsSummary(BaseModel):
    metrics: list[SummaryMetric]
    top_traders: list[dict]
    top_stocks: list[dict]
    sector_heatmap: list[dict]
    lag_distribution: list[dict]
    prediction_counter: dict


class BacktestResult(BaseModel):
    period_start: date | None = None
    period_end: date | None = None
    cumulative_return: float
    benchmark_return: float
    hit_rate: float
    max_drawdown: float
    trade_count: int
    sharpe_like: float
    annualized_volatility: float = 0.0
    daily_curve: list[dict]
    trade_ledger: list[dict]


class AlertSubscriptionCreate(BaseModel):
    email: EmailStr
    enabled: bool = True
    minimum_confidence: float = 0.6
    signal_types: list[str] = Field(default_factory=lambda: ["high_confidence", "unusual_buying", "insider_risk"])


class AlertSubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    enabled: bool
    minimum_confidence: float
    signal_types: list[str]


class AlertSubscriptionUpdate(BaseModel):
    enabled: bool | None = None
    minimum_confidence: float | None = None
    signal_types: list[str] | None = None


class AlertHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subscription_id: int | None = None
    subscription_email: EmailStr | None = None
    signal_id: int | None = None
    signal_type: str | None = None
    ticker: str | None = None
    status: str
    sent_at: datetime | None = None
    created_at: datetime | None = None
    payload: dict | None = None


class AlertDispatchResponse(BaseModel):
    status: str
    message: str
    recipient: EmailStr | None = None
    smtp_enabled: bool
    alerts_processed: int = 0
    history_id: int | None = None


class BacktestQuery(BaseModel):
    holding_days: int = 30
    min_confidence: float = 0.65
    signal_type: str | None = None
    transaction_cost_bps: float = 10.0


class BacktestComparisonScenario(BacktestQuery):
    label: str


class BacktestComparisonRequest(BaseModel):
    scenarios: list[BacktestComparisonScenario] = Field(default_factory=list)


class BacktestScenarioResult(BaseModel):
    label: str
    result: BacktestResult


class BacktestComparisonResponse(BaseModel):
    scenarios: list[BacktestScenarioResult] = Field(default_factory=list)


class ResearchReportRequest(BaseModel):
    politician_id: int | None = None
    ticker: str | None = None
    signal_type: str | None = None
    min_confidence: float | None = None
    trade_limit: int = 100
    signal_limit: int = 100
    include_backtest: bool = False
    backtest: BacktestQuery | None = None


class ResearchReportResponse(BaseModel):
    generated_at: datetime
    filters: dict = Field(default_factory=dict)
    summary: AnalyticsSummary | None = None
    politician: PoliticianProfile | None = None
    stock: TickerProfile | None = None
    trades: list[TradeEvent] = Field(default_factory=list)
    signals: list[SignalResponse] = Field(default_factory=list)
    backtest: BacktestResult | None = None


PoliticianActivityResponse.model_rebuild()
