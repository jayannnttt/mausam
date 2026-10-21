"""Forecast verification engine.

Compares rainfall forecasts against observed rainfall for the **same
location, same local calendar day and same units**:

===========================  ==================================================
Source                       What it is
===========================  ==================================================
``observed``                 Reanalysis reference (ERA5 grid, ~25 km) — the
                             reference used by this engine, explicitly NOT a
                             rain gauge reading.
``ml``                       Hindcast of the locally trained Mausam Sense
                             model, rebuilt from the *archived* forecast run
                             of that lead time (no leakage — features are the
                             ones available at issue time).
``nwp_raw``                  Open-Meteo Previous Runs archive — a global NWP
                             model at a fixed lead offset. NOT an IMD product.
``climatology``              Day-of-year climatology baseline.
``imd``                      Official IMD forecast — only when an IMD API key
                             is configured; otherwise reported unavailable
                             with the exact reason (never invented).
===========================  ==================================================

Every source is scored on the **identical aligned rows**: ``align_*`` drops any
row where a required input is missing, so sources are compared fairly.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from . import config as C
from . import features as F
from . import inference as I
from . import metrics as M
from . import preprocess as P
from . import sources

# --------------------------------------------------------------------------- #
# Unit handling and alignment (pure functions — unit tested)
# --------------------------------------------------------------------------- #

UNIT_TO_MM: dict[str, float] = {
    "mm": 1.0,
    "millimeter": 1.0,
    "millimetre": 1.0,
    "cm": 10.0,
    "centimeter": 10.0,
    "in": 25.4,
    "inch": 25.4,
    "inches": 25.4,
}


def to_mm(values: Any, unit: str) -> np.ndarray:
    """Convert rainfall depth to millimetres (unknown units raise)."""
    u = str(unit).strip().lower()
    if u not in UNIT_TO_MM:
        raise ValueError(f"Unsupported rainfall unit: {unit!r}")
    return np.asarray(values, dtype=float) * UNIT_TO_MM[u]


def align_forecast_observation(
    observed: pd.Series,
    forecast: pd.Series,
    *,
    observed_unit: str = "mm",
    forecast_unit: str = "mm",
    how: str = "inner",
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Align forecasts with observations on local calendar date.

    * Both series must be daily values indexed by (local) date.
    * Units are converted to mm before comparison — a mismatch is converted,
      never silently ignored.
    * Rows missing on either side are dropped and counted.
    """
    obs_mm = pd.Series(
        to_mm(observed.to_numpy(dtype=float), observed_unit),
        index=pd.DatetimeIndex(pd.to_datetime(observed.index)),
        name="observed_mm",
    )
    fc_mm = pd.Series(
        to_mm(forecast.to_numpy(dtype=float), forecast_unit),
        index=pd.DatetimeIndex(pd.to_datetime(forecast.index)),
        name="forecast_mm",
    )
    joined = pd.concat([obs_mm, fc_mm], axis=1, join=how)
    stats = {
        "observed_dates": int(len(obs_mm)),
        "forecast_dates": int(len(fc_mm)),
        "dropped_missing_observed": int(joined["observed_mm"].isna().sum()),
        "dropped_missing_forecast": int(joined["forecast_mm"].isna().sum()),
        "forecast_unit_in": forecast_unit,
        "observed_unit_in": observed_unit,
    }
    clean = joined.dropna(how="any").sort_index()
    stats["aligned_dates"] = int(len(clean))
    return clean, stats


def score_aligned(
    aligned: pd.DataFrame,
    *,
    probabilities: pd.Series | None = None,
    rain_threshold_mm: float = C.RAIN_THRESHOLD_MM,
    prob_threshold: float = 0.5,
) -> dict[str, Any]:
    """Score one source's aligned daily amounts (mm) against observations."""
    if aligned.empty:
        return {"available": False, "reason": "no aligned rows", "n": 0}
    obs = aligned["observed_mm"].to_numpy(dtype=float)
    fc = aligned["forecast_mm"].to_numpy(dtype=float)
    out: dict[str, Any] = {
        "available": True,
        "n": int(len(aligned)),
        "amount": M.regression_metrics(obs, fc),
        "overunder": M.overunder_report(obs, fc),
    }
    if probabilities is not None:
        p = probabilities.reindex(aligned.index).to_numpy(dtype=float)
        out["occurrence"] = M.rain_classification_metrics(
            obs, p, rain_threshold_mm=rain_threshold_mm, prob_threshold=prob_threshold
        )
    else:
        # Deterministic forecast: classify by its own amount threshold.
        out["occurrence"] = M.rain_classification_metrics(
            obs,
            (fc >= rain_threshold_mm).astype(float),
            rain_threshold_mm=rain_threshold_mm,
            prob_threshold=0.5,
        )
    return out


