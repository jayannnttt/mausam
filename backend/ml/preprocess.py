"""Preprocessing: hourly → local calendar-day aggregation, missing-value policy.

Conventions
-----------
* All days are LOCAL calendar days at the location (the APIs are queried with
  ``timezone=auto``), so a "rain day" matches what a person experiences.
* A daily aggregate is valid only when at least ``MIN_VALID_HOURS_PER_DAY``
  hourly values exist; otherwise it is NaN (never silently zero-filled).
* Wind direction is aggregated circularly (mean of unit vectors).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C

MIN_VALID_HOURS_PER_DAY = 18


def _circular_mean_deg(values: pd.Series) -> float:
    rad = np.deg2rad(values.dropna().to_numpy(dtype=float))
    if rad.size == 0:
        return float("nan")
    ang = np.rad2deg(np.arctan2(np.sin(rad).mean(), np.cos(rad).mean()))
    ang = float(ang % 360.0)
    # Guard against floating point landing on 360.0 for directions at 0°.
    return 0.0 if np.isclose(ang, 360.0) else ang


def _safe_mean(values: pd.Series) -> float:
    v = values.dropna()
    if v.empty:
        return float("nan")
    return float(v.mean())


def _safe_sum(values: pd.Series) -> float:
    """Sum with a completeness requirement: NaN unless enough hours present."""
    v = values.dropna()
    if v.size < MIN_VALID_HOURS_PER_DAY:
        return float("nan")
    return float(v.sum())


def hourly_to_daily(df: pd.DataFrame, spec: dict[str, tuple[str, str]]) -> pd.DataFrame:
    """Aggregate an hourly frame to daily values.

    Parameters
    ----------
    df:
        Hourly DataFrame indexed by local timestamps.
    spec:
        ``{output_column: (source_column, agg)}`` where agg is one of
        ``sum`` / ``mean`` / ``circular_mean``.
    """
    if df.empty:
        return pd.DataFrame()
    day = df.index.normalize()
    grouped = df.groupby(day)
    out = pd.DataFrame(index=pd.DatetimeIndex(sorted(grouped.groups.keys()), name="date"))
    counts = df.notna().groupby(day).sum()
    total_hours = df.shape[1]

    for out_col, (src_col, agg) in spec.items():
        if src_col not in df.columns:
            out[out_col] = float("nan")
            continue
        src = df[src_col].copy()
        src.index = day
        if agg == "sum":
            s = src.groupby(level=0).sum(min_count=1)
            # Completeness gate: reject partial days.
            valid_count = src.notna().groupby(level=0).sum()
            s = s.where(valid_count >= MIN_VALID_HOURS_PER_DAY)
        elif agg == "mean":
            s = src.groupby(level=0).mean()
            valid_count = src.notna().groupby(level=0).sum()
            s = s.where(valid_count >= MIN_VALID_HOURS_PER_DAY)
        elif agg == "circular_mean":
            s = src.groupby(level=0).apply(_circular_mean_deg)
        else:  # pragma: no cover - defensive
            raise ValueError(f"Unknown aggregation {agg!r}")
        out[out_col] = s

    out["hours_reported"] = counts.sum(axis=1) if total_hours else 0
    out["complete_day"] = counts.max(axis=1) >= MIN_VALID_HOURS_PER_DAY
    return out


def aggregate_prev_runs_daily(hourly: pd.DataFrame) -> dict[int, pd.DataFrame]:
    """Per lead: archive hourly forecasts → daily frames ``fc{L}_{var}``."""
    result: dict[int, pd.DataFrame] = {}
    for lead in C.LEADS:
        spec: dict[str, tuple[str, str]] = {}
        present = False
        for var in C.FORECAST_HOURLY_VARS:
            col = f"{var}@lead{lead}"
            if col in hourly.columns:
                present = True
                if var == "precipitation":
                    spec[f"fc{lead}_precip_mm"] = (col, "sum")
                elif var == "wind_direction_10m":
                    spec[f"fc{lead}_winddir_deg"] = (col, "circular_mean")
                else:
                    short = {
                        "temperature_2m": "tmean",
                        "relative_humidity_2m": "rh",
                        "pressure_msl": "slp",
                        "cloud_cover": "cloud",
                        "wind_speed_10m": "wind",
                    }[var]
                    spec[f"fc{lead}_{short}"] = (col, "mean")
        if not present:
            continue
        result[lead] = hourly_to_daily(hourly, spec)
    return result


def aggregate_live_daily(hourly: pd.DataFrame) -> pd.DataFrame:
    """Live forecast run → daily frame with ``fc_{var}`` columns (lead-0 run)."""
    spec: dict[str, tuple[str, str]] = {
        "fc_precip_mm": ("precipitation", "sum"),
        "fc_tmean": ("temperature_2m", "mean"),
        "fc_rh": ("relative_humidity_2m", "mean"),
        "fc_slp": ("pressure_msl", "mean"),
        "fc_cloud": ("cloud_cover", "mean"),
        "fc_wind": ("wind_speed_10m", "mean"),
        "fc_winddir_deg": ("wind_direction_10m", "circular_mean"),
        "fc_precip_prob": ("precipitation_probability", "mean"),
    }
    return hourly_to_daily(hourly, spec)


def prepare_obs(daily: pd.DataFrame) -> pd.DataFrame:
    """Clean the observed daily frame and derive target-side helpers.

    * sorts, de-duplicates,
    * keeps raw values (no zero-filling of missing observations),
    * adds ``is_wet`` (>= rain threshold) and ``obs_valid`` flags.
    """
    df = daily.sort_index()
    df = df[~df.index.duplicated(keep="last")]
    precip = df.get("precipitation_sum")
    if precip is None:
        raise ValueError("Observed frame lacks precipitation_sum")
    df["obs_precip_mm"] = precip
    df["obs_valid"] = precip.notna()
    df["is_wet"] = precip >= C.RAIN_THRESHOLD_MM
    return df


def missing_report(df: pd.DataFrame) -> dict[str, float]:
    """Fraction of missing values per column — used in training metadata."""
    if df.empty:
        return {}
    return {col: float(df[col].isna().mean()) for col in df.columns}
