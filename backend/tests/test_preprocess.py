"""Preprocessing tests: daily aggregation, missing-value policy, wind direction."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml import preprocess as P


def _hourly_frame(n_hours: int = 48, precip: float = 1.0) -> pd.DataFrame:
    idx = pd.date_range("2025-06-01", periods=n_hours, freq="h")
    return pd.DataFrame(
        {
            "precipitation": [precip] * n_hours,
            "temperature_2m": [30.0] * n_hours,
        },
        index=idx,
    )


def test_complete_day_is_aggregated():
    df = _hourly_frame(48, precip=2.0)
    out = P.hourly_to_daily(df, {"precip_sum": ("precipitation", "sum")})
    assert len(out) == 2
    assert out["precip_sum"].iloc[0] == pytest.approx(48.0)  # 24h × 2 mm


def test_partial_day_is_nan_not_zero():
    """A day with fewer than 18 valid hours must be NaN — never zero-filled."""
    df = _hourly_frame(48, precip=1.0)
    df.iloc[10:24, df.columns.get_loc("precipitation")] = np.nan  # day 1 → 10 h left
    out = P.hourly_to_daily(df, {"precip_sum": ("precipitation", "sum")})
    day1 = out.loc[pd.Timestamp("2025-06-01")]
    day2 = out.loc[pd.Timestamp("2025-06-02")]
    assert np.isnan(day1["precip_sum"])  # incomplete → NaN, not 0
    assert day2["precip_sum"] == pytest.approx(24.0)  # complete day unaffected
    assert bool(day2["complete_day"])


def test_all_missing_day_is_nan():
    idx = pd.date_range("2025-06-01", periods=24, freq="h")
    df = pd.DataFrame({"precipitation": np.full(24, np.nan)}, index=idx)
    out = P.hourly_to_daily(df, {"precip_sum": ("precipitation", "sum")})
    assert out["precip_sum"].isna().all()


def test_wind_direction_circular_mean():
    """Mean of 350° and 10° is 0°, not 180°."""
    idx = pd.date_range("2025-06-01", periods=4, freq="h")
    df = pd.DataFrame({"wind_direction_10m": [350.0, 10.0, 350.0, 10.0]}, index=idx)
    out = P.hourly_to_daily(df, {"wd": ("wind_direction_10m", "circular_mean")})
    assert float(out["wd"].iloc[0]) == pytest.approx(0.0, abs=1e-6)


def test_mean_aggregation_respects_gate():
    idx = pd.date_range("2025-06-01", periods=48, freq="h")
    vals = [30.0] * 48
    vals[0:30] = [np.nan] * 30  # first day has only 14 valid hours
    df = pd.DataFrame({"temperature_2m": vals}, index=idx)
    out = P.hourly_to_daily(df, {"t": ("temperature_2m", "mean")})
    assert np.isnan(out["t"].iloc[0])
    assert out["t"].iloc[1] == pytest.approx(30.0)


def test_prepare_obs_flags_and_no_imputation():
    idx = pd.date_range("2025-06-01", periods=3)
    daily = pd.DataFrame(
        {"precipitation_sum": [0.0, 4.0, np.nan]},
        index=idx,
    )
    out = P.prepare_obs(daily)
    assert out["obs_valid"].tolist() == [True, True, False]
    assert out["is_wet"].tolist() == [False, True, False]
    assert np.isnan(out["obs_precip_mm"].iloc[2])  # kept as NaN, not 0


def test_prepare_obs_requires_precip():
    with pytest.raises(ValueError):
        P.prepare_obs(pd.DataFrame({"temperature_2m": [1.0]}))


def test_prepare_obs_deduplicates_keep_latest():
    idx = pd.DatetimeIndex(["2025-06-01", "2025-06-01", "2025-06-02"])
    daily = pd.DataFrame({"precipitation_sum": [1.0, 9.0, 0.0]}, index=idx)
    out = P.prepare_obs(daily)
    assert out.loc[pd.Timestamp("2025-06-01"), "obs_precip_mm"] == 9.0
    assert len(out) == 2


def test_missing_report():
    df = pd.DataFrame({"a": [1.0, np.nan], "b": [1.0, 2.0]})
    report = P.missing_report(df)
    assert report["a"] == pytest.approx(0.5)
    assert report["b"] == pytest.approx(0.0)
