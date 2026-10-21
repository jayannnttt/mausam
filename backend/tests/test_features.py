"""Feature-engineering tests — especially the no-leakage guarantees.

Leakage policy (see ``ml/features.py`` docstring):
1. chronological splits only;
2. climatology from 2015–2023 only (before the modelling period);
3. observation features lagged by ``lead + ERA5_LATENCY_DAYS``;
4. archived forecast features are the run issued before the valid day.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml import config as C
from ml import datasets as D
from ml import features as F


def test_split_labels_are_chronological():
    train = D.split_label(pd.Timestamp(C.SPLIT_TRAIN_END))
    val = D.split_label(pd.Timestamp(C.SPLIT_TRAIN_END) + pd.Timedelta(days=1))
    val_end = D.split_label(pd.Timestamp(C.SPLIT_VAL_END))
    test = D.split_label(pd.Timestamp(C.SPLIT_VAL_END) + pd.Timedelta(days=1))
    assert (train, val, val_end, test) == ("train", "val", "val", "test")


def test_split_dates_are_contiguous():
    """Every train date ≤ train_end < every val date ≤ val_end < test."""
    train_end = pd.Timestamp(C.SPLIT_TRAIN_END)
    val_end = pd.Timestamp(C.SPLIT_VAL_END)
    assert train_end < val_end
    # Climatology must end before the modelling period (forecast archive) and
    # well before the training window it feeds features into.
    assert pd.Timestamp(C.CLIMATOLOGY_END) < pd.Timestamp(C.FORECAST_START)
    assert pd.Timestamp(C.CLIMATOLOGY_END) < train_end
    # Observation feature history starts before the modelling period so lag
    # windows are complete on day one, but still after climatology ends? No —
    # OBS_START overlaps the climatology tail by design (the feature window is
    # built from 2023-06 onward; climatology itself only reads 2015–2023).
    assert pd.Timestamp(C.OBS_START) < pd.Timestamp(C.FORECAST_START)


def test_climatology_period_excludes_modelling_window():
    assert pd.Timestamp(C.CLIMATOLOGY_END) < pd.Timestamp(C.SPLIT_TRAIN_END)


def _synthetic_obs(periods: int = 400) -> pd.DataFrame:
    idx = pd.date_range("2025-01-01", periods=periods, freq="D")
    rng = np.random.default_rng(42)
    precip = rng.gamma(1.5, 4.0, size=periods)
    return pd.DataFrame(
        {
            "obs_precip_mm": precip,
            "precipitation_sum": precip,
            "temperature_2m_mean": 30.0 + rng.normal(0, 2, periods),
            "relative_humidity_2m_mean": 70.0 + rng.normal(0, 5, periods),
            "pressure_msl_mean": 1008.0 + rng.normal(0, 3, periods),
            "cloud_cover_mean": 50.0 + rng.normal(0, 10, periods),
            "wind_speed_10m_mean": 12.0 + rng.normal(0, 3, periods),
            "elevation_m": 10.0,
        },
        index=idx,
    )


def test_observation_features_are_lagged_by_lead_plus_latency():
    """Feature at valid date D must use observations ending at D−(L+5)."""
    obs = _synthetic_obs()
    lead = 3
    feats = F.observation_features(obs, lead)
    shift = lead + C.ERA5_LATENCY_DAYS

    # Distinctive spike: 100 mm exactly one shift window before a known date.
    target = pd.Timestamp("2025-06-15")
    spike_date = target - pd.Timedelta(days=shift)
    obs.loc[spike_date, "obs_precip_mm"] = 100.0

    feats2 = F.observation_features(obs, lead)
    # lag1 at `target` equals precip at target − shift.
    assert feats2.loc[target, "obs_precip_lag1"] == pytest.approx(
        obs.loc[spike_date, "obs_precip_mm"]
    )
    # The spike must NOT appear at lag1 for an earlier date (no look-ahead).
    earlier = target - pd.Timedelta(days=1)
    assert feats2.loc[earlier, "obs_precip_lag1"] == pytest.approx(
        obs.loc[spike_date - pd.Timedelta(days=1), "obs_precip_mm"]
    )
    # And the raw (unshifted) value at `target` itself is not used.
    assert feats2.loc[target, "obs_precip_lag1"] != pytest.approx(
        obs.loc[target, "obs_precip_mm"], rel=1e-6
    )
    assert feats.columns.equals(feats2.columns)


def test_larger_lead_lags_more():
    """lead=7 features are shifted further than lead=1 features."""
    obs = _synthetic_obs()
    f1 = F.observation_features(obs, lead=1)
    f7 = F.observation_features(obs, lead=7)
    target = pd.Timestamp("2025-06-15")
    # lag1 window sums: lead1 uses data up to D-6, lead7 up to D-12.
    ref = obs["obs_precip_mm"]
    expected_1 = ref.loc[target - pd.Timedelta(days=1 + C.ERA5_LATENCY_DAYS)]
    expected_7 = ref.loc[target - pd.Timedelta(days=7 + C.ERA5_LATENCY_DAYS)]
    assert f1.loc[target, "obs_precip_lag1"] == pytest.approx(expected_1)
    assert f7.loc[target, "obs_precip_lag1"] == pytest.approx(expected_7)


def test_climatology_is_smooth_and_bounded():
    obs = _synthetic_obs(periods=730)
    clim = F.build_climatology(obs)
    assert list(clim.columns) == ["clim_mm", "clim_freq", "clim_n"]
    assert clim["clim_mm"].notna().all()
    assert (clim["clim_mm"] >= 0).all()
    assert (clim["clim_freq"].between(0, 1)).all()


def test_climatology_wrap_around_year_boundary():
    obs = _synthetic_obs(periods=730)
    clim = F.build_climatology(obs)
    # 31 Dec and 1 Jan should be similar (wrapped window), not jump to zero.
    assert clim.loc[365, "clim_mm"] == pytest.approx(clim.loc[1, "clim_mm"], rel=0.5)


def test_calendar_features_season_onehots():
    dates = pd.DatetimeIndex(["2025-07-15", "2025-04-15", "2025-10-15", "2025-01-15"])
    cal = F.calendar_features(dates)
    assert cal.loc[dates[0], "monsoon_jjas"] == 1.0
    assert cal.loc[dates[1], "premonsoon_mam"] == 1.0
    assert cal.loc[dates[2], "postmonsoon_on"] == 1.0
    assert cal.loc[dates[3], "winter_djf"] == 1.0
    # Exactly one season flag fires per row.
    season_cols = ["monsoon_jjas", "premonsoon_mam", "postmonsoon_on", "winter_djf"]
    assert (cal[season_cols].sum(axis=1) == 1).all()


def test_feature_frame_has_all_model_columns():
    obs = _synthetic_obs()
    obs = obs.rename_axis("date")
    clim = F.build_climatology(obs)
    dates = pd.DatetimeIndex(["2025-08-01"])
    fc = pd.DataFrame(
        {
            "fc1_precip_mm": [5.0],
            "fc1_tmean": [30.0],
            "fc1_rh": [80.0],
            "fc1_slp": [1005.0],
            "fc1_cloud": [60.0],
            "fc1_wind": [10.0],
            "fc1_winddir_deg": [180.0],
        },
        index=dates,
    )
    X = F.build_feature_frame(
        obs=obs, fc_daily=fc, clim=clim, lead=1, latitude=13.0, longitude=80.0,
        elevation_m=6.0, dates=dates,
    )
    assert list(X.columns) == F.FEATURE_COLUMNS
    # Forecast feature is renamed to the stable schema (prefix-independent).
    assert "fc_precip_mm" in X.columns
    assert X.loc[dates[0], "fc_precip_mm"] == pytest.approx(5.0)


def test_feature_frame_missing_forecast_column_is_nan():
    obs = _synthetic_obs().rename_axis("date")
    clim = F.build_climatology(obs)
    dates = pd.DatetimeIndex(["2025-08-01"])
    X = F.build_feature_frame(
        obs=obs, fc_daily=pd.DataFrame(index=dates), clim=clim, lead=1,
        latitude=13.0, longitude=80.0, elevation_m=6.0, dates=dates,
    )
    assert np.isnan(X.loc[dates[0], "fc_precip_mm"])


def test_wind_direction_features_are_unit_circle():
    obs = _synthetic_obs().rename_axis("date")
    clim = F.build_climatology(obs)
    dates = pd.DatetimeIndex(["2025-08-01"])
    fc = pd.DataFrame(
        {"fc1_precip_mm": [0.0], "fc1_winddir_deg": [180.0]}, index=dates
    )
    X = F.build_feature_frame(
        obs=obs, fc_daily=fc, clim=clim, lead=1, latitude=13.0, longitude=80.0,
        elevation_m=6.0, dates=dates,
    )
    assert X.loc[dates[0], "fc_winddir_sin"] == pytest.approx(0.0, abs=1e-9)
    assert X.loc[dates[0], "fc_winddir_cos"] == pytest.approx(-1.0, abs=1e-9)


def test_season_of_months():
    assert F.season_of(pd.Timestamp("2025-07-01")) == "monsoon_jjas"
    assert F.season_of(pd.Timestamp("2025-01-01")) == "winter_djf"
    assert F.season_of(pd.Timestamp("2025-04-01")) == "premonsoon_mam"
    assert F.season_of(pd.Timestamp("2025-11-01")) == "postmonsoon_on"
