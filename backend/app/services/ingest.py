from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import yaml
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import get_settings
from ..models import CommitteeRole, Issuer, Politician, RawTradePayload, Trade
from ..utils import parse_human_date, parse_money_range, slugify
from .market_data import enrich_issuer_metadata


settings = get_settings()


@dataclass
class ScrapedTrade:
    source_trade_id: str
    politician_name: str
    party: str | None
    chamber: str | None
    state: str | None
    issuer_name: str
    ticker: str | None
    disclosure_date: object | None
    transaction_date: object | None
    disclosure_lag_days: int | None
    owner_type: str | None
    transaction_type: str
    amount_text: str | None
    price_at_trade: float | None
    notes: str | None
    raw_payload: dict


class CapitolTradesScraper:
    def __init__(self) -> None:
        self.base_url = settings.capitol_trades_base_url
        self.headers = {"User-Agent": settings.user_agent}

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3))
    def _get(self, url: str) -> str:
        response = httpx.get(url, headers=self.headers, timeout=30.0)
        response.raise_for_status()
        return response.text

    def fetch_page(self, page: int = 1, page_size: int | None = None) -> str:
        size = page_size or settings.capitol_trades_page_size
        return self._get(f"{self.base_url}?page={page}&pageSize={size}")

    def scrape_page(self, page: int = 1) -> list[ScrapedTrade]:
        return self.parse_html(self.fetch_page(page))

    def parse_html(self, html: str) -> list[ScrapedTrade]:
        soup = BeautifulSoup(html, "lxml")
        table_rows = [row for row in soup.find_all("tr") if row.find("td")]
        if table_rows:
            trades = []
            for index, row in enumerate(table_rows):
                trade = self._parse_table_row(row, index)
                if trade:
                    trades.append(trade)
            if trades:
                return trades

        # Prefer extracting div texts to preserve ordering across parsers
        lines = [div.get_text(strip=True) for div in soup.find_all("div")]
        trades: list[ScrapedTrade] = []
        for idx, line in enumerate(lines):
            if line == "Goto trade detail page.":
                for offset in (14, 13):
                    if idx >= offset:
                        trade = self._parse_chunk(lines[idx - offset : idx + 1], len(trades))
                        if trade:
                            trades.append(trade)
                            break
        return trades

    def _parse_table_row(self, row, index: int) -> ScrapedTrade | None:
        try:
            politician_name = _text_or_none(row.select_one("h2.politician-name"))
            party = _text_or_none(row.select_one(".politician-info .party"))
            chamber = _text_or_none(row.select_one(".politician-info .chamber"))
            state = _text_or_none(row.select_one(".politician-info .us-state-compact"))
            issuer_name = _text_or_none(row.select_one(".issuer-name"))
            ticker_text = _text_or_none(row.select_one(".issuer-ticker"))
            ticker = ticker_text.split(":")[0] if ticker_text and ":" in ticker_text else ticker_text

            cells = row.find_all("td")
            if len(cells) < 10 or not politician_name or not issuer_name:
                return None

            disclosure_date = _parse_table_date(list(cells[2].stripped_strings))
            transaction_date = _parse_table_date(list(cells[3].stripped_strings))
            lag = _extract_int(" ".join(cells[4].stripped_strings))
            owner_type = " ".join(cells[5].stripped_strings) or None
            transaction_type = " ".join(cells[6].stripped_strings).lower()
            amount_text = " ".join(cells[7].stripped_strings) or None
            price = _parse_price(" ".join(cells[8].stripped_strings))

            detail_link = next((a.get("href") for a in row.find_all("a", href=True) if "/trades/" in a.get("href", "")), None)
            trade_id = detail_link.rsplit("/", 1)[-1] if detail_link else None
            source_trade_id = trade_id or slugify(
                "-".join(filter(None, [politician_name, issuer_name, str(transaction_date), transaction_type, str(index)]))
            )

            return ScrapedTrade(
                source_trade_id=source_trade_id,
                politician_name=politician_name,
                party=party,
                chamber=chamber,
                state=state,
                issuer_name=issuer_name,
                ticker=ticker,
                disclosure_date=disclosure_date,
                transaction_date=transaction_date,
                disclosure_lag_days=lag,
                owner_type=owner_type,
                transaction_type=transaction_type,
                amount_text=amount_text,
                price_at_trade=price,
                notes=None,
                raw_payload={
                    "detail_url": detail_link,
                    "issuer_ticker": ticker_text,
                    "cells": [" ".join(cell.stripped_strings) for cell in cells],
                },
            )
        except Exception:
            return None

    def _parse_chunk(self, chunk: list[str], index: int) -> ScrapedTrade | None:
        try:
            def _is_party_line(s: str) -> bool:
                if not s:
                    return False
                parts = s.split()
                if parts[0] in ("Democratic", "Republican", "Independent", "Libertarian", "Green"):
                    return True
                if "House" in s or "Senate" in s:
                    return True
                return False

            # Prefer locating the ticker and parse relative to it for robustness
            t_idx = None
            for i, v in enumerate(chunk):
                if ":" in v:
                    t_idx = i
                    break

            if t_idx is None or t_idx < 1:
                politician_name = chunk[0]
                pcs = chunk[1].split()
                party = pcs[0] if pcs else None
                chamber = pcs[1] if len(pcs) > 1 else None
                state = pcs[2] if len(pcs) > 2 else None
                issuer_name = chunk[2]
                ticker = chunk[3].split(":")[0] if ":" in chunk[3] else None
                disclosure_date = parse_human_date(f"{chunk[4]} {chunk[5]}")
                transaction_date = parse_human_date(f"{chunk[6]} {chunk[7]}")
                lag = int(chunk[9]) if chunk[8].lower() == "days" and chunk[9].isdigit() else None
                owner_type = chunk[10] if len(chunk) > 10 else None
                transaction_type = chunk[11].lower() if len(chunk) > 11 else ""
                amount_text = chunk[12] if len(chunk) > 12 else None
                price = _parse_price(chunk[13]) if len(chunk) > 13 else None
            else:
                # Build fields relative to the ticker index
                # Politician name is typically before any party/chamber/state line
                pre_t = chunk[:t_idx]
                politician_name = None
                party = None
                chamber = None
                state = None
                def _looks_like_person_name(s: str) -> bool:
                    if not s:
                        return False
                    if ":" in s or "$" in s or any(ch.isdigit() for ch in s):
                        return False
                    tokens = s.split()
                    if len(tokens) < 2 or len(tokens) > 4:
                        return False
                    company_suffixes = {"Corp", "Inc", "LLC", "Ltd", "Co", "Company", "Corporation", "LLP"}
                    if any(tok in company_suffixes for tok in tokens):
                        return False
                    for tok in tokens:
                        if not tok.isalpha():
                            return False
                        if not tok[0].isupper():
                            return False
                    return True

                # Prefer a chunk entry that looks like a person's name
                for item in pre_t:
                    if _looks_like_person_name(item):
                        politician_name = item
                        break
                if politician_name is None:
                    # fallback: first non-party line
                    for item in pre_t:
                        if not _is_party_line(item):
                            politician_name = item
                            break
                if politician_name is None:
                    politician_name = pre_t[0] if pre_t else ""
                # find party line among pre_t
                party_line = next((p for p in pre_t if _is_party_line(p)), None)
                if party_line:
                    pcs = party_line.split()
                    party = pcs[0] if pcs else None
                    chamber = pcs[1] if len(pcs) > 1 else None
                    state = pcs[2] if len(pcs) > 2 else None
                issuer_name = chunk[t_idx - 1] if t_idx - 1 >= 0 else ""
                ticker = chunk[t_idx].split(":")[0] if ":" in chunk[t_idx] else None
                disclosure_date = parse_human_date(f"{chunk[t_idx+1]} {chunk[t_idx+2]}") if len(chunk) > t_idx + 2 else None
                transaction_date = parse_human_date(f"{chunk[t_idx+3]} {chunk[t_idx+4]}") if len(chunk) > t_idx + 4 else None
                lag = int(chunk[t_idx+6]) if len(chunk) > t_idx + 6 and chunk[t_idx+5].lower() == "days" and chunk[t_idx+6].isdigit() else None
                owner_type = chunk[t_idx+7] if len(chunk) > t_idx + 7 else None
                transaction_type = chunk[t_idx+8].lower() if len(chunk) > t_idx + 8 else ""
                amount_text = chunk[t_idx+9] if len(chunk) > t_idx + 9 else None
                price = _parse_price(chunk[t_idx+10]) if len(chunk) > t_idx + 10 else None

            source_trade_id = slugify(
                "-".join(filter(None, [politician_name, issuer_name, str(transaction_date), transaction_type, str(index)]))
            )
            return ScrapedTrade(
                source_trade_id=source_trade_id,
                politician_name=politician_name,
                party=party,
                chamber=chamber,
                state=state,
                issuer_name=issuer_name,
                ticker=ticker,
                disclosure_date=disclosure_date,
                transaction_date=transaction_date,
                disclosure_lag_days=lag,
                owner_type=owner_type,
                transaction_type=transaction_type,
                amount_text=amount_text,
                price_at_trade=price,
                notes=None,
                raw_payload={"chunk": chunk},
            )
        except (IndexError, ValueError):
            return None


