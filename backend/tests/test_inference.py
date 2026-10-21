"""Inference tests: artifact loading, model semantics, prediction structure.

These tests exercise the saved-artifact path only — they never train and
(aside from one documented network-free validation case) never fetch data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml import config as C
from ml import inference as I


# --------------------------------------------------------------------------- #
# Bundle
# --------------------------------------------------------------------------- #


def test_bundle_available_matches_file():
    assert I.bundle_available() == I.bundle_path().exists()


def test_load_bundle_has_expected_structure():
    if not I.bundle_available():
        pytest.skip("artifacts not trained in this checkout")
    bundle = I.load_bundle(refresh=True)
    assert bundle["leads"], "bundle must contain trained leads"
    assert bundle["config"]["rain_threshold_mm"] == C.RAIN_THRESHOLD_MM
    assert bundle["config"]["feature_columns"]
    for lead_key, lb in bundle["leads"].items():
        assert int(lead_key) in C.LEADS
        assert lb["feature_columns"] == bundle["config"]["feature_columns"]
        assert 0.0 <= float(lb["probability_threshold"]) <= 1.0
        assert float(lb["rain_threshold_mm"]) == C.RAIN_THRESHOLD_MM


def test_load_bundle_missing_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(I, "ARTIFACTS_OVERRIDE", None, raising=False)
    monkeypatch.setattr(C, "ARTIFACTS_DIR", tmp_path)
    monkeypatch.setattr(I, "_BUNDLE", None)
    monkeypatch.setattr(I, "_BUNDLE_MTIME", None)
    with pytest.raises(I.ModelUnavailableError):
        I.load_bundle(refresh=True)


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #


def test_haversine_known_distance():
    # Chennai → Bengaluru ≈ 283 km great-circle.
    km = I._haversine_km(13.0827, 80.2707, 12.9716, 77.5946)
    assert 270 < km < 300


def test_nearest_training_location():
    loc, km = I.nearest_training_location(13.1, 80.3)  # ≈ Chennai
    assert loc.id == "chennai"
    assert km < 10
    far, km_far = I.nearest_training_location(28.6, 77.2)
    assert far.id == "delhi"


def test_adhoc_location_cache_key_is_filesystem_safe():
    loc = I._adhoc_location(13.0827, -80.2707)
    assert loc.id.startswith("gps_")
    assert "/" not in loc.id and "\\" not in loc.id


def test_predict_rejects_out_of_range_coordinates():
    with pytest.raises(I.InferenceError):
        I.predict(91.0, 0.0)
    with pytest.raises(I.InferenceError):
        I.predict(0.0, -181.0)


# --------------------------------------------------------------------------- #
# Model semantics on a synthetic bundle (no network)
# --------------------------------------------------------------------------- #


def _feature_row(**overrides) -> pd.DataFrame:
    from ml import features as F

    row = {col: 0.0 for col in F.FEATURE_COLUMNS}
    row.update(
        {
            "clim_mm": 4.0,
            "clim_freq": 0.3,
            "fc_precip_mm": 6.0,
            "monsoon_jjas": 1.0,
        }
    )
    row.update(overrides)
    return pd.DataFrame([row], index=pd.DatetimeIndex(["2026-07-15"]))


class _ConstantProbModel:
    def __init__(self, p: float):
        self.p = p

    def predict_proba(self, X):
        return np.column_stack([np.full(len(X), 1 - self.p), np.full(len(X), self.p)])


class _ConstantLogModel:
    def __init__(self, log_mm: float):
        self.log_mm = log_mm

    def predict(self, X):
        return np.full(len(X), self.log_mm)


def test_classify_probability_without_calibrator():
    lb = {"classifier": _ConstantProbModel(0.7), "classifier_name": "test", "calibrator": None}
    p = I._classify_probability(lb, _feature_row())
    assert p == pytest.approx(0.7)


def test_classify_probability_clipped_to_unit_interval():
    lb = {"classifier": _ConstantProbModel(1.4), "classifier_name": "test", "calibrator": None}
    assert I._classify_probability(lb, _feature_row()) == pytest.approx(1.0)


def test_classify_climatology_baseline_ignores_model():
    lb = {
        "classifier": None,
        "classifier_name": "baseline_climatology",
        "calibrator": None,
    }
    p = I._classify_probability(lb, _feature_row(clim_freq=0.42))
    assert p == pytest.approx(0.42)


def test_amount_prediction_backtransforms_log_target():
    lb = {
        "regressor": _ConstantLogModel(np.log1p(9.0)),  # log1p(9) → 9 mm
        "regressor_name": "test",
        "conformal_q": 2.0,
        "smear_factor": 1.0,
    }
    mm, lo, hi = I._amount_prediction(lb, _feature_row())
    assert mm == pytest.approx(9.0)
    assert lo == pytest.approx(7.0)  # mm-space conformal half-width
    assert hi == pytest.approx(11.0)
    assert 0 <= lo <= mm <= hi


def test_amount_prediction_clips_negative_predictions():
    lb = {
        "regressor": _ConstantLogModel(-3.0),  # negative log → clipped to 0
        "regressor_name": "test",
        "conformal_q": 1.0,
        "smear_factor": 1.0,
    }
    mm, lo, hi = I._amount_prediction(lb, _feature_row())
    assert mm == 0.0
    assert lo == 0.0  # lower bound never negative


def test_amount_prediction_applies_smearing_factor():
    lb_plain = {
        "regressor": _ConstantLogModel(np.log1p(10.0)),
        "regressor_name": "test",
        "conformal_q": 0.0,
        "smear_factor": 1.0,
    }
    lb_smear = {**lb_plain, "smear_factor": 1.5}
    plain = I._amount_prediction(lb_plain, _feature_row())[0]
    smeared = I._amount_prediction(lb_smear, _feature_row())[0]
    # (1 + mm) * 1.5 − 1 = 15.5 for mm = 10
    assert plain == pytest.approx(10.0)
    assert smeared == pytest.approx(15.5)


def test_amount_prediction_climatology_baseline():
    lb = {
        "regressor": None,
        "regressor_name": "baseline_climatology",
        "conformal_q": 1.5,
        "smear_factor": 1.0,
    }
    mm, lo, hi = I._amount_prediction(lb, _feature_row(clim_mm=4.0))
    assert mm == pytest.approx(4.0)
    assert lo == pytest.approx(2.5)
    assert hi == pytest.approx(5.5)


def test_season_stratified_conformal_width():
    """Monsoon rows get the monsoon half-width, winter rows the winter one."""
    lb = {
        "regressor": _ConstantLogModel(np.log1p(10.0)),
        "regressor_name": "test",
        "conformal_q": {"q80": 5.0, "q80_monsoon_jjas": 9.0, "q80_winter_djf": 0.5},
        "smear_factor": 1.0,
    }
    monsoon = _feature_row(monsoon_jjas=1.0, winter_djf=0.0)
    winter = _feature_row(monsoon_jjas=0.0, winter_djf=1.0)
    assert I._conformal_width(lb, monsoon) == pytest.approx(9.0)
    assert I._conformal_width(lb, winter) == pytest.approx(0.5)


def test_conformal_width_falls_back_to_global():
    lb = {
        "regressor": None,
        "regressor_name": "baseline_climatology",
        "conformal_q": {"q80": 5.0, "q80_monsoon_jjas": 9.0},
        "smear_factor": 1.0,
    }
    # premonsoon row has no stratified entry → global q80
    row = _feature_row(monsoon_jjas=0.0, winter_djf=0.0, premonsoon_mam=1.0)
    assert I._conformal_width(lb, row) == pytest.approx(5.0)


def test_conformal_width_accepts_legacy_float():
    lb = {"conformal_q": 3.25}
    assert I._conformal_width(lb, _feature_row()) == pytest.approx(3.25)
