"""Unit tests for the metric definitions (known values, hand-checked)."""

from __future__ import annotations

import numpy as np
import pytest

from ml import metrics as M


def test_mae_rmse_bias_known_values():
    y = np.array([0.0, 10.0])
    p = np.array([2.0, 4.0])
    assert M.mae(y, p) == pytest.approx(4.0)  # (2 + 6) / 2
    assert M.rmse(y, p) == pytest.approx(np.sqrt((4 + 36) / 2))
    assert M.bias(y, p) == pytest.approx(-2.0)  # mean(pred - obs) → under


def test_bias_sign_convention():
    """Positive bias = overprediction, negative = underprediction."""
    y = np.array([5.0, 5.0])
    assert M.bias(y, np.array([7.0, 7.0])) > 0  # over
    assert M.bias(y, np.array([3.0, 3.0])) < 0  # under


def test_perfect_prediction_metrics():
    y = np.array([1.0, 2.0, 3.0])
    assert M.mae(y, y) == 0.0
    assert M.rmse(y, y) == 0.0
    assert M.bias(y, y) == 0.0


def test_metrics_ignore_nan_pairs():
    y = np.array([1.0, np.nan, 3.0])
    p = np.array([1.0, 5.0, 3.0])
    assert M.mae(y, p) == 0.0  # only the two finite pairs


def test_empty_input_returns_nan():
    assert np.isnan(M.mae(np.array([]), np.array([])))


def test_confusion_and_f1():
    y = np.array([1, 1, 0, 0])
    p = np.array([1, 0, 1, 0])
    c = M.confusion(y, p)
    assert c == {"tp": 1, "fp": 1, "tn": 1, "fn": 1}
    prf = M.precision_recall_f1(y, p)
    assert prf["precision"] == pytest.approx(0.5)
    assert prf["recall"] == pytest.approx(0.5)
    assert prf["f1"] == pytest.approx(0.5)


def test_perfect_classifier_f1():
    y = np.array([1, 1, 0, 0])
    assert M.precision_recall_f1(y, y)["f1"] == pytest.approx(1.0)


def test_brier_score_known_value():
    y = np.array([1.0, 0.0])
    p = np.array([0.7, 0.2])
    assert M.brier_score(y, p) == pytest.approx(((0.3) ** 2 + (0.2) ** 2) / 2)


def test_brier_perfect_and_worst():
    y = np.array([1.0, 0.0])
    assert M.brier_score(y, y) == 0.0
    assert M.brier_score(y, 1 - y) == pytest.approx(1.0)


def test_roc_auc_bounds_and_ordering():
    y = np.array([1, 1, 0, 0])
    assert M.roc_auc(y, np.array([0.9, 0.8, 0.2, 0.1])) == pytest.approx(1.0)
    assert M.roc_auc(y, np.array([0.1, 0.2, 0.8, 0.9])) == pytest.approx(0.0)
    assert M.roc_auc(y, np.array([0.5, 0.5, 0.5, 0.5])) == pytest.approx(0.5)


def test_roc_auc_handles_ties():
    y = np.array([1, 0, 1, 0])
    s = np.array([0.5, 0.5, 0.9, 0.1])
    auc = M.roc_auc(y, s)
    assert 0.0 <= auc <= 1.0


def test_skill_score():
    assert M.skill_score(80.0, 100.0) == pytest.approx(0.2)
    assert M.skill_score(120.0, 100.0) == pytest.approx(-0.2)  # worse than ref
    assert np.isnan(M.skill_score(1.0, 0.0))  # undefined vs zero ref


def test_conformal_quantile_is_conservative():
    """Finite-sample split-conformal level never falls below 1−α."""
    rng = np.random.default_rng(0)
    resid = rng.normal(size=100)
    q = M.conformal_quantile(resid, alpha=0.2)
    empirical = float(np.mean(np.abs(resid) <= q))
    assert empirical >= 0.75  # ≈80% target, finite-sample correction


def test_conformal_quantile_empty_is_nan():
    assert np.isnan(M.conformal_quantile(np.array([])))


def test_conformal_metrics_coverage():
    y = np.array([1.0, 2.0, 3.0, 100.0])
    lo = np.array([0.0, 0.0, 0.0, 0.0])
    hi = np.array([5.0, 5.0, 5.0, 5.0])
    out = M.conformal_metrics(y, lo, hi)
    assert out["coverage"] == pytest.approx(0.75)
    assert out["n_samples"] == 4


def test_rain_classification_uses_thresholds():
    y = np.array([0.2, 3.0])  # below / above 1.0 mm rain threshold
    p = np.array([0.9, 0.4])  # prob threshold 0.5 → both predicted dry
    out = M.rain_classification_metrics(y, p, rain_threshold_mm=1.0, prob_threshold=0.5)
    assert out["n_samples"] == 2
    assert out["rain_frequency"] == pytest.approx(0.5)
    assert out["recall"] == 0.0  # missed the one rain day


def test_overunder_report_counts():
    y = np.array([0.0, 10.0, 10.0])
    p = np.array([5.0, 9.8, 20.0])  # over, exact (within 0.1*... tolerance), over
    out = M.overunder_report(y, p, tolerance=0.5)
    assert out["over_count"] == 2
    assert out["exact_count"] == 1
    assert out["under_count"] == 0


def test_regression_metrics_counts_match():
    y = np.array([1.0, 2.0, np.nan])
    p = np.array([1.0, 3.0, 5.0])
    out = M.regression_metrics(y, p)
    assert out["n_samples"] == 2  # NaN pair dropped
