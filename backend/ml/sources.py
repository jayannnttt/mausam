"""Data sources for the ML pipeline.

Sources (all verified reachable during development):

========================  ===================================================
Source                    Use
========================  ===================================================
Open-Meteo Historical     Observed daily weather ("ERA5 reanalysis" /
Weather API               ERA5-Land blend) at 0.25° (~25 km) grid. Used as
                          the observation reference and for lag features.
                          NOTE: grid cell, not a rain-gauge reading.
Open-Meteo Previous       Archived NWP forecasts at FIXED lead-time offsets
Runs API                  (``*_previous_day1 … _previous_day7``) — i.e. the
                          value predicted 1, 2, … 7 days before valid time.
                          Archived from January 2024. This is a global NWP
                          model blend, **not** an IMD product.
Open-Meteo Forecast API   Live forecast used at inference time.
========================  ===================================================

IMD's own API (api.imd.gov.in) requires an issued key and is handled by the
FastAPI service (``app/services/imd.py``), never by this module.
"""

from __future__ import annotations

import pandas as pd

from . import config as C
from .httpcache import fetch_json, urlencode

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
PREV_RUNS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def _year_chunks(start: str, end: str) -> list[tuple[str, str]]:
    """Split [start, end] into calendar-year chunks (keeps payloads small)."""
    s = pd.Timestamp(start)
    e = pd.Timestamp(end)
    chunks: list[tuple[str, str]] = []
    cursor = s
    while cursor <= e:
        year_end = pd.Timestamp(year=cursor.year, month=12, day=31)
        stop = min(year_end, e)
        chunks.append((cursor.strftime("%Y-%m-%d"), stop.strftime("%Y-%m-%d")))
        cursor = stop + pd.Timedelta(days=1)
    return chunks


def _obs_daily_url(lat: float, lon: float, start: str, end: str) -> str:
    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "start_date": start,
        "end_date": end,
        "daily": ",".join(C.OBS_DAILY_VARS),
        "timezone": "auto",
    }
    return f"{ARCHIVE_URL}?{urlencode(params)}"


def fetch_obs_daily(
    loc: C.Location,
    start: str,
    end: str,
    *,
    refresh: bool = False,
    chunk_by_year: bool = True,
) -> pd.DataFrame:
    """Observed (reanalysis) daily weather for ``loc`` between start/end.

    Returns a DataFrame indexed by local calendar date with columns in
    ``config.OBS_DAILY_VARS`` plus ``elevation_m``. Long ranges (climatology)
    can be fetched in a single request with ``chunk_by_year=False``.
    """
    frames: list[pd.DataFrame] = []
    elevation: float | None = None
    chunks = _year_chunks(start, end) if chunk_by_year else [(start, end)]
    for cs, ce in chunks:
        url = _obs_daily_url(loc.latitude, loc.longitude, cs, ce)
        payload = fetch_json(
            url,
            kind="obs",
            cache_key=f"obs_{loc.id}_{cs}_{ce}",
            refresh=refresh,
        )
        daily = payload.get("daily")
        if not daily or not daily.get("time"):
            raise RuntimeError(f"Observed daily data missing for {loc.id} {cs}..{ce}")
        df = pd.DataFrame({"date": pd.to_datetime(daily["time"])})
        for col in C.OBS_DAILY_VARS:
            df[col] = pd.Series(daily.get(col), dtype="float64")
        df = df.set_index("date").sort_index()
        df = df[~df.index.duplicated(keep="last")]
        frames.append(df)
        if elevation is None and payload.get("elevation") is not None:
            elevation = float(payload["elevation"])

    out = pd.concat(frames).sort_index()
    out = out[~out.index.duplicated(keep="last")]
    out["elevation_m"] = elevation if elevation is not None else float("nan")
    return out


def prev_runs_hourly_params(leads: tuple[int, ...] = C.LEADS) -> str:
    """Build the ``hourly=`` parameter: every variable at every lead offset."""
    parts = [f"{var}_previous_day{lead}" for lead in leads for var in C.FORECAST_HOURLY_VARS]
    return ",".join(parts)


