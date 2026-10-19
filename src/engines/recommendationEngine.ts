/**
 * Mausam Sense — Outdoor activity recommendation engine.
 *
 * A transparent, configurable, rules-based heuristic. It scores each forecast
 * hour 0–100 from available measurements, then ranks contiguous windows.
 *
 * HONESTY: this is an indicative project score, not a scientific model, not a
 * safety guarantee and not medical advice. Weights and thresholds live in
 * ACTIVITY_PROFILES below so the logic can be read and tuned openly. Missing
 * measurements never get invented — their weight is redistributed across the
 * factors that do have data, and the resulting confidence is reduced.
 */

import type { HourlyAirQuality, HourlyWeather } from "../types/weather";
import { pm25Band, usAqiBand } from "./aqi";

export type ActivityKey =
  | "running"
  | "jogging"
  | "walking"
  | "cycling"
  | "general";

export type FactorKey =
  | "airQuality"
  | "heat"
  | "uv"
  | "rain"
  | "wind"
  | "humidity"
  | "warning";

export const FACTOR_LABELS: Record<FactorKey, string> = {
  airQuality: "Air quality",
  heat: "Temperature",
  uv: "UV exposure",
  rain: "Rain risk",
  wind: "Wind",
  humidity: "Humidity",
  warning: "Official warnings",
};

export interface ActivityProfile {
  key: ActivityKey;
  label: string;
  /** Length of a candidate window in hours. */
  windowHours: number;
  weights: Record<FactorKey, number>;
  /** Temperatures (°C) where the activity feels best. */
  idealTempC: [number, number];
  /** How many °C beyond the ideal band scores drop to zero. */
  tempDropSpanC: number;
  /** Wind (km/h) beyond which the activity becomes unpleasant. */
  strongWindKmh: number;
}

/**
 * Weights are relative importance within an hour's score. They are intentionally
 * modest in spread so a single factor rarely dominates blindly.
 */
export const ACTIVITY_PROFILES: Record<ActivityKey, ActivityProfile> = {
  running: {
    key: "running",
    label: "Running",
    windowHours: 1,
    idealTempC: [10, 24],
    tempDropSpanC: 14,
    strongWindKmh: 40,
    weights: {
      airQuality: 24,
      heat: 22,
      uv: 12,
      rain: 18,
      wind: 10,
      humidity: 8,
      warning: 24,
    },
  },
  jogging: {
    key: "jogging",
    label: "Jogging",
    windowHours: 1,
    idealTempC: [12, 26],
    tempDropSpanC: 14,
    strongWindKmh: 38,
    weights: {
      airQuality: 24,
      heat: 22,
      uv: 12,
      rain: 18,
      wind: 10,
      humidity: 8,
      warning: 24,
    },
  },
  walking: {
    key: "walking",
    label: "Walking",
    windowHours: 1,
    idealTempC: [12, 30],
    tempDropSpanC: 18,
    strongWindKmh: 45,
    weights: {
      airQuality: 24,
      heat: 16,
      uv: 12,
      rain: 20,
      wind: 8,
      humidity: 8,
      warning: 22,
    },
  },
  cycling: {
    key: "cycling",
    label: "Cycling",
    windowHours: 1,
    idealTempC: [12, 26],
    tempDropSpanC: 14,
    strongWindKmh: 28, // wind matters more on a bike
    weights: {
      airQuality: 24,
      heat: 18,
      uv: 10,
      rain: 20,
      wind: 16,
      humidity: 6,
      warning: 24,
    },
  },
  general: {
    key: "general",
    label: "General outdoor exercise",
    windowHours: 1,
    idealTempC: [12, 28],
    tempDropSpanC: 16,
    strongWindKmh: 38,
    weights: {
      airQuality: 22,
      heat: 20,
      uv: 12,
      rain: 18,
      wind: 10,
      humidity: 8,
      warning: 22,
    },
  },
};

export type Score = number; // 0–100, higher is better

