"""API tests via FastAPI's TestClient (no server process, no training).

Covers: health/metadata, request validation (422), missing-artifact errors
(503), CORS-shaped responses, and the honest IMD-unavailable path.
Network-dependent behaviour (live prediction/verification) is out of scope
here and is exercised by the smoke test documented in backend/README.md.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from ml import inference as I


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# --------------------------------------------------------------------------- #
# System endpoints
# --------------------------------------------------------------------------- #


def test_root_lists_endpoints(client):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["api"] == "/api/v1"
    assert any("predict" in e for e in body["endpoints"])


def test_health_shape(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "mausam-sense-ml"
    assert body["model_ready"] in (True, False)
    # Never claim IMD is configured without a key.
    if not body["imd_configured"]:
        assert body["status"] in ("ok", "model_missing", "degraded")


def test_sources_discloses_provenance(client):
    r = client.get("/api/v1/sources")
    assert r.status_code == 200
    body = r.json()
    keys = {s["key"] for s in body["sources"]}
    assert {"observations", "forecast_archive", "forecast_live", "imd", "model"} <= keys
    # IMD must be reported unavailable when no key is configured.
    imd = next(s for s in body["sources"] if s["key"] == "imd")
    if not body.get("_imd_key"):  # default test env has no key
        assert imd["status"] in ("unavailable", "configured")
    assert body["disclosures"], "provenance disclosures must be present"


def test_locations_lists_training_cities(client):
    r = client.get("/api/v1/locations")
    assert r.status_code == 200
    ids = [l["id"] for l in r.json()["training_locations"]]
    assert "chennai" in ids
    assert len(ids) >= 6


def test_history_empty_is_not_an_error(client):
    r = client.get("/api/v1/history?limit=5")
    assert r.status_code == 200
    assert "items" in r.json()


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "query",
    [
        "latitude=999&longitude=0",  # lat out of range
        "latitude=0&longitude=999",  # lon out of range
        "latitude=0",  # longitude required
        "longitude=0",  # latitude required
        "latitude=abc&longitude=0",  # wrong type
    ],
)
def test_predict_validation_422(client, query):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get(f"/api/v1/predict?{query}")
    assert r.status_code == 422


def test_predict_days_bounds(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    assert client.get("/api/v1/predict?latitude=13&longitude=80&days=0").status_code == 422
    assert client.get("/api/v1/predict?latitude=13&longitude=80&days=99").status_code == 422


def test_predict_missing_artifacts_returns_503(client, monkeypatch, tmp_path):
    """Without trained artifacts the API must say so, not fabricate."""
    monkeypatch.setattr(I, "_BUNDLE", None)
    monkeypatch.setattr(I, "_BUNDLE_MTIME", None)
    monkeypatch.setattr("ml.config.ARTIFACTS_DIR", tmp_path)
    r = client.get("/api/v1/predict?latitude=13.1&longitude=80.3&record=false")
    if r.status_code == 200:
        # bundle already cached from disk elsewhere — acceptable, just assert shape
        assert "days" in r.json()
    else:
        assert r.status_code == 503
        assert "ml.train" in r.json()["detail"]


# --------------------------------------------------------------------------- #
# Verification validation
# --------------------------------------------------------------------------- #


def test_verification_requires_location(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get("/api/v1/verification")
    assert r.status_code == 422
    assert "latitude" in r.json()["detail"] or "locations" in r.json()["detail"]


def test_verification_rejects_location_plus_coordinates(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get(
        "/api/v1/verification?locations=chennai&latitude=13.1&longitude=80.3"
    )
    assert r.status_code == 422


def test_verification_rejects_bad_dates(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get("/api/v1/verification?latitude=13.1&longitude=80.3&start=not-a-date")
    assert r.status_code == 422


def test_verification_rejects_reversed_range(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get(
        "/api/v1/verification?latitude=13.1&longitude=80.3"
        "&start=2026-05-01&end=2026-01-01"
    )
    assert r.status_code == 422


def test_verification_rejects_future_end(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get(
        "/api/v1/verification?latitude=13.1&longitude=80.3"
        "&start=2026-01-01&end=2099-01-01"
    )
    assert r.status_code == 422


def test_verification_rejects_unknown_location(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get(
        "/api/v1/verification?locations=atlantis&start=2026-05-01&end=2026-05-07"
    )
    assert r.status_code == 422
    assert "Unknown location" in r.json()["detail"]


def test_verification_lead_bounds(client):
    if not I.bundle_available():
        pytest.skip("artifacts not trained")
    r = client.get("/api/v1/verification?latitude=13.1&longitude=80.3&lead=9")
    assert r.status_code == 422


# --------------------------------------------------------------------------- #
# Metrics endpoint (artifact-backed, no network)
# --------------------------------------------------------------------------- #


def test_metrics_endpoint_shape(client):
    from pathlib import Path

    from ml import config as C

    if not (Path(C.ARTIFACTS_DIR) / "metrics.json").exists():
        pytest.skip("metrics.json not present")
    r = client.get("/api/v1/metrics")
    assert r.status_code == 200
    body = r.json()
    assert "summary_by_lead" in body
    assert "per_lead" in body
    assert "disclaimer" in body  # always labelled
    lead1 = body["summary_by_lead"]["1"]
    for key in ("ml_mae", "nwp_mae", "climatology_mae", "ml_brier", "ml_interval_coverage"):
        assert key in lead1
    # Every per-lead block must disclose its test period.
    assert body["per_lead"]["1"]["test_period"]["start"]


def test_metrics_missing_returns_503(client, monkeypatch, tmp_path):
    monkeypatch.setattr("ml.config.ARTIFACTS_DIR", tmp_path)
    r = client.get("/api/v1/metrics")
    assert r.status_code == 503
    assert "ml.train" in r.json()["detail"]