def breakdown(
    aligned: pd.DataFrame,
    labels: pd.Series,
    *,
    probabilities: pd.Series | None = None,
) -> dict[str, Any]:
    """Score within sub-groups (season, location, …)."""
    out: dict[str, Any] = {}
    labels = labels.reindex(aligned.index)
    for key in sorted(pd.unique(labels.dropna())):
        mask = (labels == key).to_numpy()
        sub = aligned.loc[mask]
        p = probabilities.loc[sub.index] if probabilities is not None else None
        out[str(key)] = score_aligned(sub, probabilities=p)
    return out


# --------------------------------------------------------------------------- #
# Window role — is this window independent of model training?
# --------------------------------------------------------------------------- #


def window_role(start: pd.Timestamp, end: pd.Timestamp) -> dict[str, Any]:
    """Classify a verification window w.r.t. the chronological splits."""
    train_end = pd.Timestamp(C.SPLIT_TRAIN_END)
    val_end = pd.Timestamp(C.SPLIT_VAL_END)
    if end <= train_end:
        role = "train"
    elif end <= val_end:
        role = "val" if start > train_end else "train+val"
    elif start > val_end:
        role = "test"
    else:
        role = "val+test"
    return {
        "role": role,
        "independent_test": bool(start > val_end),
        "train_end": str(train_end.date()),
        "val_end": str(val_end.date()),
        "note": (
            "Window lies entirely after the validation window → metrics are independent of "
            "model fitting."
            if start > val_end
            else "Window overlaps model training/validation data — treat metrics as "
            "in-sample, not as independent evidence."
        ),
    }


# --------------------------------------------------------------------------- #
# Single-location verification
# --------------------------------------------------------------------------- #


def _load_context(latitude: float, longitude: float, refresh: bool = False):
    """Bundle + climatology + (ad-hoc) location for a coordinate."""
    bundle = I.load_bundle()
    loc = I._adhoc_location(latitude, longitude)
    clim, clim_meta = I._climatology(latitude, longitude, bundle)
    return bundle, loc, clim, clim_meta