export interface FactorScore {
  key: FactorKey;
  /** Null when the measurement was unavailable for this hour. */
  score: Score | null;
  /** Weight actually applied (renormalised across available factors). */
  weight: number;
  /** Short explanation of this factor's reading. */
  detail: string;
}

export interface HourScore {
  time: string;
  /** Weighted score 0–100, null if almost no data was available. */
  total: Score | null;
  factors: FactorScore[];
  missing: FactorKey[];
}

export interface ScoredWindow {
  start: string;
  end: string; // exclusive
  score: Score;
  hours: HourScore[];
  /** Factor keys that helped most relative to other windows. */
  strengths: FactorKey[];
  /** Factor keys that hurt most in this window. */
  concerns: FactorKey[];
  /** True when the window abuts a higher-scoring window that was merged in. */
  merged: boolean;
}

export interface RankingResult {
  windows: ScoredWindow[];
  hourScores: HourScore[];
  profile: ActivityProfile;
  /** Fraction of weight that had underlying data, 0–1. */
  dataCoverage: number;
  confidence: "high" | "moderate" | "low";
  /** Present when a confident ranking cannot be produced. */
  insufficient?: { reason: string };
  notes: string[];
}

export interface ScoringOptions {
  /** Heightened air-quality awareness tightens PM2.5 thresholds. */
  heightenedAqAwareness: boolean;
  /**
   * Severity of any official warning overlapping each hour ISO time
   * ("red" | "orange" | "yellow"). Empty map = no warnings available.
   */
  warningsByHour?: Record<string, "red" | "orange" | "yellow">;
  /** When false, the warning factor is dropped (source not available). */
  warningsAvailable: boolean;
}

const clamp = (v: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, v));

/** Temperature comfort: 100 inside ideal band, falling linearly outside. */
export function temperatureScore(
  tC: number | null,
  ideal: [number, number],
  dropSpan: number,
): Score | null {
  if (tC == null || Number.isNaN(tC)) return null;
  const [lo, hi] = ideal;
  if (tC >= lo && tC <= hi) return 100;
  const distance = tC < lo ? lo - tC : tC - hi;
  return clamp(100 - (distance / dropSpan) * 100);
}

/** UV: negligible below 2, dropping to 0 by index 10 (harsher if sensitive). */
export function uvScore(uv: number | null, strict: boolean): Score | null {
  if (uv == null || Number.isNaN(uv)) return null;
  const safe = strict ? 1 : 2;
  const span = strict ? 6 : 8;
  if (uv <= safe) return 100;
  return clamp(100 - ((uv - safe) / span) * 100);
}

/** Rain risk blends actual forecast mm with the probability of rain. */
export function rainScore(
  probPct: number | null,
  mm: number | null,
): Score | null {
  const probScore =
    probPct == null || Number.isNaN(probPct)
      ? null
      : clamp(100 - Math.max(0, probPct - 20));
  const mmScore =
    mm == null || Number.isNaN(mm)
      ? null
      : mm <= 0.05
        ? 100
        : mm <= 0.5
          ? 65
          : mm <= 2
            ? 35
            : mm <= 5
              ? 12
              : 0;
  if (probScore == null) return mmScore;
  if (mmScore == null) return probScore;
  // Measured precipitation dominates the judgement once it is happening.
  return Math.min(probScore, mmScore);
}

/** Wind: gentle breeze is fine; strong wind is scored harshly on a bike. */
export function windScore(
  kmh: number | null,
  strongKmh: number,
): Score | null {
  if (kmh == null || Number.isNaN(kmh)) return null;
  if (kmh <= 3) return 85; // still air — fine, but no cooling breeze
  if (kmh <= 30) return 100;
  return clamp(100 - ((kmh - 30) / (strongKmh + 15 - 30)) * 100);
}

/** Humidity: comfortable 30–70%, muggy above, very dry below. */
export function humidityScore(rh: number | null): Score | null {
  if (rh == null || Number.isNaN(rh)) return null;
  if (rh >= 30 && rh <= 70) return 100;
  if (rh > 70) return clamp(100 - ((rh - 70) / 30) * 70); // 100% RH → 30
  return clamp(100 - ((30 - rh) / 25) * 60); // very dry air
}

