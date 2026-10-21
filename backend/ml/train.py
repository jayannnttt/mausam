"""Offline training entry point.

Run **once** (never inside an API request):

    cd backend
    python -m ml.train                 # full run: download → train → evaluate
    python -m ml.train --leads 1 2     # subset of lead times
    python -m ml.train --refresh       # bypass the HTTP cache

What it does
------------
1. Downloads (and caches) observed reanalysis weather + archived NWP
   forecasts for the six training locations.
2. Builds one supervised dataset per forecast lead (1, 2, 3, 5, 7 days).
3. Splits **chronologically** train / val / test (no shuffling anywhere).
4. Trains candidate models for
   a) rain/no-rain occurrence  — logistic regression, random forest,
      histogram gradient boosting, XGBoost (plus a climatology baseline), and
   b) rainfall amount          — random forest, histogram gradient boosting,
      XGBoost (plus a climatology baseline).
5. Selects candidates by **validation** performance (Brier for occurrence,
   MAE for amount), calibrates probabilities with isotonic regression on a
   held-out calibration slice, and fits a split-conformal interval for the
   amount.
6. Evaluates everything **once** on the untouched test window and writes
   ``artifacts/metrics.json`` + ``artifacts/model_bundle.joblib``.

The test window is also used to compare the ML model against the raw NWP
forecast and the climatology baseline on *identical* rows.
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from . import config as C
from . import datasets as D
from . import features as F
from . import metrics as M
from .features import FEATURE_COLUMNS

SEED = 42

CLASSIFIER_CANDIDATES = ("logistic_regression", "random_forest", "gradient_boosting", "xgboost")
REGRESSOR_CANDIDATES = ("random_forest", "gradient_boosting", "xgboost")


# --------------------------------------------------------------------------- #
# Model factories (fresh estimator per call — no state leaks between runs)
# --------------------------------------------------------------------------- #


def make_classifier(name: str):
    from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    if name == "logistic_regression":
        return Pipeline(
            [
                ("impute", SimpleImputer(strategy="median")),
                ("scale", StandardScaler()),
                ("model", LogisticRegression(max_iter=2000, C=1.0, random_state=SEED)),
            ]
        )
    if name == "random_forest":
        return Pipeline(
            [
                ("impute", SimpleImputer(strategy="median")),
                (
                    "model",
                    RandomForestClassifier(
                        # Leaf cap keeps saved artifacts small (trees dominate
                        # the bundle size) while retaining skill.
                        n_estimators=200,
                        max_depth=12,
                        max_leaf_nodes=63,
                        min_samples_leaf=6,
                        max_features="sqrt",
                        class_weight="balanced_subsample",
                        n_jobs=-1,
                        random_state=SEED,
                    ),
                ),
            ]
        )
    if name == "gradient_boosting":
        # Native NaN handling — no imputer in the pipeline.
        return HistGradientBoostingClassifier(
            learning_rate=0.06,
            max_iter=300,
            max_leaf_nodes=31,
            min_samples_leaf=30,
            l2_regularization=1.0,
            random_state=SEED,
        )
    if name == "xgboost":
        from xgboost import XGBClassifier

        return XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=1.0,
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            random_state=SEED,
            n_jobs=-1,
        )
    raise ValueError(f"Unknown classifier {name!r}")


def make_regressor(name: str):
    from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import Pipeline

    if name == "random_forest":
        return Pipeline(
            [
                ("impute", SimpleImputer(strategy="median")),
                (
                    "model",
                    RandomForestRegressor(
                        n_estimators=200,
                        max_depth=12,
                        max_leaf_nodes=63,
                        min_samples_leaf=6,
                        max_features="sqrt",
                        n_jobs=-1,
                        random_state=SEED,
                    ),
                ),
            ]
        )
    if name == "gradient_boosting":
        return HistGradientBoostingRegressor(
            learning_rate=0.06,
            max_iter=300,
            max_leaf_nodes=31,
            min_samples_leaf=30,
            l2_regularization=1.0,
            loss="squared_error",
            random_state=SEED,
        )
    if name == "xgboost":
        from xgboost import XGBRegressor

        return XGBRegressor(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=1.0,
            objective="reg:squarederror",
            tree_method="hist",
            random_state=SEED,
            n_jobs=-1,
        )
    raise ValueError(f"Unknown regressor {name!r}")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _predict_amount_mm(model, X: pd.DataFrame) -> np.ndarray:
    """Amount models are fit on log1p(mm); back-transform defensively."""
    raw = np.asarray(model.predict(X), dtype=float)
    if hasattr(model, "steps"):  # Pipeline — nothing special, same transform
        pass
    mm = np.expm1(np.clip(raw, 0.0, None))
    return np.clip(mm, 0.0, None)


def _predict_log_amount(model, X: pd.DataFrame) -> np.ndarray:
    return np.asarray(model.predict(X), dtype=float)


def _retransform(mm_plain: np.ndarray, smear_factor: float) -> np.ndarray:
    """Apply the Duan smearing factor in (1 + mm) space, clipped at zero."""
    arr = np.clip(np.asarray(mm_plain, dtype=float), 0.0, None)
    if abs(smear_factor - 1.0) < 1e-12:
        return arr
    return np.clip((1.0 + arr) * smear_factor - 1.0, 0.0, None)


def _season_widths(
    seasons: np.ndarray, conformal_q: dict[str, float], fallback: float
) -> np.ndarray:
    """Per-row interval half-widths, stratified by season where calibrated."""
    return np.asarray(
        [float(conformal_q.get(f"q80_{str(s)}", fallback)) for s in seasons], dtype=float
    )


def _split_frame(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    return {name: df[df["split"] == name].copy() for name in ("train", "val", "test")}


def _val_slices(val: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Chronological 60/40 split of the validation window.

    First part → model selection; second part → probability calibration and
    conformal residuals (never used for fitting the models themselves).
    """
    if val.empty:
        return val, val
    dates = np.sort(val["date"].unique())
    if len(dates) < 4:
        return val, val
    cut = dates[max(1, int(len(dates) * 0.6))]
    return val[val["date"] < cut], val[val["date"] >= cut]


