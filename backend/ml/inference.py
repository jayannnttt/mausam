"""Inference: load trained artifacts once, predict for ANY coordinate.

Live inference mirrors training feature semantics exactly:

* valid day ``D`` with ``lead = (D − today)`` uses the **current forecast run**
  (issued today → genuinely a lead-``lead`` forecast for D);
* observation (reanalysis) features are lagged by ``lead + ERA5_LATENCY_DAYS``
  exactly as during training;
* climatology is computed for the requested coordinate from the 2015–2023
  reanalysis record (cached), falling back to the nearest training city with
  an explicit distance disclosure if it cannot be fetched.

Nothing here ever retrains a model — training happens offline via
``python -m ml.train``.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from . import config as C
from . import features as F
from . import preprocess as P
from . import sources

BUNDLE_FILENAME = "model_bundle.joblib"


class InferenceError(RuntimeError):
    """Base class for inference failures (mapped to API errors)."""


class ModelUnavailableError(InferenceError):
    """No trained artifacts are present (``python -m ml.train`` not run)."""


class ForecastFetchError(InferenceError):
    """The live forecast/observation provider could not be reached."""


# --------------------------------------------------------------------------- #
# Bundle loading (once per process)
# --------------------------------------------------------------------------- #

_BUNDLE: dict[str, Any] | None = None
_BUNDLE_MTIME: float | None = None


def bundle_path() -> Path:
    return Path(C.ARTIFACTS_DIR) / BUNDLE_FILENAME


def bundle_available() -> bool:
    return bundle_path().exists()


def load_bundle(*, refresh: bool = False) -> dict[str, Any]:
    global _BUNDLE, _BUNDLE_MTIME
    path = bundle_path()
    if not path.exists():
        raise ModelUnavailableError(
            "No trained model found. Run `python -m ml.train` inside backend/ first."
        )
    mtime = path.stat().st_mtime
    if _BUNDLE is None or refresh or mtime != _BUNDLE_MTIME:
        import joblib

        _BUNDLE = joblib.load(path)
        _BUNDLE_MTIME = mtime
    return _BUNDLE


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_training_location(latitude: float, longitude: float) -> tuple[C.Location, float]:
    best, best_km = C.TRAINING_LOCATIONS[0], float("inf")
    for loc in C.TRAINING_LOCATIONS:
        km = _haversine_km(latitude, longitude, loc.latitude, loc.longitude)
        if km < best_km:
            best, best_km = loc, km
    return best, best_km


def _adhoc_location(latitude: float, longitude: float) -> C.Location:
    """Location handle whose id makes a stable, filesystem-safe cache key."""
    return C.Location(
        id=f"gps_{latitude:.3f}_{longitude:.3f}",
        name="requested point",
        latitude=latitude,
        longitude=longitude,
    )


def _climatology(latitude: float, longitude: float, bundle: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Day-of-year climatology for the requested coordinate."""
    loc = _adhoc_location(latitude, longitude)
    try:
        raw = sources.fetch_obs_daily(
            loc, C.CLIMATOLOGY_START, C.CLIMATOLOGY_END, chunk_by_year=False
        )
        raw = raw.copy()
        raw["obs_precip_mm"] = raw["precipitation_sum"]
        if raw["obs_precip_mm"].notna().sum() < 365:
            raise RuntimeError("insufficient climatology history")
        return F.build_climatology(raw), {
            "climatology_source": "reanalysis 2015–2023 at the requested coordinate",
            "climatology_fetched_for": f"{latitude:.3f},{longitude:.3f}",
            "climatology_distance_km": 0.0,
        }
    except Exception as exc:  # network/availability failure → nearest city fallback
        near, km = nearest_training_location(latitude, longitude)
        stored = bundle.get("climatology", {}).get(near.id)
        if stored is None:
            raise InferenceError(
                f"Climatology unavailable for this coordinate ({exc}) and no fallback stored."
            ) from exc
        clim = pd.DataFrame(stored).set_index("doy")
        return clim, {
            "climatology_source": f"reanalysis 2015–2023 at nearest training city ({near.name})",
            "climatology_fetched_for": near.id,
            "climatology_distance_km": round(km, 1),
            "climatology_warning": f"exact-coordinate climatology unavailable: {exc}",
        }


