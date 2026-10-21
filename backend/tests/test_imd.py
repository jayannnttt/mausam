"""IMD adapter tests: defensive parsing, category scoring, honest unavailability.

No test here ever hits the network — the point is that without a key (and
even with a key but an unparseable payload) the adapter reports
``available: false`` with a reason instead of inventing IMD numbers.
"""

from __future__ import annotations

import pytest

from app.services import imd as S


# --------------------------------------------------------------------------- #
# Categories
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "mm,expected",
    [
        (0.0, "No rain"),
        (0.05, "No rain"),
        (0.1, "Light rain"),
        (15.4, "Light rain"),
        (15.6, "Moderate rain"),
        (64.4, "Moderate rain"),
        (64.5, "Heavy rain"),
        (115.5, "Heavy rain"),
        (115.6, "Very heavy rain"),
        (204.4, "Very heavy rain"),
        (204.5, "Extremely heavy rain"),
        (1000.0, "Extremely heavy rain"),
    ],
)
def test_category_from_mm_bounds(mm, expected):
    assert S.category_from_mm(mm) == expected


def test_category_from_mm_nan_is_unknown():
    assert S.category_from_mm(float("nan")) == "Unknown"


# --------------------------------------------------------------------------- #
# Date parsing
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-01-05", "2026-01-05"),
        ("05-01-2026", "2026-01-05"),
        ("05/01/2026", "2026-01-05"),
        ("05-Jan-2026", "2026-01-05"),
        ("Mon, 05 Jan 2026", "2026-01-05"),
        ("garbage", None),
        (True, None),
        (None, None),
    ],
)
def test_parse_date_formats(raw, expected):
    assert S._parse_date(raw) == expected


# --------------------------------------------------------------------------- #
# Day-wise parsing
# --------------------------------------------------------------------------- #


def test_parse_daywise_finds_nested_entries():
    raw = {
        "data": {
            "forecast": [
                {"date": "2026-01-05", "rain": "Moderate rain"},
                {"date": "2026-01-06", "rain_mm": 12.5},
                {"date": "2026-01-07", "rain": "Light rain"},
            ]
        }
    }
    rows, reason = S.parse_daywise_forecast(raw, "2026-01-05", "2026-01-07")
    assert reason is None
    assert len(rows) == 3
    assert rows[1]["amount_mm"] == pytest.approx(12.5)
    # Numeric amount → category derived from IMD bounds.
    assert rows[1]["category"] == "Light rain"


def test_parse_daywise_respects_window():
    raw = [{"date": "2026-01-04", "rain": "Heavy rain"},
           {"date": "2026-01-08", "rain": "Heavy rain"}]
    rows, reason = S.parse_daywise_forecast(raw, "2026-01-05", "2026-01-07")
    assert rows == []
    assert reason is not None  # explainable, never invented


def test_parse_daywise_empty_payload_explains_reason():
    rows, reason = S.parse_daywise_forecast({"unexpected": "shape"}, "2026-01-01", "2026-01-07")
    assert rows == []
    assert "parseable" in reason


def test_parse_daywise_deduplicates_by_date():
    raw = [
        {"date": "2026-01-05", "rain": "Light rain"},
        {"date": "2026-01-05", "rain": "Moderate rain"},
    ]
    rows, _ = S.parse_daywise_forecast(raw, "2026-01-05", "2026-01-05")
    assert len(rows) == 1


# --------------------------------------------------------------------------- #
# Category normalisation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Heavy to very heavy rain", "Very heavy rain"),
        ("heavy rain", "Heavy rain"),
        ("moderate rain", "Moderate rain"),
        ("light rain", "Light rain"),
        ("No rain", "No rain"),
        ("mainly dry", "No rain"),
        ("thundershowers", "Light rain"),
    ],
)
def test_normalise_category(text, expected):
    assert S._normalise_category(text) == expected


# --------------------------------------------------------------------------- #
# Scoring
# --------------------------------------------------------------------------- #


def test_score_unavailable_imd_reports_reason_verbatim():
    result = {"available": False, "reason": "No IMD API key configured (IMD_API_KEY)."}
    out = S.score_imd_source(result, {"2026-01-05": 5.0})
    assert out["available"] is False
    assert "No IMD API key" in out["reason"]
    assert out["rows"] == []


def test_score_empty_dict_is_safe():
    out = S.score_imd_source({}, {})
    assert out["available"] is False


def test_score_no_overlap_dates_reports_unavailable():
    imd = {
        "available": True,
        "source": "India Meteorological Department (IMD)",
        "rows": [{"date": "2026-02-01", "category": "Light rain", "amount_mm": None}],
    }
    out = S.score_imd_source(imd, {"2026-01-05": 5.0})
    assert out["available"] is False
    assert "0 overlapping dates" in out["reason"]


def test_score_amount_metrics_need_five_numeric_rows():
    obs = {f"2026-01-{d:02d}": float(d * 2) for d in range(1, 11)}
    rows = [
        {"date": f"2026-01-{d:02d}", "category": None, "amount_mm": float(d * 2)}
        for d in range(1, 4)  # only 3 numeric amounts
    ]
    rows += [
        {"date": f"2026-01-{d:02d}", "category": "Light rain", "amount_mm": None}
        for d in range(4, 9)
    ]
    imd = {"available": True, "source": "IMD", "rows": rows}
    out = S.score_imd_source(imd, obs)
    assert out["available"] is True
    assert "amount" not in out  # too few numeric rows → explained, not faked
    assert "too few for amount metrics" in out["amount_reason"]
    # Category scoring still happens because text categories exist.
    assert out["category"]["n"] == 5


def test_score_category_metrics_perfect_match():
    obs = {f"2026-01-{d:02d}": mm for d, mm in zip(range(1, 6), [0.0, 20.0, 80.0, 0.5, 300.0])}
    rows = [
        {"date": f"2026-01-{d:02d}", "category": cat, "amount_mm": None}
        for d, cat in zip(
            range(1, 6),
            ["No rain", "Moderate rain", "Heavy rain", "Light rain", "Extremely heavy rain"],
        )
    ]
    imd = {"available": True, "source": "IMD", "rows": rows}
    out = S.score_imd_source(imd, obs)
    assert out["category"]["exact_accuracy"] == pytest.approx(1.0)
    assert out["category"]["within_one_class_accuracy"] == pytest.approx(1.0)
    assert out["category"]["n"] == 5


def test_score_amount_metrics_when_numeric_present():
    obs = {f"2026-01-{d:02d}": float(d) for d in range(1, 8)}
    rows = [
        {"date": f"2026-01-{d:02d}", "category": None, "amount_mm": float(d)}
        for d in range(1, 8)
    ]
    imd = {"available": True, "source": "IMD", "rows": rows}
    out = S.score_imd_source(imd, obs)
    assert out["amount"]["mae"] == pytest.approx(0.0)  # perfect match
    assert out["overunder"]["n"] == 7


def test_no_key_returns_unavailable_reason():
    """The public entry point without a key must not perform any request."""
    from app.services import imd as imd_service

    # IMD_API_KEY is unset in the test environment (no .env secrets loaded).
    out = imd_service.imd_forecast_for_window("2026-01-01", "2026-01-07")
    assert out["available"] is False
    assert "IMD_API_KEY" in out["reason"]
    assert out["rows"] == []
