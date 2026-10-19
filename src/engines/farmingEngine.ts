/**
 * Mausam Sense — Farm Weather Intelligence logic.
 *
 * Translates the provider's rainfall forecast into plain planning language.
 * It does NOT improve rainfall prediction and does NOT issue crop-specific
 * agronomic instructions. Where a verified advisory is unavailable, the
 * weather summary is explicitly separated from official agricultural advice.
 */

import type { DailyWeather, HourlyWeather, WeatherDataset } from "../types/weather";
import { isRainCode } from "../utils/wmo";
import { dayLabel, todayIso } from "../utils/format";

export interface RainPeriod {
  start: string;
  end: string; // exclusive
  totalMm: number;
  maxProbabilityPct: number | null;
  hours: number;
}

export interface FarmPeriodSummary {
  label: string; // "Next 24 hours" etc.
  hours: number;
  totalMm: number;
  maxProbabilityPct: number | null;
  rainyHours: number;
  rainPeriods: RainPeriod[];
  /** True when the window had usable precipitation data. */
  hasData: boolean;
}

export interface DailyRain {
  date: string;
  label: string;
  precipSumMm: number | null;
  probabilityMaxPct: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  hasData: boolean;
}

export interface FarmOutlook {
  periods: FarmPeriodSummary[];
  daily: DailyRain[];
  /** Bullet points translating the data into planning language. */
  messages: { tone: "info" | "watch" | "alert" | "calm"; text: string }[];
  /** True when official advisories exist in the dataset. */
  hasOfficialAdvisories: boolean;
}

const RAIN_MM_THRESHOLD = 0.2; // mm/h considered "actual rain falling"
const PROB_THRESHOLD = 40; // % considered worth planning around

/** Group consecutive rainy hours into continuous periods. */
export function detectRainPeriods(hours: HourlyWeather[]): RainPeriod[] {
  const periods: RainPeriod[] = [];
  let current: RainPeriod | null = null;
  for (const h of hours) {
    const rainy =
      (h.precipitationMm != null && h.precipitationMm >= RAIN_MM_THRESHOLD) ||
      isRainCode(h.weatherCode) ||
      (h.precipitationProbabilityPct != null &&
        h.precipitationProbabilityPct >= 75 &&
        (h.precipitationMm ?? 0) > 0);
    if (rainy) {
      if (!current) {
        current = {
          start: h.time,
          end: h.time,
          totalMm: 0,
          maxProbabilityPct: null,
          hours: 0,
        };
        periods.push(current);
      }
      current.end = h.time;
      current.hours += 1;
      current.totalMm += h.precipitationMm ?? 0;
      if (h.precipitationProbabilityPct != null) {
        current.maxProbabilityPct = Math.max(
          current.maxProbabilityPct ?? 0,
          h.precipitationProbabilityPct,
        );
      }
    } else {
      current = null;
    }
  }
  // end points at the last rainy hour; make it exclusive for display.
  return periods.map((p) => ({ ...p, end: addHour(p.end, 1) }));
}

