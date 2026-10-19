/**
 * Open-Meteo air-quality service → normalized HourlyAirQuality[].
 * API docs: https://open-meteo.com/en/docs/air-quality-api
 *
 * DATA PROVENANCE (surfaced in the UI):
 * - Pollutant concentrations are CAMS (Copernicus) global model estimates.
 * - `us_aqi` is a US EPA AQI conversion of those estimates — NOT India's
 *   CPCB National AQI. `european_aqi` is the European AQI. Neither is ever
 *   relabelled as the Indian index.
 */

import type { GeoLocation, HourlyAirQuality } from "../types/weather";
import { fetchJson } from "./httpClient";

interface AirQualityResponse {
  hourly?: {
    time: string[];
    pm2_5: (number | null)[];
    pm10: (number | null)[];
    ozone: (number | null)[];
    nitrogen_dioxide: (number | null)[];
    us_aqi?: (number | null)[];
    european_aqi?: (number | null)[];
  };
}

const ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";

export function buildAirQualityUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: "pm2_5,pm10,ozone,nitrogen_dioxide,us_aqi,european_aqi",
    timezone: "auto",
    forecast_days: "3",
  });
  return `${ENDPOINT}?${params.toString()}`;
}

export async function fetchAirQuality(
  loc: GeoLocation,
): Promise<HourlyAirQuality[]> {
  const data = await fetchJson<AirQualityResponse>(buildAirQualityUrl(loc.latitude, loc.longitude));
  const h = data.hourly;
  if (!h?.time?.length) return [];
  const out: HourlyAirQuality[] = [];
  for (let i = 0; i < h.time.length; i++) {
    out.push({
      time: h.time[i],
      pm25: h.pm2_5?.[i] ?? null,
      pm10: h.pm10?.[i] ?? null,
      ozone: h.ozone?.[i] ?? null,
      nitrogenDioxide: h.nitrogen_dioxide?.[i] ?? null,
      usAqi: h.us_aqi?.[i] ?? null,
      europeanAqi: h.european_aqi?.[i] ?? null,
    });
  }
  return out;
}