def _prev_runs_url(lat: float, lon: float, start: str, end: str, leads: tuple[int, ...]) -> str:
    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "start_date": start,
        "end_date": end,
        "hourly": prev_runs_hourly_params(leads),
        "timezone": "auto",
    }
    return f"{PREV_RUNS_URL}?{urlencode(params)}"


def fetch_prev_runs_hourly(
    loc: C.Location,
    start: str,
    end: str,
    *,
    leads: tuple[int, ...] = C.LEADS,
    refresh: bool = False,
) -> pd.DataFrame:
    """Archived NWP forecasts at fixed lead offsets, hourly, local time.

    Columns are MultiIndex-style strings ``{var}@lead{L}``.
    """
    frames: list[pd.DataFrame] = []
    for cs, ce in _year_chunks(start, end):
        url = _prev_runs_url(loc.latitude, loc.longitude, cs, ce, leads)
        payload = fetch_json(
            url,
            kind="prevruns",
            cache_key=f"prevruns_{loc.id}_{cs}_{ce}_L{'-'.join(map(str, leads))}",
            refresh=refresh,
        )
        hourly = payload.get("hourly")
        if not hourly or not hourly.get("time"):
            raise RuntimeError(f"Previous-runs data missing for {loc.id} {cs}..{ce}")
        df = pd.DataFrame({"time": pd.to_datetime(hourly["time"])})
        for lead in leads:
            for var in C.FORECAST_HOURLY_VARS:
                key = f"{var}_previous_day{lead}"
                df[f"{var}@lead{lead}"] = pd.Series(hourly.get(key), dtype="float64")
        df = df.set_index("time").sort_index()
        df = df[~df.index.duplicated(keep="last")]
        frames.append(df)
    out = pd.concat(frames).sort_index()
    return out[~out.index.duplicated(keep="last")]


def fetch_live_forecast_hourly(
    lat: float,
    lon: float,
    start: str,
    end: str,
    *,
    refresh: bool = False,
) -> tuple[pd.DataFrame, dict]:
    """Current forecast run (hourly, local time) for inference.

    Returns ``(frame, meta)`` where meta includes ``elevation_m`` and the
    provider name. Columns are plain variable names (lead 0 run — the
    forecast issued *now*, which is exactly a lead-(D − today) forecast for
    each future valid day D).
    """
    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "start_date": start,
        "end_date": end,
        "hourly": ",".join(C.FORECAST_HOURLY_VARS + ("precipitation_probability",)),
        "timezone": "auto",
    }
    url = f"{FORECAST_URL}?{urlencode(params)}"
    payload = fetch_json(
        url,
        kind="forecast",
        cache_key=f"forecast_{round(lat, 3)}_{round(lon, 3)}_{start}_{end}",
        refresh=refresh,
    )
    hourly = payload.get("hourly")
    if not hourly or not hourly.get("time"):
        raise RuntimeError("Live forecast returned no hourly data")
    df = pd.DataFrame({"time": pd.to_datetime(hourly["time"])})
    for var in C.FORECAST_HOURLY_VARS + ("precipitation_probability",):
        df[var] = pd.Series(hourly.get(var), dtype="float64")
    df = df.set_index("time").sort_index()
    meta = {
        "elevation_m": payload.get("elevation"),
        "timezone": payload.get("timezone"),
        "utc_offset_seconds": payload.get("utc_offset_seconds"),
        "provider": "Open-Meteo Forecast API",
    }
    return df, meta


def latest_obs_date(loc: C.Location, probe_days: int = 30) -> str:
    """Most recent date with observed daily data available for ``loc``."""
    end = pd.Timestamp.today().normalize()
    start = end - pd.Timedelta(days=probe_days)
    df = fetch_obs_daily(loc, start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    if df.empty:
        raise RuntimeError("No observed data in the last 30 days")
    return df.index.max().strftime("%Y-%m-%d")