def _parse_price(value: str | None) -> float | None:
    if not value or value == "N/A":
        return None
    value = value.replace("$", "").replace(",", "")
    try:
        return float(value)
    except ValueError:
        return None


def _text_or_none(node) -> str | None:
    if node is None:
        return None
    text = node.get_text(" ", strip=True)
    return text or None


def _extract_int(value: str | None) -> int | None:
    if not value:
        return None
    digits = "".join(ch for ch in value if ch.isdigit())
    return int(digits) if digits else None


def _parse_table_date(parts: list[str]) -> object | None:
    if not parts:
        return None
    normalized = " ".join(parts).strip()
    direct = parse_human_date(normalized)
    if direct:
        return direct
    if len(parts) == 1:
        tokens = parts[0].split()
        if len(tokens) >= 2:
            tail = tokens[-1].lower()
            if tail == "today":
                return datetime.now(UTC).date()
            if tail == "yesterday":
                return datetime.now(UTC).date() - timedelta(days=1)
    if len(parts) == 2:
        head, tail = parts
        if tail.lower() == "today":
            return datetime.now(UTC).date()
        if tail.lower() == "yesterday":
            return datetime.now(UTC).date() - timedelta(days=1)
        direct = parse_human_date(f"{head} {tail}")
        if direct:
            return direct
    return None


