"""Evaluation metrics — implemented locally so definitions are explicit.

All functions are pure (numpy in → dict out) and unit-tested against known
values in ``tests/test_metrics.py``.

Definitions
-----------
* ``bias`` = mean(prediction − observation). Positive → systematic
  **overprediction**, negative → **underprediction**.
* ``mae``  = mean |prediction − observation|.
* ``rmse`` = sqrt(mean (prediction − observation)²).
* Classification metrics use the rain-day threshold on observed rainfall and
  the model's probability threshold (default 0.5, configurable).
* ``brier`` = mean (p − y)² — a probability-based score (lower is better).
* ``roc_auc`` = Mann–Whitney statistic on scores (ties handled correctly).
"""

from __future__ import annotations

import math

import numpy as np


def _clean_pairs(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = np.isfinite(y_true) & np.isfinite(y_pred)
    return y_true[mask], y_pred[mask]


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    yt, yp = _clean_pairs(y_true, y_pred)
    if yt.size == 0:
        return float("nan")
    return float(np.mean(np.abs(yp - yt)))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    yt, yp = _clean_pairs(y_true, y_pred)
    if yt.size == 0:
        return float("nan")
    return float(math.sqrt(float(np.mean((yp - yt) ** 2))))


def bias(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Mean error (prediction − observation)."""
    yt, yp = _clean_pairs(y_true, y_pred)
    if yt.size == 0:
        return float("nan")
    return float(np.mean(yp - yt))


def median_ae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    yt, yp = _clean_pairs(y_true, y_pred)
    if yt.size == 0:
        return float("nan")
    return float(np.median(np.abs(yp - yt)))


def confusion(y_true: np.ndarray, y_pred_binary: np.ndarray) -> dict[str, int]:
    yt = np.asarray(y_true).astype(bool)
    yp = np.asarray(y_pred_binary).astype(bool)
    if yt.size != yp.size:
        raise ValueError("y_true and predictions must have the same length")
    return {
        "tp": int(np.sum(yt & yp)),
        "fp": int(np.sum(~yt & yp)),
        "tn": int(np.sum(~yt & ~yp)),
        "fn": int(np.sum(yt & ~yp)),
    }


def precision_recall_f1(y_true: np.ndarray, y_pred_binary: np.ndarray) -> dict[str, float]:
    c = confusion(y_true, y_pred_binary)
    tp, fp, fn = c["tp"], c["fp"], c["fn"]
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    accuracy = (tp + c["tn"]) / max(1, tp + fp + tn_of(c) + fn)
    return {
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "accuracy": float(accuracy),
        **{k: float(v) for k, v in c.items()},
    }


def tn_of(c: dict[str, int]) -> int:
    return c["tn"]


def brier_score(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    yt, p = _clean_pairs(np.asarray(y_true, dtype=float), np.asarray(probabilities, dtype=float))
    if yt.size == 0:
        return float("nan")
    p = np.clip(p, 0.0, 1.0)
    return float(np.mean((p - yt) ** 2))


def roc_auc(y_true: np.ndarray, scores: np.ndarray) -> float:
    """ROC AUC via the rank statistic (handles ties by average ranks)."""
    yt = np.asarray(y_true).astype(bool)
    s = np.asarray(scores, dtype=float)
    mask = np.isfinite(s)
    yt, s = yt[mask], s[mask]
    n_pos = int(yt.sum())
    n_neg = int((~yt).sum())
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    order = np.argsort(s, kind="mergesort")
    ranks = np.empty(len(s), dtype=float)
    sorted_s = s[order]
    i = 0
    while i < len(s):
        j = i
        while j + 1 < len(s) and sorted_s[j + 1] == sorted_s[i]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0  # 1-based average rank for the tie group
        ranks[order[i : j + 1]] = avg_rank
        i = j + 1
    rank_sum_pos = float(ranks[yt].sum())
    return float((rank_sum_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))


def rain_classification_metrics(
    y_true_mm: np.ndarray,
    probabilities: np.ndarray,
    *,
    rain_threshold_mm: float = 1.0,
    prob_threshold: float = 0.5,
) -> dict[str, float]:
    """Occurrence metrics for rain/no-rain decisions."""
    y_true_mm = np.asarray(y_true_mm, dtype=float)
    p = np.asarray(probabilities, dtype=float)
    mask = np.isfinite(y_true_mm) & np.isfinite(p)
    y_true_mm, p = y_true_mm[mask], p[mask]
    y_true = y_true_mm >= rain_threshold_mm
    prf = precision_recall_f1(y_true, p >= prob_threshold)
    prf["brier"] = brier_score(y_true, p)
    prf["roc_auc"] = roc_auc(y_true, p)
    prf["n_samples"] = int(len(y_true))
    prf["rain_frequency"] = float(y_true.mean()) if len(y_true) else float("nan")
    return prf


def regression_metrics(y_true_mm: np.ndarray, y_pred_mm: np.ndarray) -> dict[str, float]:
    y_true_mm = np.asarray(y_true_mm, dtype=float)
    y_pred_mm = np.asarray(y_pred_mm, dtype=float)
    mask = np.isfinite(y_true_mm) & np.isfinite(y_pred_mm)
    yt, yp = y_true_mm[mask], y_pred_mm[mask]
    return {
        "mae": mae(yt, yp),
        "rmse": rmse(yt, yp),
        "bias": bias(yt, yp),
        "median_ae": median_ae(yt, yp),
        "n_samples": int(len(yt)),
        "obs_mean_mm": float(yt.mean()) if len(yt) else float("nan"),
        "pred_mean_mm": float(yp.mean()) if len(yp) else float("nan"),
    }


def skill_score(score_model: float, score_reference: float) -> float:
    """Relative skill: 1 − score/reference (works for MAE/RMSE/Brier)."""
    if not np.isfinite(score_model) or not np.isfinite(score_reference):
        return float("nan")
    if score_reference == 0:
        return float("nan")
    return float(1.0 - score_model / score_reference)


# --------------------------------------------------------------------------- #
# Uncertainty: split-conformal prediction intervals
# --------------------------------------------------------------------------- #


def conformal_quantile(residuals: np.ndarray, alpha: float = 0.2) -> float:
    """Finite-sample (split conformal) quantile of |residual| at level 1−α."""
    r = np.abs(np.asarray(residuals, dtype=float))
    r = r[np.isfinite(r)]
    if r.size == 0:
        return float("nan")
    level = math.ceil((r.size + 1) * (1 - alpha)) / r.size
    level = min(1.0, level)
    return float(np.quantile(r, level))


def conformal_metrics(
    y_true: np.ndarray, lower: np.ndarray, upper: np.ndarray
) -> dict[str, float]:
    """Coverage and mean width of prediction intervals on held-out data."""
    yt = np.asarray(y_true, dtype=float)
    lo = np.asarray(lower, dtype=float)
    hi = np.asarray(upper, dtype=float)
    mask = np.isfinite(yt) & np.isfinite(lo) & np.isfinite(hi)
    if not mask.any():
        return {"coverage": float("nan"), "mean_width": float("nan"), "n_samples": 0}
    yt, lo, hi = yt[mask], lo[mask], hi[mask]
    inside = (yt >= lo) & (yt <= hi)
    return {
        "coverage": float(inside.mean()),
        "mean_width": float(np.mean(hi - lo)),
        "n_samples": int(mask.sum()),
    }


def overunder_report(y_true: np.ndarray, y_pred: np.ndarray, tolerance: float = 0.1) -> dict[str, float]:
    """Counts of systematic over/under prediction for rainfall amounts.

    ``tolerance`` (mm) absorbs negligible differences so that tiny amounts
    are not labelled as bias.
    """
    yt, yp = _clean_pairs(y_true, y_pred)
    if yt.size == 0:
        return {"over_count": 0, "under_count": 0, "exact_count": 0, "n": 0}
    diff = yp - yt
    return {
        "over_count": int(np.sum(diff > tolerance)),
        "under_count": int(np.sum(diff < -tolerance)),
        "exact_count": int(np.sum(np.abs(diff) <= tolerance)),
        "n": int(yt.size),
        "mean_error": float(diff.mean()),
        "median_error": float(np.median(diff)),
    }
