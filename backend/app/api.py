"""API routes (prefix: ``/api/v1``).

Endpoints
---------
``GET /health``          service + model status
``GET /sources``         data-source provenance for the UI transparency panel
``GET /locations``       reference locations used to train the pooled model
``GET /predict``         rainfall prediction for any coordinate (loads saved
                         artifacts — never retrains)
``GET /metrics``         stored evaluation metrics from the last training run
``GET /verification``    forecast verification against observations
                         (ML vs raw NWP vs climatology vs IMD-if-available)
``GET /history``         recent prediction requests served by this instance
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ml import config as C
from ml import inference as I
from ml import verify as V
from ml.httpcache import FetchError
from app.config import API_PREFIX, IMD_DISTRICT_ID, IMD_API_KEY, SERVICE_NAME, SERVICE_VERSION
from app.services import imd as imd_service
from app.services import store

router = APIRouter(prefix=API_PREFIX)

_TODAY = datetime.now(timezone.utc).date()


# --------------------------------------------------------------------------- #
# System / metadata
# --------------------------------------------------------------------------- #


@router.get("/health")
def health() -> dict[str, Any]:
    ready = I.bundle_available()
    trained_at = None
    leads: list[int] = []
    if ready:
        try:
            bundle = I.load_bundle()
            trained_at = bundle.get("trained_at")
            leads = sorted(int(k) for k in bundle.get("leads", {}))
        except Exception as exc:  # corrupt artifact — report honestly
            return {
                "status": "degraded",
                "service": SERVICE_NAME,
                "version": SERVICE_VERSION,
                "model_ready": False,
                "error": f"model bundle could not be loaded: {exc}",
                "imd_configured": bool(IMD_API_KEY),
            }
    return {
        "status": "ok" if ready else "model_missing",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "model_ready": ready,
        "trained_at": trained_at,
        "trained_leads": leads,
        "imd_configured": bool(IMD_API_KEY),
        "imd_district_configured": bool(IMD_DISTRICT_ID),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/sources")
def sources_info() -> dict[str, Any]:
    """Everything the dashboard needs to disclose data provenance."""
    return {
        "service": SERVICE_NAME,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {
                "key": "observations",
                "name": "Open-Meteo Historical Weather API (ERA5 / ERA5-Land reanalysis)",
                "detail": "Reanalysis grid ~0.25° (~25 km). Used as the observation reference "
                "for verification and for lagged features. Grid-cell estimates, NOT rain "
                "gauges.",
                "url": "https://open-meteo.com/en/docs/historical-weather-api",
                "status": "live",
            },
            {
                "key": "forecast_archive",
                "name": "Open-Meteo Previous Runs API (archived NWP forecasts)",
                "detail": "Global NWP model forecasts at fixed lead offsets (1–7 days ahead), "
                "archived from January 2024. This is NOT an IMD product.",
                "url": "https://open-meteo.com/en/docs/previous-runs-api",
                "status": "live",
            },
            {
                "key": "forecast_live",
                "name": "Open-Meteo Forecast API (current model run)",
                "detail": "Used at inference time for forecast features of upcoming days.",
                "url": "https://open-meteo.com/en/docs",
                "status": "live",
            },
            {
                "key": "imd",
                "name": "India Meteorological Department (IMD) public API",
                "detail": "Requires an issued API key (HTTP 401 without one). "
                + (
                    "Key configured — IMD comparisons enabled."
                    if IMD_API_KEY
                    else "No key configured — IMD comparisons reported unavailable."
                ),
                "url": "https://api.imd.gov.in/",
                "status": "configured" if IMD_API_KEY else "unavailable",
            },
            {
                "key": "model",
                "name": "Mausam Sense locally trained models",
                "detail": "Trained offline (python -m ml.train) on the sources above; this "
                "service only loads saved artifacts for inference.",
                "url": None,
                "status": "ready" if I.bundle_available() else "not_trained",
            },
        ],
        "disclosures": [
            "All rainfall values are daily totals in millimetres over local calendar days.",
            "Observations are reanalysis grid cells (~25 km), not station measurements; "
            "point-level accuracy is therefore grid-limited.",
            "ML predictions, NWP forecasts, IMD forecasts and reanalysis observations are "
            "always labelled separately — never mixed.",
        ],
    }


@router.get("/locations")
def locations() -> dict[str, Any]:
    return {
        "training_locations": [
            {
                "id": loc.id,
                "name": loc.name,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
            }
            for loc in C.TRAINING_LOCATIONS
        ],
        "note": "The pooled model was trained on these locations plus their surrounding grid "
        "cells; predictions elsewhere are spatial extrapolations and are labelled as such.",
    }


# --------------------------------------------------------------------------- #
# Prediction
# --------------------------------------------------------------------------- #


@router.get("/predict")
def predict(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    days: int = Query(7, ge=1, le=10),
    name: str | None = Query(None, max_length=120),
    refresh: bool = Query(False),
    record: bool = Query(True),
) -> dict[str, Any]:
    if not I.bundle_available():
        raise HTTPException(
            status_code=503,
            detail="No trained model artifacts found on the server. Run `python -m ml.train` "
            "in backend/ to train and save models first.",
        )
    try:
        result = I.predict(latitude, longitude, days=days, name=name, refresh=refresh)
    except I.ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except FetchError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream weather provider error: {exc}") from exc
    except I.ForecastFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except I.InferenceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if record:
        try:
            store.record_prediction(result)
        except Exception:  # history is best-effort; never fail the request
            pass
    return result


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #


@router.get("/metrics")
def metrics() -> dict[str, Any]:
    path = Path(C.ARTIFACTS_DIR) / "metrics.json"
    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail="No evaluation metrics found. Train the models first: python -m ml.train",
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["disclaimer"] = (
        "Metrics are computed on a chronological held-out test window "
        "(see per_lead[*].test_period) against reanalysis observations. "
        "They are NOT accuracy claims against rain-gauge measurements, and IMD is only "
        "included when real IMD data was available."
    )
    return payload


# --------------------------------------------------------------------------- #
# Verification
# --------------------------------------------------------------------------- #


def _default_window() -> tuple[str, str]:
    """Last 90 days ending 3 days ago (reanalysis publication lag)."""
    end = _TODAY - timedelta(days=3)
    start = end - timedelta(days=89)
    earliest = datetime.strptime(C.FORECAST_START, "%Y-%m-%d").date()
    if start < earliest:
        start = earliest
    return start.isoformat(), end.isoformat()


@router.get("/verification")
def verification(
    start: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    lead: int = Query(1, ge=1, le=7),
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
    locations: str | None = Query(
        None,
        description="Comma-separated training-location ids (e.g. 'chennai,mumbai'). "
        "Mutually exclusive with latitude/longitude.",
    ),
    include_imd: bool = Query(True),
    refresh: bool = Query(False),
) -> dict[str, Any]:
    default_start, default_end = _default_window()
    start = start or default_start
    end = end or default_end

    try:
        start_ts = datetime.strptime(start, "%Y-%m-%d").date()
        end_ts = datetime.strptime(end, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid date: {exc}") from exc
    if end_ts < start_ts:
        raise HTTPException(status_code=422, detail="end must not be before start")
    if end_ts > _TODAY:
        raise HTTPException(
            status_code=422,
            detail="end date cannot be in the future (verification needs observations).",
        )
    if lead not in C.LEADS:
        raise HTTPException(status_code=422, detail=f"lead must be one of {list(C.LEADS)}")
    if not I.bundle_available():
        raise HTTPException(
            status_code=503,
            detail="Model artifacts missing — train first with `python -m ml.train`.",
        )
    if locations and latitude is not None:
        raise HTTPException(
            status_code=422,
            detail="Provide either 'locations' or latitude/longitude, not both.",
        )
    if not locations and latitude is None:
        raise HTTPException(
            status_code=422,
            detail="Provide latitude/longitude or a 'locations' list.",
        )

    try:
        if locations:
            ids = [s.strip() for s in locations.split(",") if s.strip()]
            result = V.verify_locations(ids, start=start, end=end, lead=lead, refresh=refresh)
            result["imd_note"] = (
                "IMD verification is skipped for multi-location runs: IMD forecasts are "
                "district-specific (one district id per configured location)."
            )
            return result

        assert latitude is not None and longitude is not None
        imd_result = None
        if include_imd:
            imd_raw = imd_service.imd_forecast_for_window(start, end)
            imd_result = imd_raw  # available: false + reason when no key/window overlap
        result = V.verify_location(
            latitude=latitude,
            longitude=longitude,
            start=start,
            end=end,
            lead=lead,
            refresh=refresh,
            imd_result=None,
        )
        if include_imd:
            observed_series = {
                row["date"]: row["observed_mm"] for row in result["series"]
            }
            result["scores"]["imd"] = imd_service.score_imd_source(imd_result, observed_series)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FetchError as exc:
        raise HTTPException(
            status_code=502, detail=f"Upstream data provider error: {exc}"
        ) from exc


# --------------------------------------------------------------------------- #
# History
# --------------------------------------------------------------------------- #


@router.get("/history")
def history(limit: int = Query(20, ge=1, le=200)) -> dict[str, Any]:
    items = store.recent_predictions(limit)
    return {"items": items, **store.history_stats()}
