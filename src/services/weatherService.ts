/**
 * Open-Meteo forecast service → normalized WeatherDataset weather part.
 * API docs: https://open-meteo.com/en/docs
 * Tested live: returns current analysis, hourly (7 days), daily (7 days).
 */

import type {
  CurrentWeather,
  DailyWeather,
  GeoLocation,
  HourlyWeather,
} from "../types/weather";
import { fetchJson } from "./httpClient";

interface ForecastResponse {
  timezone: string;
  utc_offset_seconds: number;
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: (number | null)[];
    apparent_temperature: (number | null)[];
    relative_humidity_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    precipitation: (number | null)[];
    wind_speed_10m: (number | null)[];
    uv_index: (number | null)[];
    visibility: (number | null)[];
    weather_code: (number | null)[];
  };
  daily?: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: (number | null)[];
  };
}

export interface WeatherFetchResult {
  timezone: string;
  utcOffsetSeconds: number;
  current?: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export function buildForecastUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,uv_index,visibility,weather_code",
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    timezone: "auto",
    forecast_days: "7",
  });
  return `${FORECAST_ENDPOINT}?${params.toString()}`;
}

export async function fetchWeather(loc: GeoLocation): Promise<WeatherFetchResult> {
  const data = await fetchJson<ForecastResponse>(buildForecastUrl(loc.latitude, loc.longitude));

  const h = data.hourly;
  const hourly: HourlyWeather[] = [];
  if (h?.time) {
    for (let i = 0; i < h.time.length; i++) {
      hourly.push({
        time: h.time[i],
        temperatureC: h.temperature_2m?.[i] ?? null,
        apparentTemperatureC: h.apparent_temperature?.[i] ?? null,
        humidityPct: h.relative_humidity_2m?.[i] ?? null,
        precipitationProbabilityPct: h.precipitation_probability?.[i] ?? null,
        precipitationMm: h.precipitation?.[i] ?? null,
        windSpeedKmh: h.wind_speed_10m?.[i] ?? null,
        uvIndex: h.uv_index?.[i] ?? null,
        visibilityM: h.visibility?.[i] ?? null,
        weatherCode: h.weather_code?.[i] ?? null,
      });
    }
  }

  const daily: DailyWeather[] = [];
  if (data.daily?.time) {
    for (let i = 0; i < data.daily.time.length; i++) {
      daily.push({
        date: data.daily.time[i],
        weatherCode: data.daily.weather_code?.[i] ?? null,
        tempMaxC: data.daily.temperature_2m_max?.[i] ?? null,
        tempMinC: data.daily.temperature_2m_min?.[i] ?? null,
        precipitationProbabilityMaxPct:
          data.daily.precipitation_probability_max?.[i] ?? null,
        precipitationSumMm: data.daily.precipitation_sum?.[i] ?? null,
      });
    }
  }

  let current: CurrentWeather | undefined;
  if (data.current) {
    const c = data.current;
    // Open-Meteo `current` is the model's analysis for the current time step.
    // Values at :00/:30 are the analysis hour; we never call this a station
    // observation.
    current = {
      time: c.time,
      isPastObservation: false,
      temperatureC: c.temperature_2m ?? null,
      apparentTemperatureC: c.apparent_temperature ?? null,
      humidityPct: c.relative_humidity_2m ?? null,
      precipitationMm: c.precipitation ?? null,
      weatherCode: c.weather_code ?? null,
      windSpeedKmh: c.wind_speed_10m ?? null,
    };
  }

  return {
    timezone: data.timezone ?? loc.timezone,
    utcOffsetSeconds: data.utc_offset_seconds ?? 0,
    current,
    hourly,
    daily,
  };
}