def upsert_trade(db: Session, scraped: ScrapedTrade) -> Trade:
    raw = db.execute(select(RawTradePayload).where(RawTradePayload.source_trade_id == scraped.source_trade_id)).scalar_one_or_none()
    if raw is None:
        raw = RawTradePayload(source_trade_id=scraped.source_trade_id, payload=scraped.raw_payload)
        db.add(raw)
        db.flush()

    politician = db.execute(select(Politician).where(Politician.slug == slugify(scraped.politician_name))).scalar_one_or_none()
    if politician is None:
        parts = scraped.politician_name.split()
        politician = Politician(
            slug=slugify(scraped.politician_name),
            full_name=scraped.politician_name,
            first_name=parts[0] if parts else None,
            last_name=parts[-1] if parts else None,
            party=scraped.party,
            chamber=scraped.chamber,
            state=scraped.state,
        )
        db.add(politician)
        db.flush()

    issuer = None
    if scraped.ticker:
        issuer = db.execute(select(Issuer).where(Issuer.ticker == scraped.ticker)).scalar_one_or_none()
        if issuer is None:
            issuer = Issuer(ticker=scraped.ticker, issuer_name=scraped.issuer_name, sector=None)
            db.add(issuer)
            db.flush()
            try:
                enrich_issuer_metadata(db, scraped.ticker)
            except Exception:
                pass

    amount_low, amount_high, amount_mid = parse_money_range(scraped.amount_text)
    trade = db.execute(select(Trade).where(Trade.source_trade_id == scraped.source_trade_id)).scalar_one_or_none()
    if trade is None:
        trade = Trade(source_trade_id=scraped.source_trade_id, raw_payload_id=raw.id, politician_id=politician.id, issuer_id=issuer.id if issuer else None)
    trade.politician_name = scraped.politician_name
    trade.ticker = scraped.ticker
    trade.issuer_name = scraped.issuer_name
    trade.asset_type = "stock"
    trade.transaction_type = scraped.transaction_type
    trade.owner_type = scraped.owner_type
    trade.transaction_date = scraped.transaction_date
    trade.disclosure_date = scraped.disclosure_date
    trade.disclosure_lag_days = scraped.disclosure_lag_days
    trade.amount_text = scraped.amount_text
    trade.amount_low = amount_low
    trade.amount_high = amount_high
    trade.amount_mid = amount_mid
    trade.price_at_trade = scraped.price_at_trade
    trade.chamber = scraped.chamber
    trade.party = scraped.party
    trade.state = scraped.state
    trade.notes = scraped.notes
    trade.metadata_json = scraped.raw_payload
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