def _obs_for_inference(loc: C.Location, local_today: pd.Timestamp) -> pd.DataFrame:
    """Recent reanalysis window — long enough for the largest lag window."""
    max_lead = max(C.LEADS)
    start = (
        local_today
        - pd.Timedelta(days=max_lead + C.ERA5_LATENCY_DAYS + 45)
    ).strftime("%Y-%m-%d")

    # Open-Meteo ERA5 reanalysis archive has a publication latency of 2-5 days.
    # Requesting today's date returns HTTP 400 Bad Request.
    # Because observation features are lagged by (lead + ERA5_LATENCY_DAYS >= 6 days),
    # an end date 2 to 5 days ago covers all required observation lag features.
    last_exc: Exception | None = None
    for lag in range(2, C.ERA5_LATENCY_DAYS + 3):
        end = (local_today - pd.Timedelta(days=lag)).strftime("%Y-%m-%d")
        try:
            raw = sources.fetch_obs_daily(loc, start, end)
            return P.prepare_obs(raw)
        except Exception as exc:
            last_exc = exc
            if "400" not in str(exc):
                break

    raise ForecastFetchError(f"Could not load recent observations: {last_exc}")


# --------------------------------------------------------------------------- #
# Prediction
# --------------------------------------------------------------------------- #


def predict(
    latitude: float,
    longitude: float,
    *,
    days: int = 7,
    name: str | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    """Rainfall prediction for the next ``days`` local days at a coordinate."""
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise InferenceError("Latitude/longitude out of range.")
    days = int(max(1, min(days, 10)))
    bundle = load_bundle()
    trained = bundle.get("leads", {})
    if not trained:
        raise ModelUnavailableError("Model bundle contains no trained leads.")

    loc = _adhoc_location(latitude, longitude)

    # ---- live forecast run (features issued NOW) ---- #
    utc_today = pd.Timestamp.now(tz="UTC").normalize().tz_localize(None)
    fc_start = (utc_today - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    fc_end = (utc_today + pd.Timedelta(days=days + 2)).strftime("%Y-%m-%d")
    try:
        fc_hourly, fc_meta = sources.fetch_live_forecast_hourly(
            latitude, longitude, fc_start, fc_end, refresh=refresh
        )
    except Exception as exc:
        raise ForecastFetchError(str(exc)) from exc

    offset = int(fc_meta.get("utc_offset_seconds") or 0)
    local_now = pd.Timestamp.now(tz="UTC") + pd.Timedelta(seconds=offset)
    local_today = local_now.tz_localize(None).normalize()

    fc_daily = P.aggregate_live_daily(fc_hourly)
    valid_dates = [
        d
        for d in fc_daily.index
        if local_today < d <= local_today + pd.Timedelta(days=days)
    ]
    if not valid_dates:
        raise ForecastFetchError("The forecast provider returned no upcoming days.")

    # ---- climatology + observations for feature windows ---- #
    clim, clim_meta = _climatology(latitude, longitude, bundle)
    obs = _obs_for_inference(loc, local_today)
    elevation = float(fc_meta.get("elevation_m") or obs["elevation_m"].iloc[-1] or 0.0)

    trained_leads = {int(k) for k in trained}
    notes: list[str] = []
    if clim_meta.get("climatology_warning"):
        notes.append(str(clim_meta["climatology_warning"]))
    if not math.isfinite(elevation):
        elevation = 0.0
        notes.append("Grid-cell elevation unavailable; 0 m assumed for the elevation feature.")

    rows: list[dict[str, Any]] = []
    for date in valid_dates:
        lead = int((date - local_today).days)
        entry: dict[str, Any] = {
            "date": date.strftime("%Y-%m-%d"),
            "lead_days": lead,
            "weekday": date.strftime("%a"),
        }
        fc_row = fc_daily.loc[date]
        entry["nwp_forecast_mm"] = _num(fc_row.get("fc_precip_mm"))
        entry["climatology_mm"] = _num(
            clim.loc[min(max(int(date.dayofyear), 1), 365), "clim_mm"]
            if date.dayofyear <= 365
            else clim.loc[365, "clim_mm"]
        )
        entry["climatology_prob"] = _num(
            clim.loc[min(max(int(date.dayofyear), 1), 365), "clim_freq"]
            if date.dayofyear <= 365
            else clim.loc[365, "clim_freq"]
        )

        if lead not in trained_leads:
            entry.update(
                {
                    "model_available": False,
                    "reason": f"No trained model for a {lead}-day lead.",
                }
            )
            rows.append(entry)
            continue

        bundle_lead = trained[str(lead)]
        X = F.build_feature_frame(
            obs=obs,
            fc_daily=fc_daily,
            clim=clim,
            lead=lead,
            latitude=latitude,
            longitude=longitude,
            elevation_m=elevation,
            dates=pd.DatetimeIndex([date]),
            fc_prefix="fc",
        )
        X = X[bundle_lead["feature_columns"]]

        p = float(_classify_probability(bundle_lead, X))
        mm, lo, hi = _amount_prediction(bundle_lead, X)

        entry.update(
            {
                "model_available": True,
                "probability_rain": round(p, 4),
                "predicted_rain": p >= float(bundle_lead["probability_threshold"]),
                "rain_threshold_mm": float(bundle_lead["rain_threshold_mm"]),
                "probability_threshold": float(bundle_lead["probability_threshold"]),
                "amount_mm": round(mm, 2),
                "amount_interval_mm": [round(max(0.0, lo), 2), round(hi, 2)],
                "amount_interval_level": 1 - float(bundle_lead["conformal_alpha"]),
                "expected_mm": round(p * mm, 2),
                "nwp_forecast_mm": entry["nwp_forecast_mm"],
            }
        )
        rows.append(entry)

    config = bundle.get("config", {})
    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude,
            "name": name,
            "elevation_m": _num(elevation),
            "timezone": fc_meta.get("timezone"),
            "grid_resolution": "reanalysis/forecast grid ~0.25° (~25 km); values are grid-cell "
            "estimates for this point, not a point measurement",
        },
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "local_date": local_today.strftime("%Y-%m-%d"),
        "horizon_days": days,
        "model": {
            "trained_at": bundle.get("trained_at"),
            "trained_leads": sorted(trained_leads),
            "selected_classifier": {k: v.get("classifier_name") for k, v in trained.items()},
            "selected_regressor": {k: v.get("regressor_name") for k, v in trained.items()},
            "rain_threshold_mm": config.get("rain_threshold_mm"),
            "training_locations": [l["name"] for l in config.get("training_locations", [])],
            "splits": config.get("splits"),
        },
        "days": rows,
        "sources": {
            "forecast_features": "Open-Meteo Forecast API (NWP model run, issued now)",
            "observations": "Open-Meteo Historical Weather API (ERA5/ERA5-Land reanalysis)",
            "climatology": clim_meta["climatology_source"],
            "model": "Locally trained Mausam Sense model (see backend/README.md)",
        },
        "climatology": clim_meta,
        "notes": notes,
    }


