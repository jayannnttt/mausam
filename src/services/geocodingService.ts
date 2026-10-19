/** City search via the Open-Meteo geocoding API (keyless, tested working). */

import type { GeoLocation } from "../types/weather";
import { fetchJson } from "./httpClient";

interface GeocodingResponse {
  results?: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    elevation?: number;
    feature_code: string;
    country_code: string;
    country: string;
    admin1?: string;
    admin2?: string;
    timezone: string;
    population?: number;
  }[];
}

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<GeoLocation[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${ENDPOINT}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
  void signal; // fetchJson manages its own timeout; AbortSignal wiring kept minimal
  const data = await fetchJson<GeocodingResponse>(url, { retries: 1 });
  return (data.results ?? []).map((r) => ({
    id: String(r.id),
    name: r.name,
    admin1: r.admin1,
    admin2: r.admin2,
    country: r.country,
    countryCode: r.country_code,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    population: r.population,
    source: "open-meteo-geocoding" as const,
  }));
}

/** Fallback location when the user types coordinates manually. */
export function manualLocation(
  name: string,
  latitude: number,
  longitude: number,
): GeoLocation {
  return {
    id: `manual-${latitude.toFixed(3)},${longitude.toFixed(3)}`,
    name: name.trim() || `Custom point (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
    country: "",
    countryCode: "",
    latitude,
    longitude,
    timezone: "auto",
    source: "manual",
  };
}
