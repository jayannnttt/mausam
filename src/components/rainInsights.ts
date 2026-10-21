/**
 * Pure helpers for the Rainfall Intelligence dashboard.
 *
 * Kept free of React so they can be unit-tested directly (no DOM needed) and
 * so chart/table data construction is verifiable.
 */

import type {
  DayPrediction,
  LeadSummary,
  MetricBlock,
  ModelMetricsResponse,
  SeriesRow,
  VerificationResult,
} from "../services/mlService";

// --------------------------------------------------------------------------- #
// Formatting
// --------------------------------------------------------------------------- #

export function fmtMm(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)} mm`;
}

export function fmtPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const v = value.toFixed(digits);
  return value > 0 ? `+${v}` : v;
}

export function fmtIsoDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short day label from "2026-10-21" → "Tue 21". */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

// --------------------------------------------------------------------------- #
// Charts
// --------------------------------------------------------------------------- #

export interface PredictionChartData {
  label: string;
  date: string;
  lead: number;
  mlMm: number | null;
  nwpMm: number | null;
  climMm: number | null;
  prob: number | null;
  intervalLo?: number;
  intervalHi?: number;
}

export function buildPredictionChartData(days: DayPrediction[]): PredictionChartData[] {
  return days.map((d) => ({
    label: shortDay(d.date),
    date: d.date,
    lead: d.lead_days,
    mlMm: d.model_available ? d.amount_mm ?? null : null,
    nwpMm: d.nwp_forecast_mm,
    climMm: d.climatology_mm,
    prob: d.model_available ? d.probability_rain ?? null : null,
    intervalLo: d.amount_interval_mm?.[0],
    intervalHi: d.amount_interval_mm?.[1],
  }));
}

export interface VerificationChartData {
  label: string;
  date: string;
  observed: number;
  nwp: number;
  ml: number | null;
  clim: number;
  nwpAe: number;
  mlAe: number | null;
  nwpRolling: number | null;
  mlRolling: number | null;
}

/** Trailing rolling mean of absolute error; null until `window` values exist. */
export function rollingMean(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

/**
 * Build chart rows (daily values + absolute errors + rolling error) from the
 * verification series. ``tail`` limits how many (most recent) days are shown.
 */
export function buildVerificationChartData(
  series: SeriesRow[],
  opts: { tail?: number; rollingWindow?: number } = {},
): VerificationChartData[] {
  const window = opts.rollingWindow ?? 7;
  const rows = opts.tail && opts.tail > 0 ? series.slice(-opts.tail) : series.slice();

  const nwpErrors = rows.map((r) => Math.abs(r.nwp_mm - r.observed_mm));
  const mlErrors = rows.map((r) =>
    r.ml_mm === null || r.ml_mm === undefined ? null : Math.abs(r.ml_mm - r.observed_mm),
  );
  const nwpRolling = rollingMean(
    nwpErrors.map((v) => (Number.isFinite(v) ? v : 0)),
    window,
  );
  const mlRolling = rollingMean(
    mlErrors.map((v) => (v === null ? 0 : v)),
    window,
  );

  return rows.map((r, i) => ({
    label: shortDay(r.date),
    date: r.date,
    observed: r.observed_mm,
    nwp: r.nwp_mm,
    ml: r.ml_mm,
    clim: r.clim_mm,
    nwpAe: Number.isFinite(nwpErrors[i]) ? nwpErrors[i] : 0,
    mlAe: mlErrors[i],
    nwpRolling: mlErrors[i] === null ? null : nwpRolling[i], // only where ML exists
    mlRolling: mlErrors[i] === null ? null : mlRolling[i],
  }));
}

// --------------------------------------------------------------------------- #
// Tables
// --------------------------------------------------------------------------- #

export interface ComparisonRow {
  source: string;
  /** What the source actually is — never reworded. */
  kind: string;
  available: boolean;
  unavailableReason?: string;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  brier: number | null;
  n: number | null;
}

function toComparisonRow(source: string, kind: string, block?: MetricBlock): ComparisonRow {
  if (!block || block.available === false) {
    return {
      source,
      kind,
      available: false,
      unavailableReason: block?.reason ?? "Not available for this window.",
      mae: null,
      rmse: null,
      bias: null,
      precision: null,
      recall: null,
      f1: null,
      brier: null,
      n: null,
    };
  }
  return {
    source,
    kind,
    available: true,
    mae: block.amount?.mae ?? null,
    rmse: block.amount?.rmse ?? null,
    bias: block.amount?.bias ?? null,
    precision: block.occurrence?.precision ?? null,
    recall: block.occurrence?.recall ?? null,
    f1: block.occurrence?.f1 ?? null,
    brier: block.occurrence?.brier ?? null,
    n: block.n ?? block.amount?.n_samples ?? block.occurrence?.n_samples ?? null,
  };
}

export const SOURCE_KINDS: Record<string, string> = {
  ml: "Mausam Sense ML model",
  nwp_raw: "Global NWP forecast (Open-Meteo archive)",
  climatology: "Day-of-year climatology baseline",
  imd: "IMD official forecast",
};

/** One row per source, scored on identical aligned rows. */
export function buildComparisonRows(result: VerificationResult): ComparisonRow[] {
  return [
    toComparisonRow("ml", SOURCE_KINDS.ml, result.scores.ml),
    toComparisonRow("nwp_raw", SOURCE_KINDS.nwp_raw, result.scores.nwp_raw),
    toComparisonRow("climatology", SOURCE_KINDS.climatology, result.scores.climatology),
    toComparisonRow("imd", SOURCE_KINDS.imd, result.scores.imd),
  ];
}

export interface BreakdownRow {
  group: string;
  n: number | null;
  mlMae: number | null;
  nwpMae: number | null;
  mlF1: number | null;
  nwpF1: number | null;
  mlBias: number | null;
}

/** Flatten a by-season / by-month breakdown into table rows. */
export function buildBreakdownRows(
  breakdown: Record<string, MetricBlock> | undefined,
): BreakdownRow[] {
  if (!breakdown) return [];
  return Object.entries(breakdown).map(([group, block]) => ({
    group,
    n: block.n ?? block.amount?.n_samples ?? null,
    mlMae: block.amount?.mae ?? null,
    nwpMae: block.nwp_amount?.mae ?? null,
    mlF1: block.occurrence?.f1 ?? null,
    nwpF1: null,
    mlBias: block.amount?.bias ?? null,
  }));
}

export interface LeadRow {
  lead: number;
  mlMae: number | null;
  nwpMae: number | null;
  climMae: number | null;
  skillVsNwp: number | null;
  mlF1: number | null;
  nwpF1: number | null;
  mlBrier: number | null;
  climBrier: number | null;
  coverage: number | null;
}

/** Per-lead summary of the held-out test window (from /api/v1/metrics). */
export function buildLeadRows(metrics: ModelMetricsResponse): LeadRow[] {
  const entries = Object.entries(metrics.summary_by_lead ?? {});
  return entries
    .map(([lead, s]: [string, LeadSummary]) => ({
      lead: Number(lead),
      mlMae: s.ml_mae ?? null,
      nwpMae: s.nwp_mae ?? null,
      climMae: s.climatology_mae ?? null,
      skillVsNwp:
        s.ml_mae != null && s.nwp_mae != null && s.nwp_mae !== 0
          ? 1 - s.ml_mae / s.nwp_mae
          : null,
      mlF1: s.ml_f1 ?? null,
      nwpF1: s.nwp_f1 ?? null,
      mlBrier: s.ml_brier ?? null,
      climBrier: s.climatology_brier ?? null,
      coverage: s.ml_interval_coverage ?? null,
    }))
    .sort((a, b) => a.lead - b.lead);
}

/**
 * Honest headline: does the ML model beat the reference on this window?
 * Returns null when the comparison cannot be made (never overclaims).
 */
export function skillHeadline(result: VerificationResult): {
  beatsNwp: boolean | null;
  text: string;
} {
  const mae = result.skill?.mae_skill_vs_nwp;
  if (mae === undefined || Number.isNaN(mae)) {
    return {
      beatsNwp: null,
      text: "Not enough aligned data on this window to compare the ML model with the NWP forecast.",
    };
  }
  const pct = (mae * 100).toFixed(1);
  if (mae > 0) {
    return {
      beatsNwp: true,
      text: `On this window the ML model's rainfall MAE is ${pct}% lower than the raw NWP forecast (${result.lead_days}-day lead, identical rows).`,
    };
  }
  if (mae === 0) {
    return { beatsNwp: null, text: "ML model and NWP forecast have identical MAE on this window." };
  }
  return {
    beatsNwp: false,
    text: `On this window the ML model's rainfall MAE is ${Math.abs(
      Number(pct),
    )}% higher than the raw NWP forecast — no improvement demonstrated here.`,
  };
}

