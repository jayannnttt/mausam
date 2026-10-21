/**
 * ML backend client — talks to the FastAPI service (backend/).
 *
 * The frontend never contains model logic or secrets: it only requests
 * predictions/verification and renders what the service returns, with full
 * provenance. If the service is unreachable (it is a separate deployment
 * from the static Vercel site) the UI shows an explicit "ML backend not
 * reachable" state — never fabricated numbers.
 *
 * Configuration: VITE_ML_API_BASE (default http://localhost:8000).
 */

const rawBase =
  (import.meta.env.VITE_ML_API_BASE as string | undefined) ??
  (import.meta.env.PROD ? "" : "http://localhost:8000");
export const ML_API_BASE = rawBase.replace(/\/+$/, "");

export type MlErrorKind =
  | "unreachable"
  | "model_missing"
  | "upstream"
  | "bad_request"
  | "http"
  | "timeout";

export class MlApiError extends Error {
  constructor(
    public kind: MlErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "MlApiError";
  }
}

/** Human-readable guidance for each failure mode (shown in the UI). */
export function describeMlError(e: unknown): string {
  if (e instanceof MlApiError) {
    switch (e.kind) {
      case "unreachable":
        return `The ML backend at ${ML_API_BASE} could not be reached. Start it locally (cd backend && uvicorn app.main:app --port 8000) or set VITE_ML_API_BASE to the deployed API. ${e.message}`;
      case "model_missing":
        return `${e.message} (Train once with: cd backend && python -m ml.train)`;
      case "timeout":
        return `The ML backend did not respond in time — it may still be downloading data for this location. Try again. ${e.message}`;
      case "upstream":
        return `A weather data provider returned an error: ${e.message}`;
      case "bad_request":
        return `The request was rejected: ${e.message}`;
      default:
        return e.message;
    }
  }
  if (e instanceof Error) return e.message;
  return "Unexpected error while contacting the ML backend.";
}

interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${ML_API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    if (opts.signal?.aborted) throw new MlApiError("timeout", "Request cancelled.");
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new MlApiError("timeout", `No response from ${url} within the time limit.`);
    }
    throw new MlApiError("unreachable", "Network error while calling the ML backend.");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep status text */
    }
    if (res.status === 503) throw new MlApiError("model_missing", detail, 503);
    if (res.status === 502) throw new MlApiError("upstream", detail, 502);
    if (res.status >= 400 && res.status < 500) throw new MlApiError("bad_request", detail, res.status);
    throw new MlApiError("http", detail, res.status);
  }
  return (await res.json()) as T;
}

// --------------------------------------------------------------------------- #
// Response types (subset used by the dashboard)
// --------------------------------------------------------------------------- #

export interface MlHealth {
  status: string;
  service?: string;
  version?: string;
  model_ready: boolean;
  trained_at?: string | null;
  trained_leads?: number[];
  imd_configured?: boolean;
  imd_district_configured?: boolean;
  error?: string;
  checked_at?: string;
}

export interface SourceInfo {
  key: string;
  name: string;
  detail: string;
  url?: string | null;
  status: string;
}

export interface SourcesResponse {
  service: string;
  retrieved_at: string;
  sources: SourceInfo[];
  disclosures: string[];
}

export interface DayPrediction {
  date: string;
  lead_days: number;
  weekday?: string;
  model_available: boolean;
  reason?: string;
  probability_rain?: number;
  predicted_rain?: boolean;
  rain_threshold_mm?: number;
  probability_threshold?: number;
  amount_mm?: number;
  amount_interval_mm?: [number, number];
  amount_interval_level?: number;
  expected_mm?: number;
  nwp_forecast_mm: number | null;
  climatology_mm: number | null;
  climatology_prob: number | null;
}

export interface PredictResponse {
  location: {
    latitude: number;
    longitude: number;
    name?: string | null;
    elevation_m?: number | null;
    timezone?: string | null;
    grid_resolution: string;
  };
  issued_at: string;
  local_date: string;
  horizon_days: number;
  model: {
    trained_at?: string;
    trained_leads?: number[];
    selected_classifier?: Record<string, string>;
    selected_regressor?: Record<string, string>;
    rain_threshold_mm?: number;
    training_locations?: string[];
    splits?: Record<string, string>;
  };
  days: DayPrediction[];
  sources: Record<string, string>;
  climatology: Record<string, unknown>;
  notes: string[];
}

export interface AmountMetrics {
  mae: number;
  rmse: number;
  bias: number;
  median_ae: number;
  n_samples: number;
  obs_mean_mm?: number;
  pred_mean_mm?: number;
  mae_skill_vs_climatology?: number;
  mae_skill_vs_nwp?: number;
}

export interface OccurrenceMetrics {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  brier: number;
  roc_auc: number;
  n_samples: number;
  rain_frequency?: number;
}