/**
 * Air quality prefers raw PM2.5 (with WHO-referenced bands); falls back to a
 * US EPA AQI conversion when concentrations are missing. The index used is
 * always reported in the detail string so nothing gets mislabelled.
 */
export function airQualityScore(
  aq: HourlyAirQuality | undefined,
  strict: boolean,
): { score: Score | null; detail: string } {
  if (!aq) return { score: null, detail: "No air-quality data for this hour" };
  if (aq.pm25 != null && !Number.isNaN(aq.pm25)) {
    const band = pm25Band(aq.pm25, strict);
    const scoreMap: Record<number, Score> = { 0: 100, 1: 82, 2: 58, 3: 32, 4: 8 };
    return {
      score: scoreMap[band.tone],
      detail: `PM2.5 ${Math.round(aq.pm25 * 10) / 10} µg/m³ — ${band.label}`,
    };
  }
  if (aq.usAqi != null && !Number.isNaN(aq.usAqi)) {
    const band = usAqiBand(aq.usAqi);
    const scoreMap: Record<number, Score> = { 0: 100, 1: 82, 2: 58, 3: 32, 4: 8 };
    return {
      score: scoreMap[band.tone],
      detail: `US EPA AQI ${Math.round(aq.usAqi)} — ${band.label} (not CPCB AQI)`,
    };
  }
  return { score: null, detail: "Pollutant data unavailable for this hour" };
}

const WARNING_SCORE: Record<"red" | "orange" | "yellow", Score> = {
  red: 0,
  orange: 15,
  yellow: 55,
};

/** Score a single forecast hour for a given activity. */
export function scoreHour(
  hour: HourlyWeather,
  aq: HourlyAirQuality | undefined,
  profile: ActivityProfile,
  opts: ScoringOptions,
): HourScore {
  const factors: FactorScore[] = [];
  const { heightenedAqAwareness: strict } = opts;

  const aqResult = airQualityScore(aq, strict);
  factors.push({
    key: "airQuality",
    score: aqResult.score,
    weight: profile.weights.airQuality,
    detail: aqResult.detail,
  });

  // Prefer apparent (feels-like) temperature: it is what the body experiences.
  const tRef = hour.apparentTemperatureC ?? hour.temperatureC;
  const tScore = temperatureScore(tRef, profile.idealTempC, profile.tempDropSpanC);
  const tLabel =
    hour.apparentTemperatureC != null
      ? `Feels like ${Math.round(hour.apparentTemperatureC)}°C`
      : hour.temperatureC != null
        ? `Temperature ${Math.round(hour.temperatureC)}°C (feels-like unavailable)`
        : "Temperature unavailable";
  factors.push({ key: "heat", score: tScore, weight: profile.weights.heat, detail: tLabel });

  const uv = uvScore(hour.uvIndex, strict);
  factors.push({
    key: "uv",
    score: uv,
    weight: profile.weights.uv,
    detail:
      hour.uvIndex != null ? `UV index ${Math.round(hour.uvIndex * 10) / 10}` : "UV index unavailable",
  });

  const rain = rainScore(hour.precipitationProbabilityPct, hour.precipitationMm);
  const rainBits: string[] = [];
  if (hour.precipitationProbabilityPct != null)
    rainBits.push(`${Math.round(hour.precipitationProbabilityPct)}% chance`);
  if (hour.precipitationMm != null) rainBits.push(`${hour.precipitationMm} mm expected`);
  factors.push({
    key: "rain",
    score: rain,
    weight: profile.weights.rain,
    detail: rainBits.length ? rainBits.join(", ") : "Rain data unavailable",
  });

  const wind = windScore(hour.windSpeedKmh, profile.strongWindKmh);
  factors.push({
    key: "wind",
    score: wind,
    weight: profile.weights.wind,
    detail:
      hour.windSpeedKmh != null ? `Wind ${Math.round(hour.windSpeedKmh)} km/h` : "Wind data unavailable",
  });

  const hum = humidityScore(hour.humidityPct);
  factors.push({
    key: "humidity",
    score: hum,
    weight: profile.weights.humidity,
    detail:
      hour.humidityPct != null ? `Humidity ${Math.round(hour.humidityPct)}%` : "Humidity unavailable",
  });

  let warningScore: Score | null;
  if (!opts.warningsAvailable) {
    warningScore = null;
  } else {
    const sev = opts.warningsByHour?.[hour.time];
    warningScore = sev ? WARNING_SCORE[sev] : 100;
  }
  const sev = opts.warningsByHour?.[hour.time];
  factors.push({
    key: "warning",
    score: warningScore,
    weight: profile.weights.warning,
    detail: !opts.warningsAvailable
      ? "Official warnings could not be checked"
      : sev
        ? `Active ${sev} official warning for this hour`
        : "No official warning in effect",
  });

  // Renormalise: redistribute weight of missing factors across available ones,
  // so an hour is never punished merely because a sensor was absent.
  const available = factors.filter((f) => f.score != null);
  const missing = factors.filter((f) => f.score == null).map((f) => f.key);
  const totalWeight = available.reduce((s, f) => s + f.weight, 0);
  let total: Score | null = null;
  if (totalWeight > 0) {
    total = clamp(
      available.reduce((s, f) => s + (f.score as Score) * f.weight, 0) / totalWeight,
    );
  }
  const normalised = factors.map((f) => ({
    ...f,
    weight: totalWeight > 0 && f.score != null ? (f.weight / totalWeight) * 100 : 0,
  }));
  return { time: hour.time, total, factors: normalised, missing };
}

