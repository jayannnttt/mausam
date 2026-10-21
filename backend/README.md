# Mausam Sense — ML Backend (FastAPI)

Rainfall **prediction** and **forecast-verification** service for the Mausam Sense
dashboard. Training runs **offline** and writes artifacts; the API only loads
saved artifacts at inference time (it never trains on a request).

> **Honesty rules this backend follows**
>
> - The observation reference is **ERA5/ERA5-Land reanalysis grid data**
>   (~0.25° / 25 km) from Open-Meteo's Historical Weather API — it is **not
>   rain-gauge truth** and is never called that.
> - The archived forecasts used as the NWP reference are Open-Meteo
>   **Previous Runs API** outputs (global model blend at fixed lead offsets) —
>   they are **not IMD products** and are never labelled "IMD".
> - **No improvement over IMD is claimed anywhere.** Without an issued IMD API
>   key, IMD comparisons return `available: false` with the reason verbatim;
>   no IMD number is ever invented.
> - Skill against the NWP reference **varies by window and location**; some
>   verification windows show the ML model losing to the NWP archive. The API
>   reports the sign honestly (negative skill included).

---

## 1. Setup

Python ≥ 3.10 (developed and tested on 3.14). From the repository root:

```bash
cd backend
python -m pip install -r requirements.txt
```

No configuration is required — all Open-Meteo sources are keyless. Copy
`.env.example` to `.env` only if you need to change something (python-dotenv
loads it automatically when installed).

## 2. Train (offline, once per model refresh)

```bash
cd backend
python -m ml.train                 # all leads 1..7 (default)
python -m ml.train --leads 1 2     # subset of leads
python -m ml.train --refresh       # ignore the HTTP cache and refetch data
```

- Training data is downloaded from Open-Meteo and cached under `data/cache/`
  (path: `MAUSAM_DATA_DIR`), so re-runs are fast. A warm-cache run takes
  **~2 minutes**.
- Outputs: `artifacts/model_bundle.joblib` (~7.9 MB, compressed) and
  `artifacts/metrics.json` (all evaluation numbers, split definitions, model
  selection and data-provenance notes). **These artifacts are what the API
  serves; committing them lets a fresh deploy run without retraining.**
- The configuration that makes runs reproducible (locations, split dates,
  thresholds, feature windows) lives entirely in `ml/config.py`.

## 3. Run the API

```bash
cd backend
python -m uvicorn app.main:app --port 8000
# health check → http://localhost:8000/api/v1/health
```

If `artifacts/model_bundle.joblib` is missing, endpoints that need the model
return **503 with `model_missing`** and the exact training command to fix it —
they never fall back to fabricated values.

## 4. Tests

```bash
cd backend
python -m pytest tests -q          # 136 passed
```

Coverage: preprocessing/missing values, feature engineering (incl. leakage
guards), chronological-split integrity, forecast–observation alignment (units,
time, location), metric correctness (MAE/RMSE/bias/skill/precision-recall-F1/
Brier/conformal coverage), IMD adapter + category-boundary scoring, inference
artifacts, API validation and error paths (422/503), and the verification
engine including pooled multi-location runs.

---

## 5. API reference

All routes are under `/api/v1`. Validation failures return **422** (FastAPI
default); missing artifacts return **503**.

