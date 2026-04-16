from __future__ import annotations

import math
import re
from datetime import date, datetime


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return value.strip("-")


def parse_human_date(value: str | None) -> date | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ("%d %b %Y", "%Y-%m-%d", "%d %B %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def parse_money_range(value: str | None) -> tuple[float | None, float | None, float | None]:
    if not value or value.lower() == "undisclosed":
        return None, None, None

    normalized = value.replace("$", "").replace(" ", "").replace("–", "-").upper()
    if "-" not in normalized:
        amount = _parse_single_amount(normalized)
        return amount, amount, amount

    low_text, high_text = normalized.split("-", 1)
    low = _parse_single_amount(low_text)
    high = _parse_single_amount(high_text)
    if low is None or high is None:
        return None, None, None
    return low, high, (low + high) / 2.0


def _parse_single_amount(value: str) -> float | None:
    multipliers = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}
    suffix = value[-1] if value else ""
    multiplier = multipliers.get(suffix, 1)
    if suffix in multipliers:
        value = value[:-1]
    value = value.replace(",", "")
    try:
        return float(value) * multiplier
    except ValueError:
        return None


def safe_pct_change(start: float | None, end: float | None) -> float | None:
    if start in (None, 0) or end is None:
        return None
    return (end - start) / start


def drawdown(series: list[float]) -> float:
    if not series:
        return 0.0
    peak = -math.inf
    max_dd = 0.0
    for value in series:
        peak = max(peak, value)
        if peak > 0:
            max_dd = min(max_dd, (value - peak) / peak)
    return abs(max_dd)