def verify_location(
    *,
    latitude: float,
    longitude: float,
    start: str,
    end: str,
    lead: int,
    location_label: str | None = None,
    refresh: bool = False,
    imd_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Verify all sources for one coordinate over ``[start, end]`` at ``lead``."""
    if lead not in C.LEADS:
        raise ValueError(f"lead must be one of {list(C.LEADS)}")

    start_ts, end_ts = pd.Timestamp(start), pd.Timestamp(end)
    if end_ts < start_ts:
        raise ValueError("end date must not be before start date")
    if (end_ts - start_ts).days > 400:
        raise ValueError("date range too large (max 400 days)")

    bundle, loc, clim, clim_meta = _load_context(latitude, longitude, refresh)

    # ---- observations (reference) ---- #
    obs_raw = sources.fetch_obs_daily(
        loc, start_ts.strftime("%Y-%m-%d"), end_ts.strftime("%Y-%m-%d"), refresh=refresh
    )
    obs = P.prepare_obs(obs_raw)
    obs_series = obs["obs_precip_mm"]

    # ---- archived NWP forecast at the requested lead ---- #
    fc_hourly = sources.fetch_prev_runs_hourly(
        loc,
        start_ts.strftime("%Y-%m-%d"),
        end_ts.strftime("%Y-%m-%d"),
        leads=(lead,),
        refresh=refresh,
    )
    fc_daily = P.aggregate_prev_runs_daily(fc_hourly).get(lead, pd.DataFrame())
    fc_series = (
        fc_daily[f"fc{lead}_precip_mm"] if not fc_daily.empty else pd.Series(dtype=float)
    )

    aligned, align_stats = align_forecast_observation(obs_series, fc_series)

    # ---- ML hindcast on the very same rows ---- #
    ml_prob = pd.Series(dtype=float)
    ml_amount = pd.Series(dtype=float)
    model_info: dict[str, Any] = {"available": False}
    if str(lead) in bundle.get("leads", {}) and not fc_daily.empty:
        lb = bundle["leads"][str(lead)]
        dates = aligned.index.intersection(fc_daily.index)
        if len(dates):
            X = F.build_feature_frame(
                obs=obs,
                fc_daily=fc_daily,
                clim=clim,
                lead=lead,
                latitude=latitude,
                longitude=longitude,
                elevation_m=float(obs["elevation_m"].iloc[-1]),
                dates=dates,
            )[lb["feature_columns"]]
            ml_prob = pd.Series(
                {d: I._classify_probability(lb, X.loc[[d]]) for d in dates}, name="ml_prob"
            )
            ml_amount = pd.Series(
                {d: I._amount_prediction(lb, X.loc[[d]])[0] for d in dates},
                name="ml_amount",
            )
            model_info = {
                "available": True,
                "classifier": lb["classifier_name"],
                "regressor": lb["regressor_name"],
                "probability_threshold": lb["probability_threshold"],
                "rain_threshold_mm": lb["rain_threshold_mm"],
                "calibrated": lb.get("calibrator") is not None,
            }
            # Fair comparison: every source is scored on the SAME rows.
            aligned = aligned.loc[dates]

    # ---- climatology baseline on the same rows ---- #
    clim_dates = aligned.index
    doy = clim_dates.dayofyear.to_numpy()
    doy = np.where(doy > 365, 365, doy)
    clim_idx = pd.Index(doy)
    clim_amount = pd.Series(
        clim.loc[clim_idx, "clim_mm"].to_numpy(), index=clim_dates, name="clim_amount"
    )
    clim_prob = pd.Series(
        clim.loc[clim_idx, "clim_freq"].to_numpy(), index=clim_dates, name="clim_prob"
    )

    # ---- scores on identical rows ---- #
    # Every source is scored on the SAME dates, but each source must supply its
    # OWN forecast amounts — scoring climatology/ML against the NWP column
    # would silently compare the wrong series.
    scores: dict[str, Any] = {}

    # Common rows: NWP-aligned rows ∩ ML hindcast rows (when the model ran).
    common_index = aligned.index
    if model_info["available"] and len(ml_amount):
        common_index = common_index.intersection(ml_amount.index)
    common_index = common_index.intersection(clim_amount.index)
    rows = len(common_index)

    scores["observed_reference"] = {
        "available": True,
        "kind": "reanalysis grid (ERA5), ~0.25°/25 km — not a rain gauge",
        "n": rows,
        "mean_mm": (
            float(aligned["observed_mm"].reindex(common_index).mean())
            if rows
            else float("nan")
        ),
    }

    def _frame_for(amounts: pd.Series) -> pd.DataFrame:
        """observed vs one source's own amounts on the common rows (mm)."""
        obs_col = aligned["observed_mm"].reindex(common_index)
        fc_col = pd.Series(
            amounts.reindex(common_index).to_numpy(dtype=float), index=common_index
        )
        return pd.DataFrame({"observed_mm": obs_col, "forecast_mm": fc_col})

    # Use the model's stored operating point (chosen on validation) rather than
    # an arbitrary cut so verification matches how the model is deployed.
    ml_threshold = float(
        bundle.get("leads", {}).get(str(lead), {}).get("probability_threshold", 0.5)
    )
    nwp_amounts = aligned["forecast_mm"]

    scores["nwp_raw"] = score_aligned(_frame_for(nwp_amounts))
    scores["climatology"] = score_aligned(
        _frame_for(clim_amount),
        probabilities=clim_prob.reindex(common_index),
        prob_threshold=ml_threshold,
    )
    if model_info["available"] and len(ml_amount):
        scores["ml"] = score_aligned(
            _frame_for(ml_amount),
            probabilities=ml_prob.reindex(common_index),
            prob_threshold=ml_threshold,
        )
        scores["ml"]["model"] = model_info
    else:
        scores["ml"] = {
            "available": False,
            "reason": f"No trained model for lead {lead} or no archived forecast rows.",
        }

    # ---- IMD (only with a configured key) ---- #
    scores["imd"] = imd_result or {
        "available": False,
        "reason": "IMD source not requested for this verification run.",
    }

    # ---- relative skill of ML vs references (same rows) ---- #
    skill: dict[str, float] = {}
    if scores["ml"].get("available") and scores["nwp_raw"].get("available"):
        skill["mae_skill_vs_nwp"] = M.skill_score(
            scores["ml"]["amount"]["mae"], scores["nwp_raw"]["amount"]["mae"]
        )
        skill["mae_skill_vs_climatology"] = M.skill_score(
            scores["ml"]["amount"]["mae"], scores["climatology"]["amount"]["mae"]
        )
        skill["brier_skill_vs_climatology"] = M.skill_score(
            scores["ml"]["occurrence"]["brier"], scores["climatology"]["occurrence"]["brier"]
        )

    seasons = pd.Series(
        {d: F.season_of(d) for d in common_index}, name="season"
    )
    months = pd.Series({d: int(d.month) for d in common_index}, name="month")

    def _score_groups(labels: pd.Series) -> dict[str, Any]:
        """Per-group blocks in the shape the dashboard consumes:
        ``amount`` = ML amount metrics, ``nwp_amount`` = raw NWP amounts,
        ``clim_amount`` = climatology amounts, ``occurrence`` = ML occurrence
        at the deployed probability threshold. Every group scores all sources
        on the same rows (``common_index`` by construction).
        """
        out: dict[str, Any] = {}
        for key in sorted(pd.unique(labels.dropna())):
            mask = (labels == key).to_numpy()
            idx = common_index[mask]
            obs_g = aligned["observed_mm"].reindex(idx).to_numpy(dtype=float)
            nwp_g = nwp_amounts.reindex(idx).to_numpy(dtype=float)
            clim_g = clim_amount.reindex(idx).to_numpy(dtype=float)
            block: dict[str, Any] = {
                "n": int(mask.sum()),
                "amount": None,
                "nwp_amount": M.regression_metrics(obs_g, nwp_g),
                "clim_amount": M.regression_metrics(obs_g, clim_g),
                "occurrence": None,
            }
            if model_info["available"] and len(ml_amount):
                ml_g = ml_amount.reindex(idx).to_numpy(dtype=float)
                block["amount"] = M.regression_metrics(obs_g, ml_g)
                block["occurrence"] = M.rain_classification_metrics(
                    obs_g,
                    ml_prob.reindex(idx).to_numpy(dtype=float),
                    rain_threshold_mm=C.RAIN_THRESHOLD_MM,
                    prob_threshold=ml_threshold,
                )
            out[str(key)] = block
        return out

    has_groups = bool(len(common_index))
    by_season = _score_groups(seasons) if has_groups else {}
    by_month = _score_groups(months) if has_groups else {}

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude,
            "label": location_label or loc.id,
            "elevation_m": float(obs["elevation_m"].iloc[-1]),
            "grid_resolution": "~0.25° (~25 km) reanalysis/forecast grid — grid-cell values, "
            "not point measurements",
        },
        "lead_days": lead,
        "window": {
            "start": start_ts.strftime("%Y-%m-%d"),
            "end": end_ts.strftime("%Y-%m-%d"),
            **window_role(start_ts, end_ts),
        },
        "alignment": align_stats,
        "climatology": clim_meta,
        "scores": scores,
        "skill": skill,
        "by_season": by_season,
        "by_month": by_month,
        "series": [
            {
                "date": d.strftime("%Y-%m-%d"),
                "observed_mm": round(float(aligned["observed_mm"].loc[d]), 2),
                "nwp_mm": round(float(aligned["forecast_mm"].loc[d]), 2),
                "ml_mm": (
                    round(float(ml_amount.loc[d]), 2) if d in ml_amount.index else None
                ),
                "ml_prob": (
                    round(float(ml_prob.loc[d]), 4) if d in ml_prob.index else None
                ),
                "clim_mm": round(float(clim_amount.loc[d]), 2),
                "clim_prob": round(float(clim_prob.loc[d]), 4),
                "season": F.season_of(d),
            }
            for d in aligned.index
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# --------------------------------------------------------------------------- #
# Multi-location verification (pooled + per-location)
# --------------------------------------------------------------------------- #


def verify_locations(
    location_ids: list[str],
    *,
    start: str,
    end: str,
    lead: int,
    refresh: bool = False,
) -> dict[str, Any]:
    """Verify the same window/lead across several training locations."""
    known = {loc.id: loc for loc in C.TRAINING_LOCATIONS}
    unknown = [lid for lid in location_ids if lid not in known]
    if unknown:
        raise ValueError(
            f"Unknown location ids: {unknown}. Available: {sorted(known)}"
        )

    per_location: dict[str, Any] = {}
    for lid in location_ids:
        loc = known[lid]
        per_location[lid] = verify_location(
            latitude=loc.latitude,
            longitude=loc.longitude,
            start=start,
            end=end,
            lead=lead,
            location_label=loc.name,
            refresh=refresh,
        )

    # Pooled metrics: concatenate the per-location series and score every
    # source on the identical pooled rows.
    #
    # NOTE: each per-location ``series`` row already holds all sources for the
    # SAME local date (verify_location aligns them), so pooling must NOT
    # re-align by date — locations share calendar dates, which would create
    # duplicate index labels. We align rows positionally instead.
    pooled_scores: dict[str, Any] = {}
    pooled_n = 0
    if per_location:
        bundle = I.load_bundle()
        pooled_ml_threshold = float(
            bundle.get("leads", {}).get(str(lead), {}).get("probability_threshold", 0.5)
        )
        rows: list[dict[str, Any]] = []
        for lid, res in per_location.items():
            for row in res.get("series", []):
                rows.append({**row, "location_id": lid})
        if rows:
            pdf = pd.DataFrame(rows).reset_index(drop=True)
            required = ["observed_mm", "nwp_mm", "clim_mm"]
            if "ml_mm" in pdf.columns and pdf["ml_mm"].notna().any():
                required.append("ml_mm")  # model ran → compare on its rows too
            pdf = pdf.dropna(subset=required).reset_index(drop=True)
            pooled_n = int(len(pdf))

            def _pooled_frame(col: str) -> pd.DataFrame:
                return pd.DataFrame(
                    {
                        "observed_mm": pdf["observed_mm"].to_numpy(dtype=float),
                        "forecast_mm": pdf[col].to_numpy(dtype=float),
                    },
                    index=pd.RangeIndex(pooled_n, name="row"),
                )

            for source, col, prob_col in (
                ("nwp_raw", "nwp_mm", None),
                ("ml", "ml_mm", "ml_prob"),
                ("climatology", "clim_mm", "clim_prob"),
            ):
                if col not in pdf.columns or not pooled_n:
                    continue
                frame = _pooled_frame(col)
                probs = None
                if prob_col and prob_col in pdf.columns:
                    probs = pd.Series(
                        pd.to_numeric(pdf[prob_col], errors="coerce").to_numpy(dtype=float),
                        index=frame.index,
                    )
                pooled_scores[source] = score_aligned(
                    frame,
                    probabilities=probs,
                    prob_threshold=pooled_ml_threshold if probs is not None else 0.5,
                )
            pooled_scores["_pooled_rows"] = pooled_n
            pooled_scores["_pooled_locations"] = sorted(
                {r["location_id"] for r in rows}
            )

    # ---- pooled summary in the SAME shape the single-location route returns,
    # so the dashboard can render either scope without special-casing. ---- #
    scores: dict[str, Any] = {
        "observed_reference": {
            "available": pooled_n > 0,
            "kind": "reanalysis grid (ERA5), ~0.25°/25 km — not a rain gauge",
            "n": pooled_n,
        },
        "nwp_raw": pooled_scores.get("nwp_raw", {"available": False, "reason": "no rows"}),
        "ml": pooled_scores.get(
            "ml", {"available": False, "reason": "no rows / model unavailable"}
        ),
        "climatology": pooled_scores.get(
            "climatology", {"available": False, "reason": "no rows"}
        ),
        "imd": {
            "available": False,
            "source": "India Meteorological Department (IMD)",
            "reason": "IMD verification is skipped for multi-location pooled runs: IMD "
            "forecasts are district-specific (one district id per configured location).",
        },
    }

    skill: dict[str, float] = {}
    if (
        scores["ml"].get("available")
        and scores["nwp_raw"].get("available")
        and scores["climatology"].get("available")
    ):
        skill = {
            "mae_skill_vs_nwp": M.skill_score(
                scores["ml"]["amount"]["mae"], scores["nwp_raw"]["amount"]["mae"]
            ),
            "mae_skill_vs_climatology": M.skill_score(
                scores["ml"]["amount"]["mae"], scores["climatology"]["amount"]["mae"]
            ),
            "brier_skill_vs_climatology": M.skill_score(
                scores["ml"]["occurrence"]["brier"],
                scores["climatology"]["occurrence"]["brier"],
            ),
        }

    pooled_ml_threshold = 0.5
    try:
        pooled_ml_threshold = float(
            I.load_bundle()
            .get("leads", {})
            .get(str(lead), {})
            .get("probability_threshold", 0.5)
        )
    except Exception:  # artifacts oddity — 0.5 is the neutral fallback
        pass

    def _group_scores(frame: pd.DataFrame, group_col: str) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key in sorted(frame[group_col].dropna().unique()):
            sub = frame[frame[group_col] == key]
            obs_g = sub["observed_mm"].to_numpy(dtype=float)
            block: dict[str, Any] = {
                "n": int(len(sub)),
                "amount": None,
                "nwp_amount": M.regression_metrics(
                    obs_g, sub["nwp_mm"].to_numpy(dtype=float)
                ),
                "clim_amount": M.regression_metrics(
                    obs_g, sub["clim_mm"].to_numpy(dtype=float)
                ),
                "occurrence": None,
            }
            if "ml_mm" in sub.columns and sub["ml_mm"].notna().any():
                block["amount"] = M.regression_metrics(
                    obs_g, sub["ml_mm"].to_numpy(dtype=float)
                )
                block["occurrence"] = M.rain_classification_metrics(
                    obs_g,
                    pd.to_numeric(sub["ml_prob"], errors="coerce").to_numpy(dtype=float),
                    rain_threshold_mm=C.RAIN_THRESHOLD_MM,
                    prob_threshold=pooled_ml_threshold,
                )
            out[str(key)] = block
        return out

    # Chart series: daily mean across the pooled locations (scores above are
    # computed on every individual row — the chart is an overview only).
    series_rows: list[dict[str, Any]] = []
    by_season: dict[str, Any] = {}
    by_month: dict[str, Any] = {}
    if pooled_n:
        obs_rows = pd.DataFrame(rows).dropna(subset=required).reset_index(drop=True)
        obs_rows["season"] = [F.season_of(pd.Timestamp(d)) for d in obs_rows["date"]]
        obs_rows["month"] = [pd.Timestamp(d).month for d in obs_rows["date"]]
        by_season = _group_scores(obs_rows, "season")
        by_month = _group_scores(obs_rows, "month")

        for date, grp in obs_rows.groupby("date", sort=True):
            ml_present = grp["ml_mm"].notna()
            series_rows.append(
                {
                    "date": str(pd.Timestamp(date).date()),
                    "observed_mm": round(float(grp["observed_mm"].mean()), 2),
                    "nwp_mm": round(float(grp["nwp_mm"].mean()), 2),
                    "ml_mm": (
                        round(float(grp.loc[ml_present, "ml_mm"].mean()), 2)
                        if ml_present.any()
                        else None
                    ),
                    "ml_prob": (
                        round(float(grp.loc[ml_present, "ml_prob"].mean()), 4)
                        if ml_present.any()
                        else None
                    ),
                    "clim_mm": round(float(grp["clim_mm"].mean()), 2),
                    "clim_prob": round(float(grp["clim_prob"].mean()), 4),
                    "season": F.season_of(pd.Timestamp(date)),
                }
            )

    return {
        "lead_days": lead,
        "window": {
            "start": start,
            "end": end,
            **window_role(pd.Timestamp(start), pd.Timestamp(end)),
        },
        "scope": "pooled_locations",
        "aggregation": (
            f"Scores are computed on every location-day row ({pooled_n} rows across "
            f"{len(per_location)} locations). The daily chart shows the across-location "
            "mean for each date."
            if pooled_n
            else "No aligned rows for this window."
        ),
        "scores": scores,
        "skill": skill,
        "by_season": by_season,
        "by_month": by_month,
        "series": series_rows,
        "locations": per_location,
        "pooled": pooled_scores,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
