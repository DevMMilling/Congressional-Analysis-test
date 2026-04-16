from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RawTradePayload(Base, TimestampMixin):
    __tablename__ = "raw_trade_payloads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(64), default="capitoltrades")
    source_trade_id: Mapped[str] = mapped_column(String(255), unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Politician(Base, TimestampMixin):
    __tablename__ = "politicians"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bioguide_id: Mapped[str | None] = mapped_column(String(32), unique=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(255), index=True)
    first_name: Mapped[str | None] = mapped_column(String(128))
    last_name: Mapped[str | None] = mapped_column(String(128), index=True)
    party: Mapped[str | None] = mapped_column(String(32), index=True)
    chamber: Mapped[str | None] = mapped_column(String(32), index=True)
    state: Mapped[str | None] = mapped_column(String(8), index=True)
    district: Mapped[str | None] = mapped_column(String(16))
    congress_gov_id: Mapped[str | None] = mapped_column(String(32))
    external_ids: Mapped[dict | None] = mapped_column(JSON, default=dict)

    roles: Mapped[list["CommitteeRole"]] = relationship(back_populates="politician", cascade="all, delete-orphan")
    trades: Mapped[list["Trade"]] = relationship(back_populates="politician")


class CommitteeRole(Base, TimestampMixin):
    __tablename__ = "committee_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    politician_id: Mapped[int] = mapped_column(ForeignKey("politicians.id"), index=True)
    source: Mapped[str] = mapped_column(String(64), default="congress")
    committee_name: Mapped[str] = mapped_column(String(255), index=True)
    role_title: Mapped[str | None] = mapped_column(String(255))
    chamber: Mapped[str | None] = mapped_column(String(32))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)

    politician: Mapped["Politician"] = relationship(back_populates="roles")


class Issuer(Base, TimestampMixin):
    __tablename__ = "issuers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    issuer_name: Mapped[str] = mapped_column(String(255), index=True)
    sector: Mapped[str | None] = mapped_column(String(128), index=True)
    industry: Mapped[str | None] = mapped_column(String(128))
    exchange: Mapped[str | None] = mapped_column(String(32))
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)

    trades: Mapped[list["Trade"]] = relationship(back_populates="issuer")
    market_bars: Mapped[list["MarketBar"]] = relationship(back_populates="issuer")


class Trade(Base, TimestampMixin):
    __tablename__ = "trades"
    __table_args__ = (
        UniqueConstraint("source_trade_id", name="uq_trade_source_trade_id"),
        Index("ix_trade_politician_disclosure", "politician_id", "disclosure_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_trade_id: Mapped[str] = mapped_column(String(255), index=True)
    raw_payload_id: Mapped[int | None] = mapped_column(ForeignKey("raw_trade_payloads.id"))
    politician_id: Mapped[int] = mapped_column(ForeignKey("politicians.id"), index=True)
    issuer_id: Mapped[int | None] = mapped_column(ForeignKey("issuers.id"), index=True)
    politician_name: Mapped[str] = mapped_column(String(255))
    ticker: Mapped[str | None] = mapped_column(String(32), index=True)
    issuer_name: Mapped[str] = mapped_column(String(255))
    asset_type: Mapped[str | None] = mapped_column(String(128))
    transaction_type: Mapped[str] = mapped_column(String(32), index=True)
    owner_type: Mapped[str | None] = mapped_column(String(64))
    transaction_date: Mapped[date | None] = mapped_column(Date, index=True)
    disclosure_date: Mapped[date | None] = mapped_column(Date, index=True)
    disclosure_lag_days: Mapped[int | None] = mapped_column(Integer, index=True)
    amount_text: Mapped[str | None] = mapped_column(String(128))
    amount_low: Mapped[float | None] = mapped_column(Float)
    amount_high: Mapped[float | None] = mapped_column(Float)
    amount_mid: Mapped[float | None] = mapped_column(Float)
    price_at_trade: Mapped[float | None] = mapped_column(Float)
    chamber: Mapped[str | None] = mapped_column(String(32))
    party: Mapped[str | None] = mapped_column(String(32))
    state: Mapped[str | None] = mapped_column(String(8))
    notes: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)

    politician: Mapped["Politician"] = relationship(back_populates="trades")
    issuer: Mapped["Issuer"] = relationship(back_populates="trades")


class MarketBar(Base, TimestampMixin):
    __tablename__ = "market_bars"
    __table_args__ = (
        UniqueConstraint("ticker", "date", name="uq_market_bar_ticker_date"),
        Index("ix_market_bar_ticker_date_cover", "ticker", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issuer_id: Mapped[int | None] = mapped_column(ForeignKey("issuers.id"), index=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float | None] = mapped_column(Float)
    adj_close: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)

    issuer: Mapped["Issuer"] = relationship(back_populates="market_bars")


class FeatureSnapshot(Base, TimestampMixin):
    __tablename__ = "feature_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_key: Mapped[str] = mapped_column(String(255), index=True)
    feature_set: Mapped[str] = mapped_column(String(64), index=True)
    features: Mapped[dict] = mapped_column(JSON)
    target: Mapped[float | None] = mapped_column(Float)


class Prediction(Base, TimestampMixin):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    prediction_date: Mapped[date] = mapped_column(Date, index=True)
    model_name: Mapped[str] = mapped_column(String(128), index=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_key: Mapped[str] = mapped_column(String(255), index=True)
    score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float | None] = mapped_column(Float)
    prediction_payload: Mapped[dict | None] = mapped_column(JSON, default=dict)


class Signal(Base, TimestampMixin):
    __tablename__ = "signals"
    __table_args__ = (
        Index("ix_signal_type_confidence", "signal_type", "confidence"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    signal_date: Mapped[date] = mapped_column(Date, index=True)
    signal_type: Mapped[str] = mapped_column(String(128), index=True)
    ticker: Mapped[str | None] = mapped_column(String(32), index=True)
    politician_id: Mapped[int | None] = mapped_column(ForeignKey("politicians.id"), index=True)
    score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float | None] = mapped_column(Float)
    rationale: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(String(64))
    historical_win_rate: Mapped[float | None] = mapped_column(Float)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)


class AlertSubscription(Base, TimestampMixin):
    __tablename__ = "alert_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    minimum_confidence: Mapped[float] = mapped_column(Float, default=0.6)
    signal_types: Mapped[dict | None] = mapped_column(JSON, default=list)


class AlertHistory(Base, TimestampMixin):
    __tablename__ = "alert_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("alert_subscriptions.id"), index=True)
    signal_id: Mapped[int | None] = mapped_column(ForeignKey("signals.id"), index=True)
    status: Mapped[str] = mapped_column(String(64), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    payload: Mapped[dict | None] = mapped_column(JSON, default=dict)


class JobRun(Base, TimestampMixin):
    __tablename__ = "job_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_type: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(64), default="queued", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    message: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON, default=dict)