| Route | Parameters | Purpose |
|---|---|---|
| `GET /health` | — | Service status, `model_ready`, trained leads, `imd_configured` |
| `GET /sources` | — | Data provenance: each source, its role, status and disclosures |
| `GET /locations` | — | The 6 training locations (pooled model's reference set) |
| `GET /predict` | `latitude` (−90..90, required), `longitude` (−180..180, required), `days` (1..10, default 7), `name`, `refresh`, `record` | Per-day rainfall probability, predicted mm, 80% conformal interval, NWP forecast, climatology — for **any exact GPS coordinate** |
| `GET /metrics` | — | Trained-model metrics from `artifacts/metrics.json` |
| `GET /verification` | `start`,`end` (YYYY-MM-DD), `lead` (1..7), **either** `latitude`/`longitude` **or** `locations` (comma-separated ids), `include_imd`, `refresh` | ML vs NWP archive vs climatology vs IMD (when keyed) on identical aligned rows |
| `GET /history` | `limit` (1..200) | Recent predictions recorded by the service (SQLite) |

Example:

```bash
curl "http://localhost:8000/api/v1/predict?latitude=13.0827&longitude=80.2707&days=3"
curl "http://localhost:8000/api/v1/verification?locations=chennai,mumbai&lead=1&start=2026-07-01&end=2026-09-30"
```

`verification` returns `scores` (per source: amount metrics MAE/RMSE/bias,
occurrence metrics precision/recall/F1/Brier, over/under counts, category
accuracy for IMD), `skill` (ML's relative skill, negative when losing),
`by_season` / `by_month` breakdowns, the daily `series`, and a `window` block
stating exactly what period was scored. Each source is scored against **its
own** amounts on the common aligned rows — sources are never mixed. For
multi-location runs the response adds `scope: "pooled_locations"` and an
`aggregation` disclosure; chart series become across-location daily means.

---

## 6. Data sources & provenance

| Role | Source | Key facts |
|---|---|---|
| Observation reference | Open-Meteo **Historical Weather API** (ERA5 / ERA5-Land reanalysis) | ~25 km grid, published with ~5-day latency; **not gauges** |
| NWP forecast reference | Open-Meteo **Previous Runs API** (`*_previous_day1..7`) | Archived since Jan 2024; real archived model forecasts at fixed leads; **not IMD** |
| Live forecast at inference | Open-Meteo **Forecast API** | Keyless; exact GPS coordinates |
| Climatology baseline | Day-of-year means from ERA5, **2015–2023 only** | Ends before the modelling period → no leakage |
| Official IMD forecast | `api.imd.gov.in` | Requires an issued key; **401 without one** → `available:false` + reason |

Licensing: Open-Meteo is free for non-commercial use (CC BY 4.0 attribution
for ERA5-derived data via Copernicus/ECMWF). IMD data, when used under key,
is subject to IMD's terms.

## 7. Modelling design (leakage policy)

- **Chronological splits, never shuffled** (all dates local to the location):
  - train: … → 2025-06-30 (3168 rows/lead)
  - validation — selection: 2025-07-01 → 2025-12-31 (660 rows/lead)
  - validation — calibration: 444 rows/lead (spans the monsoon)
  - test: 2026-01-01 → 2026-10-20 (1758 rows/lead) — **held out until final evaluation**
- **Features are lagged** by `lead + 5 days` (ERA5 publication latency), so
  nothing published after the forecast issue time is ever a feature.
- **Targets** are future observed precipitation over the lead window;
  rain/no-rain uses a **1.0 mm/24 h** threshold (sensitivity to other
  conventions is a documented limitation).
- **Candidates**: logistic regression, random forest, gradient boosting,
  XGBoost, and the day-of-year climatology baseline — selected by
  **validation** Brier (occurrence) and MAE (amount), never by test.
  On the current run RandomForest won both (val Brier 0.115 vs 0.121 LR,
  0.126 XGBoost, 0.154 climatology; val MAE 5.31 vs 5.68 GB, 5.76 XGBoost).
- **Per-lead models** (lead 1..7) over **6 training locations** (Chennai,
  Mumbai, New Delhi, Nagpur, Bengaluru, Kolkata) with lat/lon/elevation
  features, so predictions are location-specific at any coordinate.
- **Probability threshold** = max F1 on the validation-selection slice
  → 0.20 for leads 1–5, 0.25 for leads 6–7. (A threshold tuned on
  validation is *not* a default 0.5 — this is disclosed wherever thresholded
  counts appear.)
- **Uncertainty**: split-conformal 80% intervals from residuals over the
  *full* validation-calibration window, season-stratified (lead 1 half-widths:
  monsoon 8.92 mm, post-monsoon 3.49 mm, winter 0.21 mm, global 5.88 mm).

## 8. Current results (test window 2026-01-01 → 2026-10-20, 1758 rows/lead)

| Lead | ML MAE | NWP MAE | Clim MAE | ML F1 | ML Brier | Clim Brier | Interval coverage |
|---|---|---|---|---|---|---|---|
| 1 | **2.391** | 2.556 | 3.794 | 0.851 | 0.0978 | 0.1297 | 0.912 |
| 2 | **2.605** | 2.854 | 3.794 | 0.852 | 0.1025 | 0.1297 | 0.898 |
| 3 | **2.658** | 2.901 | 3.794 | 0.824 | 0.1172 | 0.1297 | 0.896 |
| 4 | **2.789** | 3.185 | 3.794 | 0.832 | 0.1110 | 0.1297 | 0.898 |
| 5 | **2.859** | 3.167 | 3.794 | 0.827 | 0.1119 | 0.1297 | 0.898 |
| 6 | **2.918** | 3.066 | 3.794 | 0.807 | 0.1303 | 0.1297 | 0.898 |
| 7 | **3.142** | 3.292 | 3.794 | 0.805 | 0.1271 | 0.1297 | 0.890 |

Read exactly what is shown:

- The ML model beats the **NWP archive** and the climatology baseline on MAE
  at all seven leads **on this test window**. Per-location and pooled
  verification windows **can and do** show negative skill against NWP — the
  dashboard shows that sign when it occurs.
- **Nothing here is compared to IMD.** IMD scoring requires a key; without
  one the reason is shown verbatim.
- **Coverage is reported as measured**: 0.89–0.91 against a nominal 0.80 —
  the intervals are conservative (over-covering), not calibrated to exactly 80%.
- **Bias is negative** (underprediction): −1.12 mm mean error at lead 1
  (observed mean 3.93 mm vs predicted 2.81 mm), −0.67 mm at lead 7. This is a
  known, disclosed tendency, not hidden by MAE alone.

## 9. Environment variables

Set in the process environment or `backend/.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins — set to your Vercel URL in production |
| `IMD_API_KEY` | *(empty)* | Enables real IMD comparisons; without it they report unavailable |
| `IMD_DISTRICT_ID` | *(empty)* | IMD district id (IMD identifies districts by id, not name) |
| `IMD_BASE_URL` | `https://api.imd.gov.in/api/v1` | Override for testing |
| `MAUSAM_DATA_DIR` | `./data` | HTTP cache + history database location |
| `MAUSAM_ARTIFACTS_DIR` | `./artifacts` | Where the model bundle and metrics live |
| `MAUSAM_HISTORY_DB` | `./data/history.sqlite3` | Prediction history database |
| `MAUSAM_HISTORY_MAX_ROWS` | `500` | History table cap |

**No secrets are ever shipped to the frontend.** The IMD key stays on this
service; the browser only calls this API (read-only) via `VITE_ML_API_BASE`.

## 10. Deployment (Vercel frontend + separate API host)

The site is static (Vite) and deploys to Vercel as before. The backend is a
**separate deployment**:

1. Host the FastAPI app anywhere that runs Python (Render/Railway/Fly/Cloud Run
   a VPS: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`).
2. Include `backend/artifacts/` in the deployment (or run `python -m ml.train`
   in a build step).
3. Set `CORS_ORIGINS=https://your-app.vercel.app` on the API.
4. Set `VITE_ML_API_BASE=https://your-api.example.com` in Vercel's project
   environment variables (defaults to `http://localhost:8000` for local dev).

Without a reachable backend the dashboard's Rainfall Intelligence panel shows
its **unavailable state with the reason** — the rest of the app keeps working.

## 11. Limitations & assumptions

1. **Grid, not gauges.** Observations are ~25 km reanalysis cells; point-scale
   rain (especially convective) can differ sharply from any grid cell.
2. **Reference forecast ≠ IMD.** Archived NWP from Open-Meteo is a global
   model blend; IMD's own guidance is only evaluated when a key is issued.
3. **Archive depth.** Archived forecasts start 2024-01-01 and reanalysis has
   ~5-day latency, so verification windows end ~3 days before "today".
4. **Single rain threshold.** 1.0 mm/24 h; other conventions (2.5 mm) would
   change occurrence metrics.
5. **Conservative intervals** (coverage above nominal) and **negative bias**
   (underprediction) — both reported as measured, not corrected post-hoc.
6. **Threshold-tuned counts.** Occurrence metrics use thresholds selected on
   validation (0.20–0.25), which is disclosed rather than presented as a
   universal default.
7. **Verification can show ML losing.** That is reported with the real sign;
   no marketing rewrite of the numbers.

## 12. Reproducing everything

```bash
cd backend
python -m pip install -r requirements.txt
python -m ml.train                # writes artifacts/ (≈2 min warm cache)
python -m pytest tests -q         # 136 passed
python -m uvicorn app.main:app --port 8000
```

`artifacts/metrics.json` records the generation timestamp, split boundaries,
per-lead results, model selection and the provenance notes shown above, so any
claim can be traced back to a number in that file.