def _probabilities(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        return np.asarray(model.predict_proba(X)[:, 1], dtype=float)
    return np.asarray(model.predict(X), dtype=float)


def _climatology_baseline(X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Baseline: day-of-year climatological probability and mean amount."""
    p = X["clim_freq"].astype(float).clip(0, 1).to_numpy()
    mm = X["clim_mm"].astype(float).clip(0, None).to_numpy()
    return p, mm


def _choose_threshold(y: np.ndarray, p: np.ndarray) -> float:
    """Probability threshold maximising F1 on the selection window."""
    best_t, best_f1 = 0.5, -1.0
    for t in np.round(np.arange(0.2, 0.81, 0.05), 2):
        prf = M.precision_recall_f1(y, p >= t)
        if prf["f1"] > best_f1:
            best_f1, best_t = prf["f1"], float(t)
    return best_t


# --------------------------------------------------------------------------- #
# Training per lead
# --------------------------------------------------------------------------- #


def evaluate_occurrence(y_mm: np.ndarray, p: np.ndarray, threshold: float) -> dict[str, float]:
    return M.rain_classification_metrics(
        y_mm, p, rain_threshold_mm=C.RAIN_THRESHOLD_MM, prob_threshold=threshold
    )


def train_lead(lead: int, df: pd.DataFrame) -> tuple[dict[str, Any], dict[str, Any]]:
    """Train + evaluate all candidates for one lead. Returns (bundle, metrics)."""
    splits = _split_frame(df)
    train, val, test = splits["train"], splits["val"], splits["test"]
    val_select, val_cal = _val_slices(val)

    if min(len(train), len(val_select), len(test)) < 50:
        raise RuntimeError(
            f"Insufficient data for lead {lead}: train={len(train)} "
            f"val={len(val_select)} test={len(test)}"
        )

    X_train, y_train_mm = train[FEATURE_COLUMNS], train["y_mm"].to_numpy()
    X_sel, y_sel_mm = val_select[FEATURE_COLUMNS], val_select["y_mm"].to_numpy()
    X_cal, y_cal_mm = val_cal[FEATURE_COLUMNS], val_cal["y_mm"].to_numpy()
    X_test, y_test_mm = test[FEATURE_COLUMNS], test["y_mm"].to_numpy()
    # Full validation window — used only for conformal calibration residuals
    # (never for fitting), so the calibration set spans the monsoon as well.
    X_val, y_val_mm = val[FEATURE_COLUMNS], val["y_mm"].to_numpy()
    val_seasons = val["season"].astype(str).to_numpy()

    # ---------------- occurrence (rain / no-rain) ---------------- #
    clf_scores: dict[str, float] = {}
    classifiers: dict[str, Any] = {}
    for name in CLASSIFIER_CANDIDATES:
        model = make_classifier(name)
        model.fit(X_train, (y_train_mm >= C.RAIN_THRESHOLD_MM).astype(int))
        p_sel = _probabilities(model, X_sel)
        clf_scores[name] = M.brier_score(
            (y_sel_mm >= C.RAIN_THRESHOLD_MM).astype(int), p_sel
        )
        classifiers[name] = model

    best_clf_name = min(clf_scores, key=lambda k: clf_scores[k])

    # Baseline probabilities (climatology) for context.
    p_clim_sel, _ = _climatology_baseline(X_sel)
    clf_scores["baseline_climatology"] = M.brier_score(
        (y_sel_mm >= C.RAIN_THRESHOLD_MM).astype(int), p_clim_sel
    )

    # Probability calibration on the held-out calibration slice.
    raw_cal = _probabilities(classifiers[best_clf_name], X_cal)
    calibrator = None
    if len(X_cal) >= 200 and len(np.unique((y_cal_mm >= C.RAIN_THRESHOLD_MM).astype(int))) > 1:
        from sklearn.isotonic import IsotonicRegression

        iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        iso.fit(raw_cal, (y_cal_mm >= C.RAIN_THRESHOLD_MM).astype(int))
        calibrator = iso

    def clf_prob(X: pd.DataFrame) -> np.ndarray:
        raw = _probabilities(classifiers[best_clf_name], X)
        if calibrator is not None:
            return np.clip(np.asarray(calibrator.predict(raw), dtype=float), 0.0, 1.0)
        return np.clip(raw, 0.0, 1.0)

    threshold = _choose_threshold(
        y_sel_mm, clf_prob(X_sel) if calibrator is not None else _probabilities(classifiers[best_clf_name], X_sel)
    )

    # ---------------- amount ---------------- #
    reg_scores: dict[str, float] = {}
    regressors: dict[str, Any] = {}
    for name in REGRESSOR_CANDIDATES:
        model = make_regressor(name)
        model.fit(X_train, np.log1p(y_train_mm))
        p_mm = _predict_amount_mm(model, X_sel)
        reg_scores[name] = M.mae(y_sel_mm, p_mm)
        regressors[name] = model

    p_clim_mm_sel, _ = _climatology_baseline(X_sel)
    reg_scores["baseline_climatology"] = M.mae(y_sel_mm, p_clim_mm_sel)

    best_reg_name = min(reg_scores, key=lambda k: reg_scores[k])

    # ---------------- retransformation: Duan smearing ---------------- #
    # Amount models are fit on log1p(mm); expm1 alone is biased for the
    # arithmetic mean. Fit one smearing factor on the held-out calibration
    # slice and keep it only if it lowers MAE there versus a factor of 1.0.
    smear_factor = 1.0
    if best_reg_name != "baseline_climatology":
        log_cal = _predict_log_amount(regressors[best_reg_name], X_cal)
        cal_resid_log = np.log1p(np.clip(y_cal_mm, 0.0, None)) - log_cal
        s = float(np.mean(np.exp(np.clip(cal_resid_log, -30.0, 30.0))))
        if np.isfinite(s) and s > 0.0:
            mm_cal_plain = _predict_amount_mm(regressors[best_reg_name], X_cal)
            mm_cal_smear = _retransform(mm_cal_plain, s)
            if M.mae(y_cal_mm, mm_cal_smear) < M.mae(y_cal_mm, mm_cal_plain):
                smear_factor = s

    # ---------------- predictive interval (split-conformal) ---------------- #
    # Residuals are taken over the whole validation window (which never fits
    # the models), so the calibration set spans the monsoon too. Where a season
    # has enough residuals its own quantile is used; otherwise the global one.
    conformal_alpha = 0.2
    if best_reg_name == "baseline_climatology":
        mm_val = _climatology_baseline(X_val)[1]
    else:
        mm_val = _retransform(
            _predict_amount_mm(regressors[best_reg_name], X_val), smear_factor
        )
    resid_val = y_val_mm - np.nan_to_num(mm_val, nan=0.0)
    conformal_global = M.conformal_quantile(resid_val, alpha=conformal_alpha)
    if not np.isfinite(conformal_global):
        conformal_global = 0.0
    conformal_q: dict[str, float] = {"q80": float(conformal_global)}
    for season_name in sorted(set(val_seasons)):
        season_resid = resid_val[val_seasons == season_name]
        if len(season_resid) < 40:
            continue
        q_season = M.conformal_quantile(season_resid, alpha=conformal_alpha)
        if np.isfinite(q_season) and float(q_season) > 0.0:
            conformal_q[f"q80_{season_name}"] = float(q_season)

    # ---------------- test evaluation ---------------- #
    y_true_rain = y_test_mm >= C.RAIN_THRESHOLD_MM
    # The raw NWP forecast amount is preserved as the model's `fc_precip_mm`
    # input feature (features are renamed from `fc{lead}_*` to a stable schema).
    nwp_mm = test["fc_precip_mm"].to_numpy(dtype=float)

    p_test = clf_prob(X_test)
    if best_reg_name == "baseline_climatology":
        mm_test = _climatology_baseline(X_test)[1]
    else:
        mm_test = _predict_amount_mm(regressors[best_reg_name], X_test)
        mm_test = _retransform(mm_test, smear_factor)
    mm_test = np.nan_to_num(mm_test, nan=0.0)

    p_clim_test, mm_clim_test = _climatology_baseline(X_test)

    occurrence: dict[str, Any] = {
        "ml": evaluate_occurrence(y_test_mm, p_test, threshold),
        # Secondary view at the conventional 0.5 cut so the threshold choice
        # (max-F1 on validation) is auditable against a fixed operating point.
        "ml_at_prob_0p5": evaluate_occurrence(y_test_mm, p_test, 0.5),
        "baseline_climatology": evaluate_occurrence(y_test_mm, p_clim_test, threshold),
    }
    # The raw NWP forecast has no probability — classify by amount threshold.
    occurrence["nwp_raw"] = evaluate_occurrence(
        y_test_mm,
        np.where(np.isfinite(nwp_mm), (nwp_mm >= C.RAIN_THRESHOLD_MM).astype(float), np.nan),
        threshold=0.5,
    )

    amounts = {
        "ml": M.regression_metrics(y_test_mm, mm_test),
        "nwp_raw": M.regression_metrics(y_test_mm, nwp_mm),
        "baseline_climatology": M.regression_metrics(y_test_mm, mm_clim_test),
    }
    amounts["ml"]["mae_skill_vs_climatology"] = M.skill_score(
        amounts["ml"]["mae"], amounts["baseline_climatology"]["mae"]
    )
    amounts["ml"]["mae_skill_vs_nwp"] = M.skill_score(
        amounts["ml"]["mae"], amounts["nwp_raw"]["mae"]
    )
    amounts["nwp_raw"]["mae_skill_vs_climatology"] = M.skill_score(
        amounts["nwp_raw"]["mae"], amounts["baseline_climatology"]["mae"]
    )

    test_widths = _season_widths(
        test["season"].astype(str).to_numpy(), conformal_q, conformal_q["q80"]
    )
    intervals = M.conformal_metrics(
        y_test_mm, mm_test - test_widths, mm_test + test_widths
    )
    overunder = M.overunder_report(y_test_mm, mm_test)

    # ---------------- breakdowns ---------------- #
    def breakdown(col: str) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key in sorted(test[col].unique()):
            mask = (test[col] == key).to_numpy()
            out[str(key)] = {
                "amount": M.regression_metrics(y_test_mm[mask], mm_test[mask]),
                "nwp_amount": M.regression_metrics(y_test_mm[mask], nwp_mm[mask]),
                "occurrence": evaluate_occurrence(y_test_mm[mask], p_test[mask], threshold),
                "n": int(mask.sum()),
            }
        return out

    metrics = {
        "lead_days": lead,
        "n_rows": {
            "train": int(len(train)),
            "val_select": int(len(val_select)),
            "val_calibrate": int(len(val_cal)),
            "test": int(len(test)),
        },
        "selection": {
            "criterion_occurrence": "Brier score on validation (lower=better)",
            "criterion_amount": "MAE on validation (lower=better)",
            "classifier_val_brier": {k: float(v) for k, v in clf_scores.items()},
            "regressor_val_mae": {k: float(v) for k, v in reg_scores.items()},
            "selected_classifier": best_clf_name,
            "selected_regressor": best_reg_name,
            "probability_threshold": threshold,
            "calibration": "isotonic on held-out validation slice" if calibrator else "none",
        },
        "test_occurrence": occurrence,
        "test_amount": amounts,
        "test_intervals": {
            **intervals,
            "alpha": conformal_alpha,
            "half_widths_mm": {k: float(v) for k, v in conformal_q.items()},
            "note": (
                "Conformal residuals from the whole validation window; "
                "season-stratified half-width where a season has ≥40 residuals."
            ),
        },
        "test_overunder": overunder,
        "test_by_location": breakdown("location_id"),
        "test_by_season": breakdown("season"),
        "test_period": {
            "start": str(test["date"].min()),
            "end": str(test["date"].max()),
        },
    }

    bundle = {
        "lead": lead,
        "classifier_name": best_clf_name,
        "classifier": classifiers[best_clf_name],
        "regressor_name": best_reg_name,
        "regressor": (
            None if best_reg_name == "baseline_climatology" else regressors[best_reg_name]
        ),
        "calibrator": calibrator,
        "conformal_q": {k: float(v) for k, v in conformal_q.items()},
        "conformal_alpha": conformal_alpha,
        "smear_factor": float(smear_factor),
        "probability_threshold": threshold,
        "rain_threshold_mm": C.RAIN_THRESHOLD_MM,
        "feature_columns": list(FEATURE_COLUMNS),
        "val_brier": float(clf_scores[best_clf_name]),
        "val_mae": float(reg_scores[best_reg_name]),
    }
    return bundle, metrics


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def run(leads: tuple[int, ...], refresh: bool = False) -> dict[str, Any]:
    started = time.time()
    per_lead: dict[str, Any] = {}
    bundles: dict[str, Any] = {}

    for lead in leads:
        print(f"[train] lead={lead}d — building dataset …", flush=True)
        df = D.build_lead_dataset(lead, refresh=refresh)
        print(
            f"[train] lead={lead}d — {len(df)} rows "
            f"({df['split'].value_counts().to_dict()})",
            flush=True,
        )
        bundle, metrics = train_lead(lead, df)
        per_lead[str(lead)] = metrics
        bundles[str(lead)] = bundle
        print(
            f"[train] lead={lead}d — selected classifier={bundle['classifier_name']} "
            f"(val Brier {bundle['val_brier']:.4f}), regressor={bundle['regressor_name']} "
            f"(val MAE {bundle['val_mae']:.3f})",
            flush=True,
        )

    # Aggregate cross-lead summary (test window, identical rows per lead).
    summary: dict[str, Any] = {}
    for lead_str, m in per_lead.items():
        summary[lead_str] = {
            "ml_mae": m["test_amount"]["ml"]["mae"],
            "nwp_mae": m["test_amount"]["nwp_raw"]["mae"],
            "climatology_mae": m["test_amount"]["baseline_climatology"]["mae"],
            "ml_f1": m["test_occurrence"]["ml"]["f1"],
            "nwp_f1": m["test_occurrence"]["nwp_raw"]["f1"],
            "climatology_f1": m["test_occurrence"]["baseline_climatology"]["f1"],
            "ml_brier": m["test_occurrence"]["ml"]["brier"],
            "climatology_brier": m["test_occurrence"]["baseline_climatology"]["brier"],
            "ml_interval_coverage": m["test_intervals"]["coverage"],
        }

    from .features import climatology_lookup

    clim = {
        loc_id: frame.reset_index().to_dict(orient="list")
        for loc_id, frame in climatology_lookup().items()
    }

    artifacts_dir = Path(C.ARTIFACTS_DIR)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    bundle_payload = {
        "leads": bundles,
        "climatology": clim,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "rain_threshold_mm": C.RAIN_THRESHOLD_MM,
            "leads": list(C.LEADS),
            "training_locations": [
                {"id": l.id, "name": l.name, "latitude": l.latitude, "longitude": l.longitude}
                for l in C.TRAINING_LOCATIONS
            ],
            "climatology_period": [C.CLIMATOLOGY_START, C.CLIMATOLOGY_END],
            "forecast_archive_start": C.FORECAST_START,
            "splits": {
                "train_end": C.SPLIT_TRAIN_END,
                "val_end": C.SPLIT_VAL_END,
                "test_start": (pd.Timestamp(C.SPLIT_VAL_END) + pd.Timedelta(days=1)).strftime(
                    "%Y-%m-%d"
                ),
            },
            "era5_latency_days": C.ERA5_LATENCY_DAYS,
            "seed": SEED,
            "feature_columns": list(FEATURE_COLUMNS),
        },
        "versions": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "sklearn": __import__("sklearn").__version__,
            "xgboost": __import__("xgboost").__version__,
        },
    }
    joblib.dump(bundle_payload, artifacts_dir / "model_bundle.joblib", compress=3)

    metrics_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "training_seconds": round(time.time() - started, 1),
        "notes": [
            "Observation reference = Open-Meteo Historical Weather API (ERA5/ERA5-Land "
            "reanalysis grid ~0.25°/25 km), NOT rain-gauge readings.",
            "Archived forecasts = Open-Meteo Previous Runs API (global NWP model blend at "
            "fixed lead offsets), NOT IMD products.",
            "IMD forecasts are evaluated separately by the verification engine when an IMD "
            "API key is configured; no IMD results are reported without real IMD data.",
            "Splits are chronological; probability calibration uses a held-out validation "
            "slice and conformal intervals are calibrated on the full validation window "
            "(never on train or test). Coverage is reported as measured.",
        ],
        "summary_by_lead": summary,
        "per_lead": per_lead,
    }
    (artifacts_dir / "metrics.json").write_text(
        json.dumps(metrics_payload, indent=2, default=str), encoding="utf-8"
    )
    print(f"[train] wrote artifacts to {artifacts_dir} in {round(time.time() - started, 1)}s")
    return metrics_payload


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Train Mausam Sense rainfall models")
    parser.add_argument("--leads", type=int, nargs="*", default=list(C.LEADS))
    parser.add_argument("--refresh", action="store_true", help="ignore HTTP cache")
    args = parser.parse_args(argv)
    run(tuple(args.leads), refresh=args.refresh)


if __name__ == "__main__":
    main()
