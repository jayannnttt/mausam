"""Feature engineering for daily rainfall prediction.

Leakage policy (enforced here and covered by tests):

1. **Chronological splits only** — train/val/test are consecutive time windows
   (see ``config.SPLIT_*``); rows are never shuffled across them.
2. **Climatology** (day-of-year mean/frequency) is computed from the
   reanalysis record for years **2015–2023 only** — strictly before the
   modelling period — so no target information from train/val/test leaks in.
3. **Observation (reanalysis) features** are lagged by
   ``lead + ERA5_LATENCY_DAYS`` so that, at the moment a forecast would have
   been issued, those reanalysis values had already been published (ERA5
   lags reality by up to ~5 days).
4. **Forecast features** come from the archived NWP run valid at that lead
   time — the forecast as issued *before* the valid day, never a later run.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C

# --------------------------------------------------------------------------- #
# Feature groups (kept explicit so artifacts and docs can list them)
# --------------------------------------------------------------------------- #

CALENDAR_FEATURES = [
    "month_sin",
    "month_cos",
    "doy_sin",
    "doy_cos",
    "monsoon_jjas",
    "premonsoon_mam",
    "postmonsoon_on",
    "winter_djf",
]

LOCATION_FEATURES = ["latitude", "longitude", "elevation_m"]

CLIMATOLOGY_FEATURES = ["clim_mm", "clim_freq"]

FORECAST_FEATURES = [
    "fc_precip_mm",
    "fc_tmean",
    "fc_rh",
    "fc_slp",
    "fc_cloud",
    "fc_wind",
    "fc_winddir_sin",
    "fc_winddir_cos",
    "fc_precip_minus_clim",
]

OBSERVATION_FEATURES = [
    "obs_precip_lag1",
    "obs_precip_lag3",
    "obs_precip_lag7",
    "obs_precip_lag14",
    "obs_precip_lag30",
    "obs_precip_max_7",
    "obs_wetdays_7",
    "obs_wetdays_30",
    "obs_tmean_7",
    "obs_rh_7",
    "obs_slp_7",
    "obs_cloud_7",
    "obs_wind_7",
    "obs_days_since_wet",
    "obs_valid_frac_30",
]

FEATURE_COLUMNS: list[str] = (
    CALENDAR_FEATURES + LOCATION_FEATURES + CLIMATOLOGY_FEATURES + FORECAST_FEATURES + OBSERVATION_FEATURES
)

SEASON_LABELS = {
    12: "winter_djf",
    1: "winter_djf",
    2: "winter_djf",
    3: "premonsoon_mam",
    4: "premonsoon_mam",
    5: "premonsoon_mam",
    6: "monsoon_jjas",
    7: "monsoon_jjas",
    8: "monsoon_jjas",
    9: "monsoon_jjas",
    10: "postmonsoon_on",
    11: "postmonsoon_on",
}


def season_of(date: pd.Timestamp) -> str:
    return SEASON_LABELS[int(date.month)]


# --------------------------------------------------------------------------- #
# Climatology
# --------------------------------------------------------------------------- #


def build_climatology(obs: pd.DataFrame, threshold_mm: float = C.RAIN_THRESHOLD_MM) -> pd.DataFrame:
    """Day-of-year climatology from an observed daily frame.

    Returns a DataFrame indexed by day-of-year (1…366) with:

    * ``clim_mm``   — mean daily rainfall, smoothed with a ±7-day window
      (wrapped across the year boundary),
    * ``clim_freq`` — frequency of rain days (≥ threshold) in the same window,
    * ``clim_n``    — number of contributing days (data sufficiency).
    """
    precip = obs["obs_precip_mm"] if "obs_precip_mm" in obs.columns else obs["precipitation_sum"]
    doy = precip.index.dayofyear
    grouped = precip.groupby(doy)
    mean_mm = grouped.mean()
    freq = grouped.apply(lambda s: float((s >= threshold_mm).mean()))
    n = grouped.count()

    # Reindex to a full year (366 slots so leap years are not lost) and smooth
    # with wrap-around so 31 Dec / 1 Jan share a window.
    idx = pd.Index(range(1, 367), name="doy")
    mean_mm = mean_mm.reindex(idx)
    freq = freq.reindex(idx)
    n = n.reindex(idx)

    win = 15  # ±7 days

    def _wrapped(s: pd.Series) -> pd.Series:
        doubled = pd.concat([s.iloc[-win:], s, s.iloc[:win]], ignore_index=True)
        smoothed = doubled.rolling(win * 2 + 1, center=True, min_periods=3).mean()
        return smoothed.iloc[win : win + len(s)].set_axis(s.index)

    out = pd.DataFrame(
        {
            "clim_mm": _wrapped(mean_mm),
            "clim_freq": _wrapped(freq),
            "clim_n": _wrapped(n.astype(float)),
        }
    )
    return out


def climatology_lookup() -> dict[str, pd.DataFrame]:
    """Climatology per training location, keyed by location id."""
    from . import sources  # local import to avoid cycles

    result: dict[str, pd.DataFrame] = {}
    for loc in C.TRAINING_LOCATIONS:
        raw = sources.fetch_obs_daily(
            loc, C.CLIMATOLOGY_START, C.CLIMATOLOGY_END, chunk_by_year=False
        )
        prepared = raw.copy()
        prepared["obs_precip_mm"] = prepared["precipitation_sum"]
        result[loc.id] = build_climatology(prepared)
    return result


def climatology_frame_for(clim: pd.DataFrame, dates: pd.DatetimeIndex) -> pd.DataFrame:
    """Attach ``clim_mm`` / ``clim_freq`` columns for the given dates."""
    doy = dates.dayofyear
    # day 366 maps onto the leap-day slot; non-leap histories leave it sparse.
    doy = doy.where(doy <= 365, 365)
    base = clim.reindex(doy.to_numpy())
    out = base.set_index(dates)
    out.index.name = "date"
    return out


# --------------------------------------------------------------------------- #
# Observation (lagged) features
# --------------------------------------------------------------------------- #


def _rolling_min_periods(window: int) -> int:
    return max(1, min(window, int(np.ceil(window * 0.6))))


def observation_features(obs: pd.DataFrame, lead: int) -> pd.DataFrame:
    """Lagged observation features aligned to VALID dates.

    For a valid date D and lead L, every observation feature uses data
    ending at ``D − (L + ERA5_LATENCY_DAYS)`` — i.e. data that would have
    been available when a forecast issued L days before D was produced.
    """
    shift_days = lead + C.ERA5_LATENCY_DAYS
    precip = obs["obs_precip_mm"].astype(float)
    wet = (precip >= C.RAIN_THRESHOLD_MM).astype(float).where(precip.notna())

    shifted = precip.shift(shift_days)
    wet_shifted = wet.shift(shift_days)

    feats = pd.DataFrame(index=obs.index)

    for window in (1, 3, 7, 14, 30):
        feats[f"obs_precip_lag{window}"] = shifted.rolling(
            window, min_periods=_rolling_min_periods(window)
        ).sum()
    feats["obs_precip_max_7"] = shifted.rolling(7, min_periods=4).max()
    for window in (7, 30):
        feats[f"obs_wetdays_{window}"] = wet_shifted.rolling(
            window, min_periods=_rolling_min_periods(window)
        ).sum()

    for src_col, out_col in (
        ("temperature_2m_mean", "obs_tmean_7"),
        ("relative_humidity_2m_mean", "obs_rh_7"),
        ("pressure_msl_mean", "obs_slp_7"),
        ("cloud_cover_mean", "obs_cloud_7"),
        ("wind_speed_10m_mean", "obs_wind_7"),
    ):
        if src_col in obs.columns:
            feats[out_col] = obs[src_col].astype(float).shift(shift_days).rolling(
                7, min_periods=4
            ).mean()

    # Days since the last wet day at the (lagged) issue time.
    wet_vals = wet_shifted.to_numpy(dtype=float)
    days_since = np.full(len(wet_vals), np.nan)
    counter = np.nan
    for i, w in enumerate(wet_vals):
        if np.isnan(w):
            days_since[i] = counter  # carry forward through missing data
            continue
        if w >= 1:
            counter = 0.0
        elif np.isnan(counter):
            counter = np.nan  # unknown until the first wet day is observed
        else:
            counter += 1.0
        days_since[i] = counter
    feats["obs_days_since_wet"] = np.minimum(days_since, 30.0)

    # Data-quality feature: how much of the last 30 lagged days is present.
    notna = precip.notna().astype(float).shift(shift_days)
    feats["obs_valid_frac_30"] = notna.rolling(30, min_periods=10).mean()
    return feats


# --------------------------------------------------------------------------- #
# Full feature matrix
# --------------------------------------------------------------------------- #


def calendar_features(dates: pd.DatetimeIndex) -> pd.DataFrame:
    doy = dates.dayofyear.to_numpy(dtype=float)
    month = dates.month.to_numpy(dtype=float)
    return pd.DataFrame(
        {
            "month_sin": np.sin(2 * np.pi * month / 12),
            "month_cos": np.cos(2 * np.pi * month / 12),
            "doy_sin": np.sin(2 * np.pi * doy / 365.25),
            "doy_cos": np.cos(2 * np.pi * doy / 365.25),
            "monsoon_jjas": np.isin(month, [6, 7, 8, 9]).astype(float),
            "premonsoon_mam": np.isin(month, [3, 4, 5]).astype(float),
            "postmonsoon_on": np.isin(month, [10, 11]).astype(float),
            "winter_djf": np.isin(month, [12, 1, 2]).astype(float),
        },
        index=dates,
    )


def build_feature_frame(
    *,
    obs: pd.DataFrame,
    fc_daily: pd.DataFrame,
    clim: pd.DataFrame,
    lead: int,
    latitude: float,
    longitude: float,
    elevation_m: float,
    dates: pd.DatetimeIndex | None = None,
    fc_prefix: str | None = None,
) -> pd.DataFrame:
    """Assemble the full feature matrix for one location/lead.

    Parameters
    ----------
    obs:
        Prepared observed daily frame (``prepare_obs`` output).
    fc_daily:
        Daily forecast frame. For archived forecasts the columns are
        ``fc{lead}_*``; for the live run they are ``fc_*`` (pass
        ``fc_prefix="fc"``).
    dates:
        Valid dates to build rows for (defaults to the forecast index).
    fc_prefix:
        Override the forecast column prefix.
    """
    prefix = fc_prefix if fc_prefix is not None else f"fc{lead}"
    if dates is None:
        dates = fc_daily.index
    dates = pd.DatetimeIndex(dates)

    parts: list[pd.DataFrame] = [calendar_features(dates)]

    loc = pd.DataFrame(
        {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "elevation_m": float(elevation_m),
        },
        index=dates,
    )
    parts.append(loc)

    parts.append(climatology_frame_for(clim, dates))

    # Forecast features (renamed to a stable, prefix-independent schema).
    fc_map = {
        "fc_precip_mm": f"{prefix}_precip_mm",
        "fc_tmean": f"{prefix}_tmean",
        "fc_rh": f"{prefix}_rh",
        "fc_slp": f"{prefix}_slp",
        "fc_cloud": f"{prefix}_cloud",
        "fc_wind": f"{prefix}_wind",
        "fc_winddir_deg": f"{prefix}_winddir_deg",
    }
    fc = pd.DataFrame(index=dates)
    for out_col, src_col in fc_map.items():
        if src_col in fc_daily.columns:
            fc[out_col] = fc_daily[src_col].reindex(dates)
        else:
            fc[out_col] = np.nan
    # Circular wind direction components (degrees → unit vector).
    rad = np.deg2rad(fc["fc_winddir_deg"].astype(float))
    fc["fc_winddir_sin"] = np.sin(rad)
    fc["fc_winddir_cos"] = np.cos(rad)
    fc["fc_precip_minus_clim"] = fc["fc_precip_mm"] - parts[2]["clim_mm"].to_numpy()
    parts.append(fc[FORECAST_FEATURES])

    obs_feats = observation_features(obs, lead).reindex(dates)
    parts.append(obs_feats[OBSERVATION_FEATURES])

    out = pd.concat(parts, axis=1)
    out.index.name = "date"
    return out[FEATURE_COLUMNS]
