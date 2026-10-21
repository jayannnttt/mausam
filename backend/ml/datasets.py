"""Assemble the supervised dataset (one row = one valid day × one location).

Row schema: ``FEATURE_COLUMNS`` + targets (``y_rain``, ``y_mm``) + bookkeeping
(``location_id``, ``season``, ``split``).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import config as C
from . import features as F
from . import preprocess as P
from . import sources


def split_label(date: pd.Timestamp) -> str:
    """Chronological split membership for a valid date (never shuffled)."""
    if date <= pd.Timestamp(C.SPLIT_TRAIN_END):
        return "train"
    if date <= pd.Timestamp(C.SPLIT_VAL_END):
        return "val"
    return "test"


@dataclass
class LocationData:
    """Everything fetched for one training location (cached on disk)."""

    loc: C.Location
    obs: pd.DataFrame
    clim: pd.DataFrame


def load_location_data(loc: C.Location, *, refresh: bool = False) -> LocationData:
    """Fetch observed daily weather (modelling window) + climatology."""
    today = pd.Timestamp.today().normalize().strftime("%Y-%m-%d")
    obs_raw = sources.fetch_obs_daily(loc, C.OBS_START, today, refresh=refresh)
    obs = P.prepare_obs(obs_raw)

    clim_raw = sources.fetch_obs_daily(
        loc, C.CLIMATOLOGY_START, C.CLIMATOLOGY_END, refresh=refresh, chunk_by_year=False
    )
    clim_raw = clim_raw.copy()
    clim_raw["obs_precip_mm"] = clim_raw["precipitation_sum"]
    clim = F.build_climatology(clim_raw)
    return LocationData(loc=loc, obs=obs, clim=clim)


def load_forecast_daily(loc: C.Location, *, refresh: bool = False) -> dict[int, pd.DataFrame]:
    """Archived NWP forecasts aggregated to local days, keyed by lead."""
    today = pd.Timestamp.today().normalize().strftime("%Y-%m-%d")
    hourly = sources.fetch_prev_runs_hourly(loc, C.FORECAST_START, today, refresh=refresh)
    return P.aggregate_prev_runs_daily(hourly)


def build_lead_dataset(lead: int, *, refresh: bool = False) -> pd.DataFrame:
    """Build the complete per-lead dataset across all training locations."""
    from .features import FEATURE_COLUMNS  # local import for clarity

    frames: list[pd.DataFrame] = []
    for loc in C.TRAINING_LOCATIONS:
        data = load_location_data(loc, refresh=refresh)
        fc_daily = load_forecast_daily(loc, refresh=refresh).get(lead)
        if fc_daily is None or fc_daily.empty:
            continue

        # Valid dates = days where BOTH a forecast and an observation exist.
        fc_precip_col = f"fc{lead}_precip_mm"
        dates = fc_daily.index.intersection(data.obs.index)
        # Drop days whose archived forecast is entirely missing (archive gaps).
        if fc_precip_col in fc_daily.columns:
            has_fc = fc_daily[fc_precip_col].reindex(dates).notna()
            dates = dates[has_fc.to_numpy()]
        # Drop days without an observation (never impute the target).
        obs_valid = data.obs["obs_valid"].reindex(dates).fillna(False)
        dates = dates[obs_valid.to_numpy()]

        X = F.build_feature_frame(
            obs=data.obs,
            fc_daily=fc_daily,
            clim=data.clim,
            lead=lead,
            latitude=loc.latitude,
            longitude=loc.longitude,
            elevation_m=float(data.obs["elevation_m"].iloc[-1]),
            dates=dates,
        )
        y_mm = data.obs["obs_precip_mm"].reindex(dates)
        block = X.copy()
        block["y_mm"] = y_mm.to_numpy()
        block["y_rain"] = (y_mm >= C.RAIN_THRESHOLD_MM).astype(float)
        block["location_id"] = loc.id
        block["season"] = [F.season_of(d) for d in dates]
        block["split"] = [split_label(d) for d in dates]
        block.index.name = "date"
        frames.append(block)

    if not frames:
        raise RuntimeError(f"No data assembled for lead {lead}")

    out = pd.concat(frames)
    out = out.sort_index()
    # Rows must carry most features (calendar/location/forecast/obs). Rows
    # whose forecast inputs are largely missing are unusable; remaining
    # scattered NaNs are handled by the imputer inside each model pipeline.
    out = out[out[FEATURE_COLUMNS].notna().sum(axis=1) > len(FEATURE_COLUMNS) * 0.5]
    return out.reset_index()