// --------------------------------------------------------------------------- #
// Verification window selection
// --------------------------------------------------------------------------- #

export const MIN_VERIFICATION_DATE = "2024-01-08"; // forecast archive start + lead margin

/** ``preset`` is the day-count of a fixed window ("30", "90", "180", ...) or a custom range. */
export type RangePreset = `${number}` | "custom";

/**
 * Resolve the requested window to concrete [start, end] dates.
 *
 * ``end`` is pulled back by ``obsLagDays`` because the reanalysis reference
 * is published a few days after the fact — requesting those days would only
 * produce dropped rows.
 */
export function verificationWindow(
  preset: RangePreset,
  customStart?: string,
  customEnd?: string,
  today: Date = new Date(),
): { start: string; end: string; clamped: boolean } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const obsLagDays = 3;
  const defaultEnd = new Date(today.getTime() - obsLagDays * 86_400_000);

  if (preset === "custom") {
    const start = customStart && customStart >= MIN_VERIFICATION_DATE ? customStart : MIN_VERIFICATION_DATE;
    const end = customEnd && customEnd <= iso(defaultEnd) ? customEnd : iso(defaultEnd);
    const clamped = start !== customStart || end !== customEnd;
    if (start > end) return { start: end, end, clamped: true };
    return { start, end, clamped };
  }

  const days = Number(preset);
  const start = new Date(defaultEnd.getTime() - (days - 1) * 86_400_000);
  // Anchor the floor in UTC: parsing without "Z" yields local midnight, whose
  // ISO date is the previous day in front of UTC (e.g. IST) — which would let
  // a request start one day before the forecast archive exists.
  const minStart = new Date(`${MIN_VERIFICATION_DATE}T00:00:00Z`);
  const finalStart = start < minStart ? minStart : start;
  return { start: iso(finalStart), end: iso(defaultEnd), clamped: finalStart !== start };
}