export interface MetricBlock {
  available?: boolean;
  reason?: string;
  kind?: string;
  n?: number;
  amount?: AmountMetrics;
  nwp_amount?: AmountMetrics;
  clim_amount?: AmountMetrics;
  occurrence?: OccurrenceMetrics;
  overunder?: Record<string, number>;
  model?: Record<string, unknown>;
  category?: {
    n: number;
    exact_accuracy: number;
    within_one_class_accuracy: number;
    confusion: Record<string, number>;
    note: string;
  };
  /** IMD block only: dates where forecast and observation both existed. */
  matched_dates?: number;
  amount_reason?: string;
  source?: string;
}

export interface SeriesRow {
  date: string;
  observed_mm: number;
  nwp_mm: number;
  ml_mm: number | null;
  ml_prob: number | null;
  clim_mm: number;
  clim_prob: number;
  season: string;
}

export interface VerificationResult {
  /** Absent on pooled (multi-location) runs — see ``scope``. */
  location?: {
    latitude: number;
    longitude: number;
    label: string;
    elevation_m?: number;
    grid_resolution: string;
  };
  scope?: "pooled_locations";
  /** Human-readable note about how a pooled run aggregates rows. */
  aggregation?: string;
  lead_days: number;
  window: {
    start: string;
    end: string;
    role: string;
    independent_test: boolean;
    train_end: string;
    val_end: string;
    note: string;
  };
  alignment?: Record<string, number | string>;
  climatology?: Record<string, unknown>;
  scores: {
    observed_reference?: Record<string, unknown>;
    nwp_raw?: MetricBlock;
    ml?: MetricBlock;
    climatology?: MetricBlock;
    imd?: MetricBlock;
  };
  skill: Record<string, number>;
  by_season?: Record<string, MetricBlock>;
  by_month?: Record<string, MetricBlock>;
  series: SeriesRow[];
  generated_at: string;
  imd_note?: string;
  /** Present only on pooled runs (per-location detail + pooled blocks). */
  locations?: Record<string, unknown>;
  pooled?: Record<string, unknown>;
}

export interface LeadSummary {
  ml_mae: number;
  nwp_mae: number;
  climatology_mae: number;
  ml_f1: number;
  nwp_f1: number;
  climatology_f1: number;
  ml_brier: number;
  climatology_brier: number;
  ml_interval_coverage?: number;
}

export interface ModelMetricsResponse {
  generated_at: string;
  training_seconds?: number;
  notes: string[];
  summary_by_lead: Record<string, LeadSummary>;
  per_lead: Record<string, Record<string, unknown>>;
  disclaimer?: string;
}

// --------------------------------------------------------------------------- #
// Endpoints
// --------------------------------------------------------------------------- #

export function fetchHealth(signal?: AbortSignal): Promise<MlHealth> {
  return request<MlHealth>("/api/v1/health", { timeoutMs: 8_000, signal });
}

export function fetchSources(signal?: AbortSignal): Promise<SourcesResponse> {
  return request<SourcesResponse>("/api/v1/sources", { timeoutMs: 8_000, signal });
}

export function fetchModelMetrics(signal?: AbortSignal): Promise<ModelMetricsResponse> {
  return request<ModelMetricsResponse>("/api/v1/metrics", { timeoutMs: 15_000, signal });
}

export function predictRainfall(
  params: { latitude: number; longitude: number; days?: number; name?: string | null },
  signal?: AbortSignal,
): Promise<PredictResponse> {
  const q = new URLSearchParams({
    latitude: params.latitude.toFixed(5),
    longitude: params.longitude.toFixed(5),
    days: String(params.days ?? 7),
  });
  if (params.name) q.set("name", params.name);
  return request<PredictResponse>(`/api/v1/predict?${q.toString()}`, {
    timeoutMs: 45_000,
    signal,
  });
}

export interface VerificationParams {
  latitude?: number;
  longitude?: number;
  locations?: string;
  start?: string;
  end?: string;
  lead?: number;
  includeImd?: boolean;
}

export function fetchVerification(
  params: VerificationParams,
  signal?: AbortSignal,
): Promise<VerificationResult> {
  const q = new URLSearchParams();
  if (params.locations) q.set("locations", params.locations);
  if (params.latitude !== undefined) q.set("latitude", params.latitude.toFixed(5));
  if (params.longitude !== undefined) q.set("longitude", params.longitude.toFixed(5));
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  if (params.lead !== undefined) q.set("lead", String(params.lead));
  q.set("include_imd", String(params.includeImd ?? true));
  return request<VerificationResult>(`/api/v1/verification?${q.toString()}`, {
    timeoutMs: 120_000,
    signal,
  });
}

export interface TrainingLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export function fetchTrainingLocations(
  signal?: AbortSignal,
): Promise<{ training_locations: TrainingLocation[]; note: string }> {
  return request(`/api/v1/locations`, { timeoutMs: 8_000, signal });
}
