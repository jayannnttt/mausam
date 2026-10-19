/** Time and unit helpers. All display formatting funnels through here. */

import type { Preferences } from "../types/weather";

/**
 * Get the wall-clock parts for an instant in a specific IANA timezone.
 */
export function zonedParts(
  iso: string | Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl can report hour 24 at midnight in some environments.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Current local time (hour+minute) in the given timezone. */
export function zonedNow(timeZone: string): { hour: number; minute: number; date: string } {
  const p = zonedParts(new Date(), timeZone);
  return {
    hour: p.hour,
    minute: p.minute,
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format an hour. Accepts either an ISO local datetime string
 * ("2026-10-19T14:00") or discrete hour + minute values.
 */
export function formatHour(
  isoOrHour: string | number,
  minuteOrFormat: number | "12h" | "24h",
  maybeFormat?: "12h" | "24h",
): string {
  if (typeof isoOrHour === "string") {
    const [h, m] = isoOrHour.slice(11, 16).split(":").map(Number);
    return formatHour(h, m, minuteOrFormat as "12h" | "24h");
  }
  const hour = isoOrHour;
  const minute = typeof minuteOrFormat === "number" ? minuteOrFormat : 0;
  const timeFormat = maybeFormat ?? "12h";
  if (timeFormat === "24h") return `${pad(hour)}:${pad(minute)}`;
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${pad(minute)} ${suffix}`;
}

/** "06:00 – 09:00" style range label from two ISO local times. */
export function formatRange(
  startIso: string,
  endIso: string,
  timeFormat: "12h" | "24h",
): string {
  return `${formatHour(startIso, timeFormat)} – ${formatHour(endIso, timeFormat)}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Day label for a yyyy-mm-dd date: "Today", "Tomorrow", or weekday name. */
export function dayLabel(dateIso: string, todayIso: string): string {
  if (dateIso === todayIso) return "Today";
  const t = new Date(`${dateIso}T00:00:00`);
  const today = new Date(`${todayIso}T00:00:00`);
  const diffDays = Math.round((t.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 1) return "Tomorrow";
  return DAY_NAMES[t.getDay()];
}

export function formatTemp(celsius: number | null, unit: "C" | "F"): string {
  if (celsius == null || Number.isNaN(celsius)) return "—";
  const v = unit === "C" ? celsius : celsius * 1.8 + 32;
  return `${Math.round(v)}°`;
}

export function tempUnitLabel(unit: "C" | "F"): string {
  return unit === "C" ? "°C" : "°F";
}

export function formatWind(kmh: number | null, unit: "kmh" | "mph"): string {
  if (kmh == null || Number.isNaN(kmh)) return "—";
  const v = unit === "kmh" ? kmh : kmh * 0.621371;
  const label = unit === "kmh" ? "km/h" : "mph";
  return `${Math.round(v)} ${label}`;
}

/** Visibility in a readable distance unit (km when >= 1 km). */
export function formatVisibility(metres: number | null): string {
  if (metres == null || Number.isNaN(metres)) return "—";
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

/** "3:45 PM" for the current time in a location timezone. */
export function locationClock(
  timeZone: string,
  timeFormat: "12h" | "24h",
): string {
  const p = zonedNow(timeZone);
  return formatHour(p.hour, p.minute, timeFormat);
}

/** yyyy-mm-dd for today in a location timezone. */
export function todayIso(timeZone: string): string {
  return zonedNow(timeZone).date;
}
