"""Forecast–observation alignment tests: units, dates, dropped rows."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml import verify as V


def test_to_mm_unit_conversions():
    assert V.to_mm([1.0], "mm")[0] == pytest.approx(1.0)
    assert V.to_mm([1.0], "cm")[0] == pytest.approx(10.0)
    assert V.to_mm([1.0], "in")[0] == pytest.approx(25.4)
    assert V.to_mm([2.0], "INCHES")[0] == pytest.approx(50.8)


def test_to_mm_unknown_unit_raises():
    with pytest.raises(ValueError):
        V.to_mm([1.0], "furlongs")


def test_align_same_dates_keeps_all_rows():
    idx = pd.date_range("2026-01-01", periods=5)
    obs = pd.Series(range(5), index=idx, dtype=float)
    fc = pd.Series(range(5), index=idx, dtype=float)
    aligned, stats = V.align_forecast_observation(obs, fc)
    assert len(aligned) == 5
    assert stats["aligned_dates"] == 5
    assert stats["dropped_missing_observed"] == 0


def test_align_converts_mismatched_units():
    idx = pd.date_range("2026-01-01", periods=3)
    obs = pd.Series([10.0, 20.0, 30.0], index=idx)  # centimetres
    fc = pd.Series([1.0, 2.0, 3.0], index=idx)  # millimetres
    aligned, stats = V.align_forecast_observation(
        obs, fc, observed_unit="cm", forecast_unit="mm"
    )
    np.testing.assert_allclose(aligned["observed_mm"], [100.0, 200.0, 300.0])
    np.testing.assert_allclose(aligned["forecast_mm"], [1.0, 2.0, 3.0])
    assert stats["observed_unit_in"] == "cm"


def test_align_drops_non_overlapping_dates():
    obs = pd.Series([1.0, 2.0], index=pd.date_range("2026-01-01", periods=2))
    fc = pd.Series([3.0, 4.0], index=pd.date_range("2026-01-02", periods=2))
    aligned, stats = V.align_forecast_observation(obs, fc)
    assert len(aligned) == 1  # only 2026-01-02 overlaps
    assert list(aligned.index) == [pd.Timestamp("2026-01-02")]
    assert stats["aligned_dates"] == 1


def test_align_drops_nan_rows():
    idx = pd.date_range("2026-01-01", periods=3)
    obs = pd.Series([1.0, np.nan, 3.0], index=idx)
    fc = pd.Series([1.0, 2.0, np.nan], index=idx)
    aligned, stats = V.align_forecast_observation(obs, fc)
    assert len(aligned) == 1
    assert stats["dropped_missing_observed"] == 1
    assert stats["dropped_missing_forecast"] == 1


def test_align_empty_inputs():
    aligned, stats = V.align_forecast_observation(
        pd.Series(dtype=float), pd.Series(dtype=float)
    )
    assert aligned.empty
    assert stats["aligned_dates"] == 0


def test_score_aligned_amount_and_deterministic_occurrence():
    idx = pd.date_range("2026-01-01", periods=4)
    aligned = pd.DataFrame(
        {"observed_mm": [0.0, 5.0, 0.0, 10.0], "forecast_mm": [0.0, 4.0, 2.0, 10.0]},
        index=idx,
    )
    out = V.score_aligned(aligned)
    assert out["available"]
    assert out["n"] == 4
    assert out["amount"]["mae"] == pytest.approx(0.75)  # (0+1+2+0)/4
    # Deterministic forecast classifies by its own amount threshold.
    assert "occurrence" in out
    assert out["occurrence"]["n_samples"] == 4


def test_score_aligned_with_probabilities_uses_prob_threshold():
    idx = pd.date_range("2026-01-01", periods=4)
    aligned = pd.DataFrame(
        {
            "observed_mm": [0.0, 5.0, 0.0, 10.0],
            "forecast_mm": [0.0, 4.0, 0.0, 10.0],
        },
        index=idx,
    )
    probs = pd.Series([0.1, 0.6, 0.4, 0.9], index=idx)
    out = V.score_aligned(aligned, probabilities=probs, prob_threshold=0.5)
    # predicted rain on rows 2 and 4 → tp=2, fp=0
    assert out["occurrence"]["precision"] == pytest.approx(1.0)


def test_score_aligned_empty_frame():
    out = V.score_aligned(pd.DataFrame())
    assert out["available"] is False
    assert out["n"] == 0


def test_breakdown_groups_by_label():
    idx = pd.date_range("2026-01-01", periods=4)
    aligned = pd.DataFrame(
        {"observed_mm": [0.0, 5.0, 0.0, 10.0], "forecast_mm": [0.0, 5.0, 0.0, 10.0]},
        index=idx,
    )
    labels = pd.Series(["a", "a", "b", "b"], index=idx)
    out = V.breakdown(aligned, labels)
    assert set(out) == {"a", "b"}
    assert out["a"]["amount"]["mae"] == pytest.approx(0.0)


def test_window_role_is_explicit():
    train_end = pd.Timestamp("2025-06-30")
    val_end = pd.Timestamp("2025-12-31")
    assert V.window_role(train_end, train_end)["role"] == "train"
    assert V.window_role(train_end, val_end)["role"] == "train+val"
    out = V.window_role(val_end + pd.Timedelta(days=1), val_end + pd.Timedelta(days=1))
    assert out["role"] == "test"
    assert out["independent_test"] is True
    # A window overlapping training must be flagged as in-sample evidence.
    overlap = V.window_role(pd.Timestamp("2025-06-01"), pd.Timestamp("2026-02-01"))
    assert overlap["independent_test"] is False
