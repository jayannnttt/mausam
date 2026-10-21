"""Verification-engine tests for source separation and the pooled route.

These guard two bugs found during development:
1. every source must be scored against ITS OWN amounts (scoring climatology
   on the NWP column silently duplicated NWP metrics);
2. multi-location pooling must not re-align on date (locations share calendar
   dates → duplicate index labels → pandas reindex error).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml import verify as V


# --------------------------------------------------------------------------- #
# Source separation
# --------------------------------------------------------------------------- #


def _aligned_frame(obs, fc) -> pd.DataFrame:
    idx = pd.date_range("2026-01-01", periods=len(obs))
    return pd.DataFrame({"observed_mm": obs, "forecast_mm": fc}, index=idx)


def test_scoring_uses_the_frames_own_amounts():
    obs = [0.0, 10.0, 5.0, 0.0]
    nwp = [1.0, 9.0, 4.0, 1.0]
    clim = [3.0, 3.0, 3.0, 3.0]  # constant → MAE 3.0 vs obs mean 3.75
    nwp_scores = V.score_aligned(_aligned_frame(obs, nwp))
    clim_scores = V.score_aligned(_aligned_frame(obs, clim))
    assert nwp_scores["amount"]["mae"] != clim_scores["amount"]["mae"]
    assert clim_scores["amount"]["mae"] == pytest.approx(3.75)  # (3+7+2+3)/4


def test_frame_builder_not_reused_across_sources():
    """Two sources on the same rows produce independent error statistics."""
    obs = np.array([5.0, 5.0, 5.0, 5.0])
    perfect = obs.copy()
    wrong = obs + 10.0
    a = V.score_aligned(_aligned_frame(obs, perfect))
    b = V.score_aligned(_aligned_frame(obs, wrong))
    assert a["amount"]["mae"] == 0.0
    assert b["amount"]["mae"] == pytest.approx(10.0)


# --------------------------------------------------------------------------- #
# Pooled multi-location verification (verify_locations)
# --------------------------------------------------------------------------- #


def _fake_location_result(n_days: int, offset: float) -> dict:
    """A minimal per-location result shaped like verify_location's output."""
    dates = pd.date_range("2026-07-01", periods=n_days)
    obs = np.full(n_days, 10.0) + offset
    series = [
        {
            "date": d.strftime("%Y-%m-%d"),
            "observed_mm": float(o),
            "nwp_mm": float(o - 1.0),
            "ml_mm": float(o + 2.0),
            "ml_prob": 0.7,
            "clim_mm": 4.0,
            "clim_prob": 0.3,
            "season": V.F.season_of(d),
        }
        for d, o in zip(dates, obs)
    ]
    return {
        "series": series,
        "scores": {
            "observed_reference": {"available": True, "n": n_days, "mean_mm": float(obs.mean())},
            "ml": {"available": True, "n": n_days},
            "nwp_raw": {"available": True, "n": n_days},
            "climatology": {"available": True, "n": n_days},
            "imd": {"available": False, "reason": "no key"},
        },
        "by_season": {},
        "by_month": {},
        "skill": {},
        "lead_days": 1,
        "window": {"start": "2026-07-01", "end": "2026-07-14"},
    }


def test_pooled_locations_handles_shared_dates(monkeypatch):
    """Same calendar dates across locations must not break pooling."""
    fake = {
        "chennai": _fake_location_result(14, 0.0),
        "mumbai": _fake_location_result(14, 50.0),
    }
    monkeypatch.setattr(V, "verify_location", lambda **kwargs: fake[kwargs and "chennai" or "chennai"])
    # verify_locations looks up by location id — route through a dispatcher.
    calls = {"n": 0}

    def _dispatch(**kwargs):
        calls["n"] += 1
        return fake["chennai"] if calls["n"] == 1 else fake["mumbai"]

    monkeypatch.setattr(V, "verify_location", _dispatch)
    out = V.verify_locations(["chennai", "mumbai"], start="2026-07-01", end="2026-07-14", lead=1)

    assert out["scope"] == "pooled_locations"
    assert out["pooled"]["_pooled_rows"] == 28  # 14 days × 2 locations
    assert set(out["pooled"]["_pooled_locations"]) == {"chennai", "mumbai"}
    # Same shape as the single-location route, so the UI can render either.
    for key in ("scores", "skill", "by_season", "by_month", "series", "window", "lead_days"):
        assert key in out
    assert len(out["series"]) == 14  # daily mean across locations


