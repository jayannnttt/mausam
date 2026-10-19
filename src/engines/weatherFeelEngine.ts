/**
 * Mausam Sense — Weather Feel Engine.
 *
 * Translates measurements into plain-language descriptions using transparent
 * rules. These labels are Mausam Sense interpretations — NOT official
 * meteorological categories and NOT established heat-stress indices (like
 * WBGT or IMD heat-index categories). Only actually-available variables are
 * used; nothing is fabricated when a measurement is missing.
 */

import type { CurrentWeather, HourlyAirQuality } from "../types/weather";
import { isRainCode } from "../utils/wmo";

export type FeelTone =
  | "hot"
  | "warm"
  | "pleasant"
  | "cool"
  | "cold"
  | "rain"
  | "storm";

export interface FeelFactor {
  label: string;
  value: string;
  contribution: string;
}

export interface WeatherFeel {
  label: string;
  tone: FeelTone;
  /** One-paragraph explanation. */
  summary: string;
  factors: FeelFactor[];
  /** Secondary nuance, e.g. "Feels warmer than the thermometer says". */
  nuance?: string;
  /** True when feels-like was used as the primary input. */
  usedApparentTemperature: boolean;
  missing: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "Mausam Sense interpretation for everyday planning — not an official meteorological category, heat-stress measurement, or health guidance.";

export function classifyWeatherFeel(
  current: CurrentWeather | undefined,
  hourlyNow: HourlyWeatherLike | undefined,
  aqNow: HourlyAirQuality | undefined,
): WeatherFeel {
  const factors: FeelFactor[] = [];
  const missing: string[] = [];

  if (!current) {
    return {
      label: "Conditions unavailable",
      tone: "cool",
      summary:
        "No current weather values are available for this location right now, so the weather feel cannot be described.",
      factors: [],
      usedApparentTemperature: false,
      missing: ["current conditions"],
      disclaimer: DISCLAIMER,
    };
  }

  const humidity = current.humidityPct ?? hourlyNow?.humidityPct ?? null;
  const wind = current.windSpeedKmh ?? hourlyNow?.windSpeedKmh ?? null;
  const precipMm = current.precipitationMm ?? null;
  const precipProb = hourlyNow?.precipitationProbabilityPct ?? null;
  const uv = current.uvIndex ?? hourlyNow?.uvIndex ?? null;

  const usedApparent = current.apparentTemperatureC != null;
  const refTemp = usedApparent
    ? (current.apparentTemperatureC as number)
    : current.temperatureC;

  if (current.temperatureC != null) {
    factors.push({
      label: "Air temperature",
      value: `${Math.round(current.temperatureC)}°C`,
      contribution: "The thermometer reading itself.",
    });
  } else {
    missing.push("air temperature");
  }
  if (usedApparent) {
    factors.push({
      label: "Feels-like",
      value: `${Math.round(current.apparentTemperatureC as number)}°C`,
      contribution:
        "Combines temperature with humidity and wind — this drives the description.",
    });
  } else {
    missing.push("feels-like temperature");
  }
  if (humidity != null) {
    factors.push({
      label: "Humidity",
      value: `${Math.round(humidity)}%`,
      contribution:
        humidity >= 75
          ? "High humidity makes it feel stickier and slows sweat evaporation."
          : humidity <= 35
            ? "Dry air — moisture evaporates quickly."
            : "Moderate humidity, near a comfortable balance.",
    });
  } else {
    missing.push("humidity");
  }
  if (wind != null) {
    factors.push({
      label: "Wind",
      value: `${Math.round(wind)} km/h`,
      contribution:
        wind >= 15
          ? "A noticeable breeze adds a cooling effect."
          : "Light wind, so little additional cooling.",
    });
  } else {
    missing.push("wind speed");
  }
  if (precipProb != null || precipMm != null) {
    factors.push({
      label: "Rain",
      value: [precipProb != null ? `${Math.round(precipProb)}% chance` : null, precipMm != null ? `${precipMm} mm` : null]
        .filter(Boolean)
        .join(", "),
      contribution: isRainCode(current.weatherCode) || (precipMm ?? 0) > 0
        ? "Rain is falling or expected, which changes how the air feels on skin."
        : "No meaningful rain expected at this hour.",
    });
  }
  if (uv != null) {
    factors.push({
      label: "UV index",
      value: `${Math.round(uv * 10) / 10}`,
      contribution:
        uv >= 6
          ? "Strong sun adds to the sensation of heat."
          : "Sun angle is modest right now.",
    });
  } else {
    missing.push("UV index");
  }

  if (refTemp == null) {
    return {
      label: "Conditions unavailable",
      tone: "cool",
      summary:
        "Temperature data is missing, so no weather-feel description is offered rather than guessing.",
      factors,
      usedApparentTemperature: false,
      missing,
      disclaimer: DISCLAIMER,
    };
  }

  const raining = isRainCode(current.weatherCode) || (precipMm ?? 0) > 0.2 ||
    (precipProb != null && precipProb >= 70);
  const hum = humidity ?? 50; // neutral assumption only when classifying, flagged below
  const windKmh = wind ?? 0;
  const humKnown = humidity != null;

  let label: string;
  let tone: FeelTone;
  let summary: string;

  if (refTemp >= 40) {
    tone = "hot";
    label = "Extreme heat";
    summary = `Dangerously hot at ${Math.round(refTemp)}°C apparent. Limit time outdoors and follow official heat guidance.`;
  } else if (refTemp >= 33) {
    tone = "hot";
    if (humKnown && hum >= 60) {
      label = "Hot and humid";
      summary = `Sticky heat: ${Math.round(refTemp)}°C feels-like with ${Math.round(hum)}% humidity. Sweat does not evaporate easily, so the heat bites harder.`;
    } else if (humKnown && hum < 45) {
      label = "Dry heat";
      summary = `Hot but dry: ${Math.round(refTemp)}°C feels-like with only ${Math.round(hum)}% humidity. The heat is more tolerable, though dehydration still arrives quickly.`;
    } else {
      label = "Hot";
      summary = `Hot at ${Math.round(refTemp)}°C feels-like.${humKnown ? "" : " Humidity is unknown, so a more specific description is not offered."}`;
    }
  } else if (refTemp >= 27) {
    tone = "warm";
    if (raining && (humKnown ? hum >= 75 : true)) {
      label = "Rainy and muggy";
      summary = `Warm at ${Math.round(refTemp)}°C with rain and heavy moisture in the air. Expect damp, close conditions.`;
    } else if (humKnown && hum >= 75) {
      label = "Warm and muggy";
      summary = `Warm at ${Math.round(refTemp)}°C and quite humid (${Math.round(hum)}%). The air feels close and heavier than the number suggests.`;
    } else if (windKmh >= 15) {
      label = "Warm and breezy";
      summary = `Warm at ${Math.round(refTemp)}°C with a ${Math.round(windKmh)} km/h breeze keeping things comfortable.`;
    } else {
      label = "Warm";
      summary = `A warm ${Math.round(refTemp)}°C with no strong wind to cool things down.`;
    }
  } else if (refTemp >= 20) {
    tone = "pleasant";
    if (raining) {
      label = "Mild but wet";
      summary = `Mild at ${Math.round(refTemp)}°C, but rain keeps it damp. Comfortable in the right rain gear.`;
    } else if (windKmh >= 20) {
      label = "Pleasant and breezy";
      summary = `Mild temperatures around ${Math.round(refTemp)}°C with a fresh breeze — agreeable for being outside.`;
    } else {
      label = "Pleasant";
      summary = `Comfortable ${Math.round(refTemp)}°C with moderate air. A good all-round temperature for being outdoors.`;
    }
  } else if (refTemp >= 12) {
    tone = "cool";
    if (humKnown && hum <= 45 && windKmh < 15) {
      label = "Cool and crisp";
      summary = `Fresh and dry at ${Math.round(refTemp)}°C with low humidity — the clear, crisp kind of cool.`;
    } else if (windKmh >= 18) {
      label = "Cool and breezy";
      summary = `Cool at ${Math.round(refTemp)}°C, and the ${Math.round(windKmh)} km/h wind makes it feel sharper. A layer helps.`;
    } else {
      label = "Cool";
      summary = `Cool at ${Math.round(refTemp)}°C. A light jacket should be enough for most people.`;
    }
  } else {
    tone = "cold";
    label = "Cold";
    summary = `Cold at ${Math.round(refTemp)}°C${windKmh >= 15 ? ` with a ${Math.round(windKmh)} km/h wind making it feel sharper` : ""}. Dress in layers.`;
  }

  // Nuance: how feels-like departs from the thermometer.
  let nuance: string | undefined;
  if (
    usedApparent &&
    current.temperatureC != null &&
    Math.abs((current.apparentTemperatureC as number) - current.temperatureC) >= 3
  ) {
    nuance =
      (current.apparentTemperatureC as number) > current.temperatureC
        ? "It feels warmer than the thermometer says — humidity is amplifying the heat."
        : "It feels cooler than the thermometer says — wind and/or humidity are pulling heat away.";
  }

  if (missing.length) {
    summary += ` (Note: ${missing.join(", ")} unavailable — description uses the values that are present.)`;
  }

  void aqNow; // air quality deliberately not folded into the "feel" label

  return {
    label,
    tone,
    summary,
    factors,
    nuance,
    usedApparentTemperature: usedApparent,
    missing,
    disclaimer: DISCLAIMER,
  };
}

interface HourlyWeatherLike {
  humidityPct?: number | null;
  windSpeedKmh?: number | null;
  precipitationProbabilityPct?: number | null;
  uvIndex?: number | null;
}
