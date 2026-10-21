"""
Mausam Sense ML — configuration.

All paths, locations, date ranges and thresholds used by the training and
inference pipelines live here so that training runs are reproducible and the
API serves exactly the same configuration the models were trained with.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

BACKEND_DIR = Path(__file__).resolve().parents[1]
ML_DIR = BACKEND_DIR / "ml"
DATA_DIR = Path(os.environ.get("MAUSAM_DATA_DIR", BACKEND_DIR / "data"))
CACHE_DIR = DATA_DIR / "cache"
ARTIFACTS_DIR = Path(os.environ.get("MAUSAM_ARTIFACTS_DIR", BACKEND_DIR / "artifacts"))

for _p in (CACHE_DIR, ARTIFACTS_DIR):
    _p.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- #
# Locations used for TRAINING (a pooled model learns from all of them).
#
# Chosen for monsoon-regime diversity: east coast, west coast, inland
# plateau, north plains, central plateau, east/northeast delta.
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Location:
    id: str
    name: str
    latitude: float
    longitude: float

    def key(self) -> str:
        return self.id


TRAINING_LOCATIONS: tuple[Location, ...] = (
    Location("chennai", "Chennai", 13.0827, 80.2707),
    Location("mumbai", "Mumbai", 19.0760, 72.8777),
    Location("delhi", "New Delhi", 28.6139, 77.2090),
    Location("nagpur", "Nagpur", 21.1458, 79.0882),
    Location("bengaluru", "Bengaluru", 12.9716, 77.5946),
    Location("kolkata", "Kolkata", 22.5726, 88.3639),
)


# --------------------------------------------------------------------------- #
# Date ranges (all dates are LOCAL calendar dates at the location)
# --------------------------------------------------------------------------- #

# Day-of-year climatology window: strictly BEFORE the modelling period, so no
# target information from train/val/test can leak into climatology features.
CLIMATOLOGY_START = "2015-01-01"
CLIMATOLOGY_END = "2023-12-31"

# Observed (reanalysis) data used for lag/rolling features. Starts 6 months
# before the modelling period so 30-day windows are complete on day one.
OBS_START = "2023-06-01"

# Archived NWP forecasts (Previous Runs API) — available from January 2024.
FORECAST_START = "2024-01-01"

# Chronological split boundaries for the modelling period. Never shuffled.
SPLIT_TRAIN_END = "2025-06-30"
SPLIT_VAL_END = "2025-12-31"  # test = everything after this


# --------------------------------------------------------------------------- #
# Target definition
# --------------------------------------------------------------------------- #

# "Rain day" threshold in mm/24h used for the classification target.
# 1.0 mm is a common light-rain threshold; IMD/WMO "measurable rain day"
# conventions vary (2.5 mm is also used) — see README for sensitivity notes.
RAIN_THRESHOLD_MM = 1.0


# --------------------------------------------------------------------------- #
# Forecast lead times (days). Each lead gets its own model because the
# issue-time semantics of the features differ per lead.
# --------------------------------------------------------------------------- #

LEADS: tuple[int, ...] = (1, 2, 3, 4, 5, 6, 7)

# Observation (reanalysis) features are lagged by LEAD + ERA5_LATENCY_DAYS so
# that, at issue time, the reanalysis values would already have been
# published. ERA5 via Open-Meteo typically lags 2–5 days; we assume 5.
ERA5_LATENCY_DAYS = 5

# Hourly forecast variables pulled per lead from the Previous Runs API.
FORECAST_HOURLY_VARS: tuple[str, ...] = (
    "precipitation",
    "temperature_2m",
    "relative_humidity_2m",
    "pressure_msl",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
)

# Daily observed (reanalysis) variables.
OBS_DAILY_VARS: tuple[str, ...] = (
    "precipitation_sum",
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "relative_humidity_2m_mean",
    "pressure_msl_mean",
    "cloud_cover_mean",
    "wind_speed_10m_mean",
    "precipitation_hours",
)


# --------------------------------------------------------------------------- #
# Candidate models
# --------------------------------------------------------------------------- #

# Names are used in artifacts/metrics and in the UI.
CANDIDATE_MODELS: tuple[str, ...] = (
    "baseline_climatology",
    "logistic_regression",
    "random_forest",
    "gradient_boosting",  # HistGradientBoosting (sklearn)
    "xgboost",
)


@dataclass
class Paths:
    """File locations derived from the config above."""

    obs_csv: dict = field(default_factory=dict)


def location_prefix(loc: Location) -> str:
    return f"{loc.id}"
