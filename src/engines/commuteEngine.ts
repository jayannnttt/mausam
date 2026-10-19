/**
 * Mausam Sense — Commuting & travel insights.
 *
 * Flags forecast conditions that commonly affect a commute: rain during
 * typical commuting hours, poor visibility (fog/haze), extreme heat, and any
 * active official warnings. Everything is derived from the provider forecast.
 */

import type { WeatherDataset, HourlyWeather } from "../types/weather";
import { isFogCode, isRainCode, isStormCode } from "../utils/wmo";
import { zonedNow } from "../utils/format";

export interface CommuteInsight {
  id: string;
  tone: "alert" | "watch" | "info";
  title: string;
  detail: string;
}

export interface CommuteOutlook {
  insights: CommuteInsight[];
  /** Rain hours among the next N hours (with data), for a compact stat. */
  nextRainHour: string | null;
  worstVisibilityKm: number | null;
}

export function buildCommuteOutlook(dataset: WeatherDataset): CommuteOutlook {
  const insights: CommuteInsight[] = [];
  const { hour } = zonedNow(dataset.timezone);
  const nowIso = dataset.current?.time
    ? dataset.current.time.slice(0, 13)
    : dataset.hourly[0]?.time.slice(0, 13);
  const upcoming = dataset.hourly.filter((h) => h.time >= `${nowIso}:00`).slice(0, 18);

  // 1. Official warnings — always surfaced for commuters too.
  for (const w of dataset.warnings) {
    insights.push({
      id: `w-${w.id}`,
      tone: w.severity === "red" ? "alert" : "watch",
      title: `${w.isDemo ? "[DEMO] " : ""}${w.headline}`,
      detail: `${w.affectedArea}. Valid ${w.effectiveFrom} to ${w.effectiveTo}. Issued by ${w.issuingAuthority}.`,
    });
  }

  // 2. Rain in morning/evening commute windows.
  const commuteHours = upcoming.filter((h) => {
    const hHour = Number(h.time.slice(11, 13));
    return (hHour >= 7 && hHour <= 10) || (hHour >= 17 && hHour <= 20);
  });
  const rainyCommute = commuteHours.filter(
    (h) => isRainCode(h.weatherCode) || (h.precipitationMm ?? 0) >= 0.2,
  );
  if (rainyCommute.length > 0) {
    const first = rainyCommute[0];
    const maxProb = Math.max(
      ...rainyCommute
        .map((h) => h.precipitationProbabilityPct)
        .filter((p): p is number => p != null),
      0,
    );
    insights.push({
      id: "commute-rain",
      tone: "watch",
      title: "Rain likely around commuting hours",
      detail: `${rainyCommute.length} hour(s) of the typical morning/evening commute window show rain (peak probability ${Math.round(maxProb)}%), starting around ${first.time.slice(11, 16)}. Allow extra travel time.`,
    });
  }

  // 3. Storms.
  const stormHour = upcoming.find((h) => isStormCode(h.weatherCode));
  if (stormHour) {
    insights.push({
      id: "commute-storm",
      tone: "alert",
      title: "Thunderstorm in the forecast window",
      detail: `Thunderstorm conditions are forecast around ${stormHour.time.slice(11, 16)}. Sudden downpours and reduced visibility are possible.`,
    });
  }

  // 4. Poor visibility (fog).
  const fogHours = upcoming.filter(
    (h) => isFogCode(h.weatherCode) || (h.visibilityM != null && h.visibilityM < 1000),
  );
  if (fogHours.length > 0) {
    const worst = Math.min(
      ...fogHours
        .map((h) => h.visibilityM)
        .filter((v): v is number => v != null),
    );
    insights.push({
      id: "commute-fog",
      tone: "watch",
      title: "Low visibility expected",
      detail: `Visibility may drop to around ${(worst / 1000).toFixed(1)} km in the forecast window${fogHours[0].time ? ` (first around ${fogHours[0].time.slice(11, 16)})` : ""}. Drive slowly and use fog lights where required.`,
    });
  }

  // 5. Heat for two-wheelers / walking.
  const hotHour = upcoming.find(
    (h) => (h.apparentTemperatureC ?? h.temperatureC ?? 0) >= 42,
  );
  if (hotHour) {
    insights.push({
      id: "commute-heat",
      tone: "watch",
      title: "Severe heat during the day",
      detail: `Feels-like may reach ${Math.round(hotHour.apparentTemperatureC ?? hotHour.temperatureC ?? 0)}°C around ${hotHour.time.slice(11, 16)}. Carry water and limit waiting in the open sun.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "commute-clear",
      tone: "info",
      title: "No weather-related commute issues flagged",
      detail: `The forecast for the next several hours shows no rain, storms, fog or extreme heat at this location. (Hour: ${hour}:00 local.)`,
    });
  }

  const nextRain = upcoming.find(
    (h) => isRainCode(h.weatherCode) || (h.precipitationMm ?? 0) >= 0.2,
  );
  const visibilities = upcoming
    .map((h: HourlyWeather) => h.visibilityM)
    .filter((v): v is number => v != null);

  return {
    insights,
    nextRainHour: nextRain ? nextRain.time : null,
    worstVisibilityKm: visibilities.length
      ? Math.min(...visibilities) / 1000
      : null,
  };
}
