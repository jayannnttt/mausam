/** WMO weather interpretation codes → human text + icon key. */

import type { LucideIcon } from "lucide-react";
import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Haze,
  Tornado,
} from "lucide-react";

export type IconKey =
  | "clear-day"
  | "clear-night"
  | "partly-day"
  | "partly-night"
  | "overcast"
  | "drizzle"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "dust"
  | "tornado";

const CODE_TEXT: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Moderate showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
};

export function weatherCodeText(code: number | null | undefined): string {
  if (code == null) return "Condition unavailable";
  return CODE_TEXT[code] ?? `Weather code ${code}`;
}

export function weatherCodeIcon(
  code: number | null | undefined,
  isNight = false,
): IconKey {
  if (code == null) return isNight ? "clear-night" : "overcast";
  if (code === 0) return isNight ? "clear-night" : "clear-day";
  if (code === 1) return isNight ? "clear-night" : "partly-day";
  if (code === 2) return isNight ? "clear-night" : "partly-day";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95) return "storm";
  return "overcast";
}

const ICONS: Record<IconKey, LucideIcon> = {
  "clear-day": Sun,
  "clear-night": Moon,
  "partly-day": CloudSun,
  "partly-night": CloudMoon,
  overcast: Cloud,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  storm: CloudLightning,
  snow: CloudSnow,
  fog: CloudFog,
  dust: Haze,
  tornado: Tornado,
};

export function WeatherIcon({
  code,
  isNight = false,
  className,
}: {
  code: number | null | undefined;
  isNight?: boolean;
  className?: string;
}) {
  const Icon = ICONS[weatherCodeIcon(code, isNight)];
  return <Icon className={className} aria-hidden="true" />;
}

/** Heuristic: is it night at this ISO local time? (18:30–06:00) */
export function isNightTime(isoLocal: string): boolean {
  const hour = Number(isoLocal.slice(11, 13));
  return hour >= 18 || hour < 6;
}

/** Does this WMO code mean actual precipitation is happening? */
export function isRainCode(code: number | null | undefined): boolean {
  if (code == null) return false;
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

/** Does this WMO code include thunderstorms? */
export function isStormCode(code: number | null | undefined): boolean {
  return code != null && code >= 95;
}

/** Is this a fog/low-visibility code? */
export function isFogCode(code: number | null | undefined): boolean {
  return code === 45 || code === 48;
}