def _num(value: Any) -> float | None:
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return None if not np.isfinite(f) else round(f, 3)


def _classify_probability(bundle_lead: dict[str, Any], X: pd.DataFrame) -> float:
    model = bundle_lead["classifier"]
    if bundle_lead["classifier_name"] == "baseline_climatology":
        return float(np.clip(X["clim_freq"].astype(float).iloc[0], 0, 1))
    if hasattr(model, "predict_proba"):
        raw = float(model.predict_proba(X)[0, 1])
    else:
        raw = float(model.predict(X)[0])
    calibrator = bundle_lead.get("calibrator")
    if calibrator is not None:
        raw = float(calibrator.predict(np.array([raw]))[0])
    return float(np.clip(raw, 0.0, 1.0))


def _season_label(X: pd.DataFrame) -> str:
    """Resolve the calendar-season one-hot flags to a season label."""
    for flag in ("monsoon_jjas", "premonsoon_mam", "postmonsoon_on", "winter_djf"):
        if flag in X.columns and float(X[flag].astype(float).iloc[0]) >= 0.5:
            return flag
    return "unknown"


def _conformal_width(bundle_lead: dict[str, Any], X: pd.DataFrame) -> float:
    """Half-width of the predictive interval, season-stratified when available.

    Conformal residuals are measured in mm space, so the half-width is added
    and subtracted from the amount directly.
    """
    q = bundle_lead.get("conformal_q")
    if isinstance(q, dict):
        season = _season_label(X)
        value = q.get(f"q80_{season}", q.get("q80", 0.0))
        return float(value or 0.0)
    return float(q or 0.0)


def _amount_prediction(bundle_lead: dict[str, Any], X: pd.DataFrame) -> tuple[float, float, float]:
    """Return (amount_mm, lower_mm, upper_mm) with a conformal interval."""
    q = _conformal_width(bundle_lead, X)
    if bundle_lead["regressor_name"] == "baseline_climatology" or bundle_lead.get("regressor") is None:
        mm = float(np.clip(X["clim_mm"].astype(float).iloc[0], 0, None))
    else:
        log_pred = float(bundle_lead["regressor"].predict(X)[0])
        smear = float(bundle_lead.get("smear_factor", 1.0) or 1.0)
        plain = float(np.clip(np.expm1(max(0.0, log_pred)), 0.0, None))
        mm = plain if abs(smear - 1.0) < 1e-12 else float(
            np.clip((1.0 + plain) * smear - 1.0, 0.0, None)
        )
    return mm, max(0.0, mm - q), mm + q