class CongressMetadataImporter:
    def sync_remote_metadata(self, db: Session) -> dict:
        legislators_text = self._get(settings.legislators_url)
        legislators = yaml.safe_load(legislators_text)
        legislator_count = self._apply_legislators(db, legislators)
        committee_count = 0
        metadata_status = {"legislators_updated": legislator_count, "committee_roles_added": committee_count}
        try:
            committee_text = self._get(settings.committee_memberships_url)
            committee_payload = json.loads(committee_text)
            membership_rows = _flatten_committee_payload(committee_payload)
            committee_count = self.apply_committee_memberships(db, membership_rows)
            metadata_status["committee_roles_added"] = committee_count
        except Exception:
            # Committee memberships are optional enrichment; keep ingest working when the upstream path changes.
            metadata_status["committee_metadata_unavailable"] = True
        return metadata_status

    @retry(wait=wait_exponential(min=1, max=8), stop=stop_after_attempt(3))
    def _get(self, url: str) -> str:
        response = httpx.get(url, headers={"User-Agent": settings.user_agent}, timeout=30.0)
        response.raise_for_status()
        return response.text

    def import_legislators_from_cache(self, db: Session, path: str | Path) -> int:
        text = Path(path).read_text(encoding="utf-8")
        if str(path).endswith((".yaml", ".yml")):
            entries = yaml.safe_load(text)
        else:
            entries = json.loads(text)
        return self._apply_legislators(db, entries)

    def apply_committee_memberships(self, db: Session, memberships: list[dict]) -> int:
        created = 0
        db.query(CommitteeRole).delete()
        db.commit()
        for row in memberships:
            bioguide = row.get("bioguide")
            if not bioguide:
                continue
            politician = db.execute(select(Politician).where(Politician.bioguide_id == bioguide)).scalar_one_or_none()
            if politician is None:
                continue
            db.add(
                CommitteeRole(
                    politician_id=politician.id,
                    committee_name=row.get("committee", "Unknown committee"),
                    role_title=row.get("title"),
                    chamber=row.get("chamber"),
                    metadata_json=row,
                )
            )
            created += 1
        db.commit()
        return created

    def _apply_legislators(self, db: Session, entries: list[dict]) -> int:
        updated = 0
        for entry in entries:
            name = entry.get("name", {})
            official = " ".join(filter(None, [name.get("first"), name.get("middle"), name.get("last")])).strip()
            if not official:
                continue
            bioguide = entry.get("id", {}).get("bioguide")
            politician = db.execute(select(Politician).where(Politician.bioguide_id == bioguide)).scalar_one_or_none()
            if politician is None:
                politician = db.execute(select(Politician).where(Politician.slug == slugify(official))).scalar_one_or_none()
            if politician is None:
                politician = Politician(slug=slugify(official), full_name=official)
            terms = entry.get("terms", [])
            last_term = terms[-1] if terms else {}
            politician.bioguide_id = bioguide
            politician.first_name = name.get("first")
            politician.last_name = name.get("last")
            politician.party = last_term.get("party")
            politician.state = last_term.get("state")
            politician.chamber = {"sen": "Senate", "rep": "House"}.get(last_term.get("type"), last_term.get("type"))
            politician.external_ids = entry.get("id", {})
            db.add(politician)
            updated += 1
        db.commit()
        return updated


def _flatten_committee_payload(payload: dict) -> list[dict]:
    rows: list[dict] = []
    for chamber, committees in payload.items():
        if not isinstance(committees, dict):
            continue
        for committee_code, members in committees.items():
            for bioguide, member_data in members.items():
                rows.append(
                    {
                        "bioguide": bioguide,
                        "committee": committee_code,
                        "title": member_data.get("title"),
                        "chamber": chamber,
                        "source": "unitedstates/congress",
                    }
                )
    return rows