/** Factor keys whose weighted contrast best explains a vs b. */
export function contrastFactors(
  a: HourScore,
  b: HourScore,
  top = 2,
): FactorKey[] {
  const diffs: { key: FactorKey; diff: number }[] = [];
  for (let i = 0; i < a.factors.length; i++) {
    const fa = a.factors[i];
    const fb = b.factors[i];
    if (fa.score == null || fb.score == null) continue;
    const diff = ((fa.score - fb.score) * (fa.weight + fb.weight)) / 2;
    if (Math.abs(diff) > 4) diffs.push({ key: fa.key, diff });
  }
  diffs.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return diffs.slice(0, top).map((d) => d.key);
}

/**
 * Rank the provided forecast hours.
 *
 * @param hours  forecast hours (already trimmed to the planning horizon)
 * @param airQualityByHour  AQ data keyed by the same ISO hour strings
 */
export function rankHours(
  hours: HourlyWeather[],
  airQualityByHour: Map<string, HourlyAirQuality>,
  activity: ActivityKey,
  opts: ScoringOptions,
): RankingResult {
  const profile = ACTIVITY_PROFILES[activity];
  const notes: string[] = [];

  const hourScores = hours
    .map((h) => scoreHour(h, airQualityByHour.get(h.time), profile, opts))
    .filter((h) => h.total != null);

  if (!opts.warningsAvailable) {
    notes.push(
      "Official warnings could not be retrieved for this location, so this ranking does not account for active alerts.",
    );
  }
  if (!airQualityByHour.size) {
    notes.push(
      "Air-quality data was unavailable, so this ranking is based on weather conditions only.",
    );
  }

  if (hourScores.length < profile.windowHours) {
    return {
      windows: [],
      hourScores,
      profile,
      dataCoverage: 0,
      confidence: "low",
      insufficient: {
        reason: `Only ${hourScores.length} usable forecast hour(s) available — at least ${profile.windowHours} are needed to rank ${profile.label.toLowerCase()} windows.`,
      },
      notes,
    };
  }

  // Data coverage = average fraction of factor weight that had measurements.
  const coverage =
    hourScores.reduce((sum, h) => {
      const withData = h.factors.filter((f) => f.score != null).reduce((s, f) => s + f.weight, 0);
      const totalW = h.factors.reduce((s, f) => s + (ACTIVITY_PROFILES[activity].weights[f.key]), 0);
      return sum + (totalW > 0 ? withData / totalW : 0);
    }, 0) / hourScores.length;

  // Sliding windows of profile.windowHours.
  const rawWindows: ScoredWindow[] = [];
  for (let i = 0; i + profile.windowHours <= hourScores.length; i++) {
    const slice = hourScores.slice(i, i + profile.windowHours);
    const score =
      slice.reduce((s, h) => s + (h.total as number), 0) / slice.length;
    rawWindows.push({
      start: slice[0].time,
      // end is exclusive: one hour past the last hour in the window.
      end: addHoursIso(slice[slice.length - 1].time, 1),
      score,
      hours: slice,
      strengths: [],
      concerns: [],
      merged: false,
    });
  }
  rawWindows.sort((a, b) => b.score - a.score);

  // Greedily pick non-overlapping top windows.
  const picked: ScoredWindow[] = [];
  for (const w of rawWindows) {
    if (picked.length >= 3) break;
    const overlaps = picked.some(
      (p) =>
        w.start < addHoursIso(p.end, profile.windowHours - 1) &&
        p.start < addHoursIso(w.end, profile.windowHours - 1),
    );
    if (!overlaps) picked.push(w);
  }

  // Merge adjacent acceptable hours into longer practical windows.
  const byTime = [...hourScores].sort((a, b) => a.time.localeCompare(b.time));
  const scoreAt = new Map(byTime.map((h) => [h.time, h.total as number]));
  const merged = picked.map((w) => {
    let start = w.start;
    let end = addHoursIso(w.end, 0); // w.end already points at next hour
    // Extend forward while the hour is still clearly acceptable.
    let guard = 0;
    while ((scoreAt.get(end) ?? 0) >= 70 && guard < 6) {
      end = addHoursIso(end, 1);
      guard++;
    }
    // Extend backward.
    guard = 0;
    const prev = addHoursIso(start, -1);
    let newStart = start;
    if ((scoreAt.get(prev) ?? 0) >= 70) {
      newStart = prev;
    }
    const windowHoursList = byTime.filter((h) => h.time >= newStart && h.time < end);
    const score =
      windowHoursList.reduce((s, h) => s + h.total!, 0) /
      Math.max(1, windowHoursList.length);
    const best = picked[0];
    return {
      ...w,
      start: newStart,
      end,
      score,
      hours: windowHoursList,
      merged: newStart !== w.start || end !== w.end,
      strengths: contrastFactors(avgScore(windowHoursList), avgScore(best.hours)),
      concerns: contrastFactors(avgScore(w.hours), avgScore(best.hours)),
    };
  });

  // Merging can make two windows start at the same hour — keep the best one.
  const seenStarts = new Set<string>();
  const deduped = merged.filter((w) => {
    if (seenStarts.has(w.start)) return false;
    seenStarts.add(w.start);
    return true;
  });

  const confidence: RankingResult["confidence"] =
    coverage >= 0.85 ? "high" : coverage >= 0.6 ? "moderate" : "low";
  if (coverage < 0.6) {
    notes.push(
      "Several measurements were missing for these hours — treat the ordering as indicative only.",
    );
  }

  return {
    windows: deduped,
    hourScores,
    profile,
    dataCoverage: coverage,
    confidence,
    notes,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Add hours to an ISO local datetime string (…THH:00) without Date tz math. */
export function addHoursIso(isoLocal: string, hours: number): string {
  const d = new Date(`${isoLocal.slice(0, 13)}:00:00Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString().slice(0, 13) + ":00";
}

/** Mean factor scores across a window, for comparisons. */
export function avgScore(hours: HourScore[]): HourScore {
  const first = hours[0];
  const factors = first.factors.map((f, i) => {
    const values = hours
      .map((h) => h.factors[i]?.score)
      .filter((v): v is number => v != null);
    const score = values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
    return { ...f, score };
  });
  const totalValues = hours
    .map((h) => h.total)
    .filter((v): v is number => v != null);
  const total = totalValues.length
    ? totalValues.reduce((a, b) => a + b, 0) / totalValues.length
    : null;
  return {
    time: first.time,
    total,
    factors,
    missing: factors.filter((f) => f.score == null).map((f) => f.key),
  };
}