function addHour(isoLocal: string, hours: number): string {
  const d = new Date(`${isoLocal.slice(0, 13)}:00:00Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString().slice(0, 13) + ":00";
}

function summarisePeriod(
  label: string,
  hours: number,
  source: HourlyWeather[],
): FarmPeriodSummary {
  const withData = source.filter(
    (h) => h.precipitationMm != null || h.precipitationProbabilityPct != null,
  );
  const totalMm = withData.reduce((s, h) => s + (h.precipitationMm ?? 0), 0);
  const probs = withData
    .map((h) => h.precipitationProbabilityPct)
    .filter((p): p is number => p != null);
  const rainyHours = withData.filter(
    (h) => (h.precipitationMm ?? 0) >= RAIN_MM_THRESHOLD || isRainCode(h.weatherCode),
  ).length;
  return {
    label,
    hours,
    totalMm: Math.round(totalMm * 10) / 10,
    maxProbabilityPct: probs.length ? Math.max(...probs) : null,
    rainyHours,
    rainPeriods: detectRainPeriods(source),
    hasData: withData.length > 0,
  };
}

/** Build the full farm outlook from a dataset. */
export function buildFarmOutlook(dataset: WeatherDataset): FarmOutlook {
  const now = dataset.current?.time
    ? `${dataset.current.time.slice(0, 13)}:00`
    : dataset.hourly[0]?.time;
  const upcoming = dataset.hourly.filter((h) => h.time >= (now ?? ""));

  const periods = [
    summarisePeriod("Next 24 hours", 24, upcoming.slice(0, 24)),
    summarisePeriod("Next 48 hours", 48, upcoming.slice(0, 48)),
    summarisePeriod("Next 72 hours", 72, upcoming.slice(0, 72)),
  ];

  const today = todayIso(dataset.timezone);
  const daily: DailyRain[] = dataset.daily.map((d: DailyWeather) => ({
    date: d.date,
    label: dayLabel(d.date, today),
    precipSumMm: d.precipitationSumMm,
    probabilityMaxPct: d.precipitationProbabilityMaxPct,
    tempMaxC: d.tempMaxC,
    tempMinC: d.tempMinC,
    hasData: d.precipitationSumMm != null || d.precipitationProbabilityMaxPct != null,
  }));

  const messages: FarmOutlook["messages"] = [];
  const p24 = periods[0];
  const p72 = periods[2];

  if (!p24.hasData && !p72.hasData) {
    messages.push({
      tone: "alert",
      text: "No reliable rainfall outlook is available for the selected location.",
    });
  } else {
    if (p24.rainPeriods.length > 0) {
      const first = p24.rainPeriods[0];
      messages.push({
        tone: "watch",
        text: `Rain is forecast in the next 24 hours (about ${p24.totalMm} mm total). Review local conditions before scheduling irrigation or spraying. Wet spell around ${first.start.slice(11, 16)}–${first.end.slice(11, 16)}.`,
      });
    } else if ((p24.maxProbabilityPct ?? 0) >= PROB_THRESHOLD) {
      messages.push({
        tone: "info",
        text: `Rainfall probability is elevated today (up to ${p24.maxProbabilityPct}%) even though little accumulation is expected — keep an eye on local sky conditions.`,
      });
    } else {
      messages.push({
        tone: "calm",
        text: `No significant rain is forecast in the next 24 hours (expected total around ${p24.totalMm} mm, peak probability ${p24.maxProbabilityPct ?? 0}%).`,
      });
    }

    if (p72.rainPeriods.length >= 2) {
      messages.push({
        tone: "watch",
        text: `Multiple wet spells are expected over the next three days (${p72.rainPeriods.length} periods, ${p72.totalMm} mm total) — plan field access around the drier gaps.`,
      });
    } else if (p72.totalMm >= 20) {
      messages.push({
        tone: "alert",
        text: `Substantial rainfall is indicated over the next 72 hours (about ${p72.totalMm} mm). Ground may stay waterlogged after the wettest hours.`,
      });
    } else if (p72.hasData && p72.totalMm < 5) {
      messages.push({
        tone: "calm",
        text: `The three-day outlook stays mostly dry (about ${p72.totalMm} mm total). Soil moisture from any earlier rain should persist.`,
      });
    }
  }

  const hotDay = daily.find((d) => d.tempMaxC != null && d.tempMaxC >= 38);
  if (hotDay) {
    messages.push({
      tone: "watch",
      text: `${hotDay.label} is expected to reach ${Math.round(hotDay.tempMaxC as number)}°C — heat stress is possible for both people and standing crops during midday.`,
    });
  }

  const hasOfficialAdvisories = dataset.advisories.some((a) => !a.isDemo);
  if (!hasOfficialAdvisories) {
    messages.push({
      tone: "info",
      text: "No verified agricultural advisory is available for this location. The points above are general weather-based summaries from the forecast provider, not official agricultural advice.",
    });
  }

  return { periods, daily, messages, hasOfficialAdvisories };
}