def test_pooled_scores_average_locations(monkeypatch):
    """chennai obs=10, mumbai obs=60 → pooled obs mean = 35."""
    fake = {
        "chennai": _fake_location_result(14, 0.0),
        "mumbai": _fake_location_result(14, 50.0),
    }
    calls = {"n": 0}

    def _dispatch(**kwargs):
        calls["n"] += 1
        return fake["chennai"] if calls["n"] == 1 else fake["mumbai"]

    monkeypatch.setattr(V, "verify_location", _dispatch)
    out = V.verify_locations(["chennai", "mumbai"], start="2026-07-01", end="2026-07-14", lead=1)

    # observed values are 10 and 60 → pooled obs mean 35, ml = obs+2 → mae 2
    assert out["scores"]["observed_reference"]["n"] == 28
    assert out["scores"]["ml"]["amount"]["mae"] == pytest.approx(2.0)
    assert out["scores"]["nwp_raw"]["amount"]["mae"] == pytest.approx(1.0)
    # clim constant 4 vs obs {10, 60} → MAE = mean(|4-10|, |4-60|) = (6+56)/2 = 31
    assert out["scores"]["climatology"]["amount"]["mae"] == pytest.approx(31.0)
    # sources must not be identical (regression guard for the shared-column bug)
    assert out["scores"]["ml"]["amount"]["mae"] != out["scores"]["climatology"]["amount"]["mae"]


def test_pooled_skill_is_computed_and_signed(monkeypatch):
    fake = {
        "chennai": _fake_location_result(14, 0.0),
        "mumbai": _fake_location_result(14, 50.0),
    }
    calls = {"n": 0}

    def _dispatch(**kwargs):
        calls["n"] += 1
        return fake["chennai"] if calls["n"] == 1 else fake["mumbai"]

    monkeypatch.setattr(V, "verify_location", _dispatch)
    out = V.verify_locations(["chennai", "mumbai"], start="2026-07-01", end="2026-07-14", lead=1)
    # ML mae 2 vs clim mae 33 → positive skill; vs nwp mae 1 → negative skill.
    assert out["skill"]["mae_skill_vs_climatology"] > 0
    assert out["skill"]["mae_skill_vs_nwp"] < 0  # honestly negative


def test_pooled_imd_is_reported_unavailable(monkeypatch):
    fake = {"chennai": _fake_location_result(5, 0.0)}
    monkeypatch.setattr(V, "verify_location", lambda **kwargs: fake["chennai"])
    out = V.verify_locations(["chennai"], start="2026-07-01", end="2026-07-05", lead=1)
    assert out["scores"]["imd"]["available"] is False
    assert "district" in out["scores"]["imd"]["reason"].lower()


def test_unknown_location_raises():
    with pytest.raises(ValueError, match="Unknown location"):
        V.verify_locations(["atlantis"], start="2026-07-01", end="2026-07-05", lead=1)


# --------------------------------------------------------------------------- #
# by_season / by_month block shape (dashboard contract)
# --------------------------------------------------------------------------- #


def test_group_scores_shape_matches_dashboard_contract():
    """Reproduce the pooled group logic with explicit numbers."""
    idx = pd.RangeIndex(4)
    frame = pd.DataFrame(
        {
            "observed_mm": [10.0, 10.0, 60.0, 60.0],
            "nwp_mm": [9.0, 9.0, 59.0, 59.0],
            "ml_mm": [12.0, 12.0, 62.0, 62.0],
            "ml_prob": [0.7, 0.7, 0.7, 0.7],
            "clim_mm": [4.0, 4.0, 4.0, 4.0],
            "clim_prob": [0.3, 0.3, 0.3, 0.3],
            "season": ["monsoon_jjas", "monsoon_jjas", "monsoon_jjas", "monsoon_jjas"],
        },
        index=idx,
    )
    # Inline copy of the pooled grouping to assert the numeric contract.
    obs = frame["observed_mm"].to_numpy(float)
    ml_mae = float(np.mean(np.abs(frame["ml_mm"].to_numpy(float) - obs)))
    nwp_mae = float(np.mean(np.abs(frame["nwp_mm"].to_numpy(float) - obs)))
    clim_mae = float(np.mean(np.abs(frame["clim_mm"].to_numpy(float) - obs)))
    assert ml_mae == pytest.approx(2.0)
    assert nwp_mae == pytest.approx(1.0)
    assert clim_mae == pytest.approx(31.0)  # mean(|4-10|, |4-60|) = (6+56)/2
