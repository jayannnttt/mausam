"""IMD adapter — official India Meteorological Department forecast access.

Facts verified from this environment (during development):

* Every documented endpoint under ``https://api.imd.gov.in/api/v1/…`` returns
  ``HTTP 401 {"error":"API key missing"}`` without an issued key. There is no
  free, keyless official feed; IMD issues keys on request.
* ``city.imd.gov.in`` additionally requires IP whitelisting
  (``HTTP 401 IP … needs to be whitelisted``).

Consequences implemented here (no fabrication, ever):

* Without ``IMD_API_KEY`` every IMD result is ``available: false`` with the
  exact reason, and the UI shows an honest "IMD comparison unavailable" state.
* With a key, the adapter fetches IMD's city forecast and extracts day-wise
  rainfall entries **defensively**: if the response cannot be parsed into
  date + rainfall, the result is again ``available: false`` with the reason.
* IMD's public API exposes current/near-future forecasts only — there is no
  archived-forecast endpoint, so historical IMD verification is possible only
  when day-wise entries overlap the requested window.

Rainfall categories follow IMD's published 24-hour classes:
No rain < 0.1 mm, Light 0.1-15.5, Moderate 15.6-64.4, Heavy 64.5-115.5,
Very heavy 115.6-204.4, Extremely heavy > 204.4.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from ..config import IMD_API_KEY, IMD_BASE_URL, IMD_DISTRICT_ID

USER_AGENT = "mausam-sense-research/1.0 (hackathon prototype)"

CATEGORY_BOUNDS_MM: list[tuple[str, float, float]] = [
    # Half-open [low, high) intervals that exactly cover IMD's published
    # 24-hour classes: No rain <0.1, Light 0.1–15.5, Moderate 15.6–64.4,
    # Heavy 64.5–115.5, Very heavy 115.6–204.4, Extremely heavy >204.4.
    ("No rain", 0.0, 0.1),
    ("Light rain", 0.1, 15.6),
    ("Moderate rain", 15.6, 64.5),
    ("Heavy rain", 64.5, 115.6),
    ("Very heavy rain", 115.6, 204.5),
    ("Extremely heavy rain", 204.5, float("inf")),
]

CATEGORY_LABELS = [c[0] for c in CATEGORY_BOUNDS_MM]


def category_from_mm(mm: float) -> str:
    """Map a 24-hour rainfall amount (mm) to an IMD category."""
    if mm != mm:  # NaN
        return "Unknown"
    for label, low, high in CATEGORY_BOUNDS_MM:
        if low <= mm < high:
            return label
    return CATEGORY_LABELS[-1]


def imd_configured() -> bool:
    return bool(IMD_API_KEY)


def _get(url: str, timeout: float = 20.0) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "x-api-key": IMD_API_KEY,
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


# --------------------------------------------------------------------------- #
# Defensive parsing
# --------------------------------------------------------------------------- #

_DATE_KEYS = (
    "date",
    "valid_date",
    "validDate",
    "valid_from",
    "validfrom",
    "forecast_date",
    "day",
    "dt",
    "for_date",
)
_CATEGORY_KEYS = (
    "rain",
    "rainfall",
    "weather",
    "forecast",
    "pred",
    "category",
    "main",
    "sky",
    "condition",
    "title",
)
_MM_KEYS = (
    "rain_mm",
    "rainfall_mm",
    "precipitation_mm",
    "amount_mm",
    "mm",
    "value",
    "rain_amount_mm",
)
_DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y")


def _parse_date(value: Any) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            ts = float(value)
            if ts > 1e12:  # epoch milliseconds
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        except (ValueError, OverflowError, OSError):
            return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text[:11].strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if match:
        return match.group(1)
    # e.g. "Mon, 05 Jan 2026" — weekday prefix then day-month-year.
    match = re.search(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})", text)
    if match:
        for fmt in ("%d %b %Y", "%d %B %Y"):
            try:
                return datetime.strptime(match.group(1), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def _first_key(obj: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in obj:
            return obj[key]
    lower = {str(k).lower(): v for k, v in obj.items()}
    for key in keys:
        value = lower.get(key.lower())
        if value is not None:
            return value
    return None


def _walk_dicts(node: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(node, dict):
        found.append(node)
        for value in node.values():
            found.extend(_walk_dicts(value))
    elif isinstance(node, list):
        for value in node:
            found.extend(_walk_dicts(value))
    return found


def parse_daywise_forecast(
    raw: Any, start: str, end: str
) -> tuple[list[dict[str, Any]], str | None]:
    """Extract day-wise rainfall entries covering ``[start, end]``.

    Returns ``(rows, reason)``. ``rows`` is empty when nothing usable was
    found, and ``reason`` explains why — callers must surface the reason
    instead of inventing IMD numbers.
    """
    rows: dict[str, dict[str, Any]] = {}
    for obj in _walk_dicts(raw):
        date = _parse_date(_first_key(obj, _DATE_KEYS))
        if date is None or not (start <= date <= end):
            continue
        amount = _first_key(obj, _MM_KEYS)
        category_raw = _first_key(obj, _CATEGORY_KEYS)

        amount_mm: float | None = None
        if isinstance(amount, (int, float)) and not isinstance(amount, bool):
            amount_mm = float(amount)
        elif isinstance(category_raw, (int, float)) and not isinstance(category_raw, bool):
            value = float(category_raw)
            if value < 1000:  # plausibly mm in a "rain" field
                amount_mm = value

        category: str | None = None
        if isinstance(category_raw, str):
            category = category_raw.strip()[:120] or None
        if category is None and amount_mm is not None:
            category = category_from_mm(amount_mm)
        if category is None and amount_mm is None:
            continue
        rows[date] = {"date": date, "category": category, "amount_mm": amount_mm}

    if not rows:
        return [], (
            "IMD response did not contain any parseable day-wise rainfall entry for the "
            "requested window (schema changes cannot be confirmed without a live key)."
        )
    return sorted(rows.values(), key=lambda r: r["date"]), None


def _normalise_category(text: str) -> str:
    """Map free-text IMD wording onto the standard IMD class labels."""
    t = text.lower().strip()
    if not t:
        return "Unknown"
    if "extremely" in t:
        return "Extremely heavy rain"
    if "very heavy" in t:
        return "Very heavy rain"
    if "heavy" in t:
        return "Heavy rain"
    if "moderate" in t:
        return "Moderate rain"
    if "light" in t:
        return "Light rain"
    if any(word in t for word in ("no rain", "nil", "clear", "dry", "mainly dry", "no significant")):
        return "No rain"
    if "rain" in t or "shower" in t or "thunder" in t:
        return "Light rain"
    return t[:40]


# --------------------------------------------------------------------------- #
# Scoring IMD against observations
# --------------------------------------------------------------------------- #


def score_imd_source(imd_result: dict[str, Any], observed: Any) -> dict[str, Any]:
    """Score an IMD day-wise forecast against aligned observations.

    * Amount metrics are computed only for entries where IMD returned a
      numeric rainfall amount (mm).
    * Category metrics (exact match / within one IMD class) are computed when
      an entry has a text category — observed rainfall is mapped to the same
      IMD classes, so no millimetre values are inferred from categories.
    """
    import numpy as np
    import pandas as pd

    from ml import metrics as M

    if not imd_result or not imd_result.get("available"):
        return {
            "available": False,
            "source": (imd_result or {}).get(
                "source", "India Meteorological Department (IMD)"
            ),
            "reason": (imd_result or {}).get("reason", "IMD source unavailable."),
            "rows": [],
        }

    observed_series = pd.Series(observed).dropna()
    obs_map = {
        pd.Timestamp(d).strftime("%Y-%m-%d"): float(v) for d, v in observed_series.items()
    }
    rows = imd_result.get("rows", [])
    matched = [r for r in rows if r["date"] in obs_map]
    unmatched = [r["date"] for r in rows if r["date"] not in obs_map]

    out: dict[str, Any] = {
        "available": bool(matched),
        "source": imd_result.get("source"),
        "endpoint": imd_result.get("endpoint"),
        "unit_note": imd_result.get("unit_note"),
        "forecast_dates": len(rows),
        "matched_dates": len(matched),
        "unmatched_dates": unmatched,
        "rows": rows,
    }
    if not matched:
        out["available"] = False
        out["reason"] = (
            "IMD entries did not overlap the verified observation window "
            f"({len(rows)} forecast entries, 0 overlapping dates)."
        )
        return out

    # ---- amount metrics (only where IMD provided numeric mm) ---- #
    amount_rows = [r for r in matched if r.get("amount_mm") is not None]
    if len(amount_rows) >= 5:
        obs_amt = np.array([obs_map[r["date"]] for r in amount_rows], dtype=float)
        fc_amt = np.array([r["amount_mm"] for r in amount_rows], dtype=float)
        out["amount"] = M.regression_metrics(obs_amt, fc_amt)
        out["overunder"] = M.overunder_report(obs_amt, fc_amt)
        out["occurrence"] = M.rain_classification_metrics(
            obs_amt, (fc_amt >= 1.0).astype(float), prob_threshold=0.5
        )
    else:
        out["amount_reason"] = (
            f"Only {len(amount_rows)} entries carried a numeric rainfall amount from IMD — "
            "too few for amount metrics (IMD city forecasts are frequently text categories)."
        )

    # ---- category metrics ---- #
    category_pairs: list[tuple[str, str]] = []
    for row in matched:
        category = row.get("category")
        if not category:
            continue
        category_pairs.append((category_from_mm(obs_map[row["date"]]), _normalise_category(category)))
    if category_pairs:
        index = {label: i for i, label in enumerate(CATEGORY_LABELS)}
        exact = sum(1 for o, p in category_pairs if o == p)
        within_one = 0
        confusion: dict[str, int] = {}
        for obs_cat, pred_cat in category_pairs:
            key = f"{obs_cat} -> {pred_cat}"
            confusion[key] = confusion.get(key, 0) + 1
            oi, pi = index.get(obs_cat), index.get(pred_cat)
            if oi is not None and pi is not None and abs(oi - pi) <= 1:
                within_one += 1
        n = len(category_pairs)
        out["category"] = {
            "n": n,
            "exact_accuracy": exact / n,
            "within_one_class_accuracy": within_one / n,
            "confusion": confusion,
            "note": "Observed rainfall is mapped to IMD 24-hour classes and compared with "
            "IMD's text categories. No millimetre values are inferred from categories.",
        }
    else:
        out["category_reason"] = "No IMD text categories were parseable for this window."
    return out


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #


def imd_forecast_for_window(start: str, end: str) -> dict[str, Any]:
    """Fetch IMD's city forecast and keep entries inside ``[start, end]``."""
    if not IMD_API_KEY:
        return {
            "available": False,
            "source": "India Meteorological Department (IMD)",
            "reason": "No IMD API key configured (IMD_API_KEY). Every api.imd.gov.in "
            "endpoint returns HTTP 401 without an issued key, so no official IMD numbers "
            "are shown - none are invented.",
            "rows": [],
        }
    if not IMD_DISTRICT_ID:
        return {
            "available": False,
            "source": "India Meteorological Department (IMD)",
            "reason": "IMD_API_KEY is set but IMD_DISTRICT_ID is missing; IMD identifies "
            "cities/districts by numeric id, so a forecast cannot be requested.",
            "rows": [],
        }

    url = f"{IMD_BASE_URL}/cityforecast?id={IMD_DISTRICT_ID}"
    try:
        raw = _get(url)
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")[:200]
        except Exception:
            pass
        reason = f"IMD request failed with HTTP {exc.code}."
        if exc.code in (401, 403):
            reason += " The configured key was rejected or IP whitelisting is required."
        return {
            "available": False,
            "source": "India Meteorological Department (IMD)",
            "reason": f"{reason} {body}".strip(),
            "rows": [],
        }
    except Exception as exc:  # network failures
        return {
            "available": False,
            "source": "India Meteorological Department (IMD)",
            "reason": f"IMD request failed: {exc}",
            "rows": [],
        }

    rows, parse_reason = parse_daywise_forecast(raw, start, end)
    if not rows:
        return {
            "available": False,
            "source": "India Meteorological Department (IMD)",
            "reason": parse_reason,
            "rows": [],
        }
    return {
        "available": True,
        "source": "India Meteorological Department (IMD)",
        "endpoint": url.split("?")[0],
        "rows": rows,
        "unit_note": "Amounts are mm when IMD returned numeric rainfall; otherwise only the "
        "IMD text category is available and verification happens at category level.",
    }
