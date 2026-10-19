/**
 * Data orchestrator: loads a complete WeatherDataset for a location,
 * enforcing strict separation between LIVE, DEMO and UNAVAILABLE states.
 *
 * - LIVE: at least weather data was retrieved from Open-Meteo. Air quality /
 *   warnings may be missing and are reported in `notes` (never silently).
 * - DEMO: live fetch failed (or forced) AND the city has a demo fixture.
 *   Every module renders a DEMO banner from dataset.mode.
 * - UNAVAILABLE: nothing usable could be produced. The UI shows an error
 *   state with retry + "switch to demo" actions.
 *
 * Live and demo values are NEVER mixed inside one dataset.
 */

import type { GeoLocation, WeatherDataset } from "../types/weather";
import { fetchWeather } from "./weatherService";
import { fetchAirQuality } from "./airQualityService";
import { fetchOfficialWarnings, fetchAgriculturalAdvisories } from "./imdService";
import { getDemoDataset } from "./demoDataService";
import { describeError } from "./httpClient";

export interface LoadOptions {
  /** Force demo mode (user toggle). */
  preferDemo: boolean;
}

export async function loadDataset(
  loc: GeoLocation,
  opts: LoadOptions,
): Promise<WeatherDataset> {
  if (opts.preferDemo) {
    const demo = getDemoDataset(loc);
    if (demo) return demo;
    return unavailable(
      loc,
      `Demonstration fixtures cover Chennai, Bengaluru and Thanjavur only — "${loc.name}" has no demo fixture. Switch back to live mode or pick a demo city.`,
    );
  }

  try {
    const weather = await fetchWeather(loc);
    const notes: string[] = [];

    // Air quality is fetched independently; a failure degrades gracefully.
    let hourlyAirQuality: WeatherDataset["hourlyAirQuality"];
    try {
      const aq = await fetchAirQuality(loc);
      if (aq.length) {
        hourlyAirQuality = aq;
      } else {
        notes.push(
          "The air-quality provider returned no data for this location. Pollutant-based guidance is shown as unavailable.",
        );
      }
    } catch (e) {
      notes.push(`Air-quality data could not be loaded: ${describeError(e)}`);
    }

    // Official warnings (IMD) — available only with an issued key.
    const warnings: WeatherDataset["warnings"] = [];
    const imdWarnings = await fetchOfficialWarnings(loc);
    if (imdWarnings.available && imdWarnings.data) {
      warnings.push(...imdWarnings.data);
    } else if (imdWarnings.reason) {
      notes.push(imdWarnings.reason);
    }

    const advisories: WeatherDataset["advisories"] = [];
    const imdAdvisories = await fetchAgriculturalAdvisories(loc);
    if (!imdAdvisories.available && imdAdvisories.reason) {
      notes.push(imdAdvisories.reason);
    }

    return {
      location: loc,
      mode: "LIVE",
      timezone: weather.timezone,
      utcOffsetSeconds: weather.utcOffsetSeconds,
      fetchedAt: new Date().toISOString(),
      providers: {
        weather: {
          name: "Open-Meteo Forecast API",
          detail:
            "Model forecast (ICON/GFS/ECMWF blend). Current values are the model's analysis hour, not ground-station observations.",
          url: "https://open-meteo.com/",
        },
        airQuality: hourlyAirQuality
          ? {
              name: "Open-Meteo Air Quality API",
              detail:
                "CAMS (Copernicus) global model estimates. AQI values, where shown, are US EPA / European conversions — NOT India's CPCB National AQI.",
              url: "https://open-meteo.com/en/docs/air-quality-api",
            }
          : undefined,
        warnings: warnings.length
          ? {
              name: "India Meteorological Department (IMD)",
              detail: "Official district warnings via IMD's public API",
              url: "https://mausam.imd.gov.in/",
            }
          : undefined,
      },
      current: weather.current,
      hourly: weather.hourly,
      hourlyAirQuality,
      daily: weather.daily,
      warnings,
      advisories,
      notes,
    };
  } catch (e) {
    // Live failed → demo fallback if we have a fixture.
    const demo = getDemoDataset(loc);
    if (demo) {
      return {
        ...demo,
        modeReason: `Live data could not be retrieved (${describeError(e)}). Showing SYNTHETIC demo data instead — not actual conditions.`,
        notes: [
          `Live provider error: ${describeError(e)}`,
          ...demo.notes,
        ],
      };
    }
    return unavailable(
      loc,
      `Could not load live weather data (${describeError(e)}) and no demo fixture exists for this location.`,
    );
  }
}

function unavailable(loc: GeoLocation, reason: string): WeatherDataset {
  return {
    location: loc,
    mode: "UNAVAILABLE",
    modeReason: reason,
    timezone: loc.timezone,
    utcOffsetSeconds: 0,
    fetchedAt: new Date().toISOString(),
    providers: {},
    hourly: [],
    daily: [],
    warnings: [],
    advisories: [],
    notes: [],
  };
}
