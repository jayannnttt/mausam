/**
 * Air-quality banding helpers.
 *
 * IMPORTANT HONESTY RULES ENFORCED HERE:
 * - Open-Meteo's air-quality API serves CAMS (Copernicus) *model estimates*,
 *   plus US EPA AQI and European AQI conversions of those estimates.
 * - India's official index is the CPCB National AQI. We NEVER relabel a US or
 *   European index as CPCB AQI, and we never silently substitute one for the
 *   other. If a live Indian reading is unavailable, we show raw pollutant
 *   concentrations with their source labels instead.
 */

export interface AqiBand {
  label: string;
  /** 0–4 driving colour scale for UI. */
  tone: 0 | 1 | 2 | 3 | 4;
  advice: string;
}

const TONE_LABELS = ["Good", "Fair", "Moderate", "Poor", "Very poor"];

/** US EPA AQI bands (0–500). */
export function usAqiBand(value: number): AqiBand {
  let idx: number;
  let advice: string;
  if (value <= 50) {
    idx = 0;
    advice = "Air quality is acceptable for outdoor activity.";
  } else if (value <= 100) {
    idx = 1;
    advice = "Acceptable; unusually sensitive people may feel mild effects.";
  } else if (value <= 150) {
    idx = 2;
    advice = "Sensitive groups may experience health effects; consider shorter outdoor sessions.";
  } else if (value <= 200) {
    idx = 3;
    advice = "Everyone may begin to experience health effects; avoid prolonged outdoor exertion.";
  } else {
    idx = 4;
    advice = "Health alert: reduce prolonged or heavy outdoor exertion.";
  }
  return { label: TONE_LABELS[idx], tone: idx as AqiBand["tone"], advice };
}

/** European AQI bands (0–200 scale, CAMS). */
export function euAqiBand(value: number): AqiBand {
  let idx: number;
  let advice: string;
  if (value <= 20) {
    idx = 0;
    advice = "Air quality is good for outdoor activity.";
  } else if (value <= 40) {
    idx = 1;
    advice = "Fair air quality; most people are unaffected.";
  } else if (value <= 60) {
    idx = 2;
    advice = "Moderate; sensitive groups should consider timing.";
  } else if (value <= 80) {
    idx = 3;
    advice = "Poor; reduce intensive outdoor activity.";
  } else {
    idx = 4;
    advice = "Very poor; avoid prolonged outdoor exertion.";
  }
  return { label: TONE_LABELS[idx], tone: idx as AqiBand["tone"], advice };
}

/**
 * PM2.5 guidance bands. Thresholds follow WHO Air Quality Guideline /
 * interim targets (2021) as a reference frame — explicitly NOT the CPCB
 * National AQI breakpoints, which map concentrations to India's official
 * index in ways we cannot reproduce without a CPCB reading.
 *
 * `strict` mode (heightened awareness preference) tightens the bands.
 */
export function pm25Band(
  value: number,
  strict = false,
): AqiBand {
  const t = strict
    ? [10, 25, 50, 90] // µg/m³ breakpoints when heightened awareness is on
    : [15, 45, 90, 150];
  let idx: number;
  let advice: string;
  if (value <= t[0]) {
    idx = 0;
    advice = "Low particle pollution — comfortable for outdoor exercise.";
  } else if (value <= t[1]) {
    idx = 1;
    advice = "Acceptable for most people during moderate outdoor activity.";
  } else if (value <= t[2]) {
    idx = 2;
    advice = "Consider reducing prolonged intense exercise outdoors.";
  } else if (value <= t[3]) {
    idx = 3;
    advice = "Elevated particles — prefer shorter, gentler sessions or move indoors.";
  } else {
    idx = 4;
    advice = "High particle pollution — outdoor exertion is best avoided where possible.";
  }
  return { label: TONE_LABELS[idx], tone: idx as AqiBand["tone"], advice };
}

/** Short human label for a PM2.5 concentration, always with units. */
export function pm25Label(value: number | null): string {
  if (value == null) return "PM2.5 unavailable";
  return `${Math.round(value * 10) / 10} µg/m³`;
}

/** Descriptive name of whichever AQI index a number refers to. */
export const AQI_METHODOLOGIES = {
  us: "US EPA AQI (converted from CAMS model estimates by Open-Meteo) — not India's CPCB AQI",
  eu: "European AQI (CAMS, via Open-Meteo) — not India's CPCB AQI",
  cpcb: "CPCB National AQI (official Indian index)",
} as const;
