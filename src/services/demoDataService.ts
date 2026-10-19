/**
 * Mausam Sense — demonstration data service.
 *
 * Synthetic but coherent fixtures for Chennai, Bengaluru and Thanjavur so the
 * app remains fully demonstrable offline or when a provider is unreachable.
 *
 * RULES ENFORCED:
 * - Every dataset produced here carries mode = "DEMO".
 * - Every warning / advisory produced here carries isDemo = true (rendered
 *   with a DEMO banner, never as an official-looking alert).
 * - Demo data lives ONLY here — no hardcoded weather values in components.
 * - Values are illustrative and must never be presented as actual conditions.
 *
 * The curves are generated from seeded PRNGs + diurnal functions so the shape
 * is stable across refreshes, with these scenario characteristics:
 * - Chennai: hot & humid, afternoon/evening thunderstorms on days 1–2,
 *   moderate PM2.5 with morning and evening traffic peaks → activity
 *   rankings vary by hour.
 * - Bengaluru: pleasant, dry, morning PM2.5 spike → morning vs noon contrast.
 * - Thanjavur: farming scenario — a rain event arriving ~30 h out.
 */

import type {
  AgriculturalAdvisory,
  CurrentWeather,
  DailyWeather,
  GeoLocation,
  HourlyAirQuality,
  HourlyWeather,
  WeatherDataset,
  WeatherWarning,
} from "../types/weather";
import { zonedNow } from "../utils/format";

/* ------------------------------ fixtures ------------------------------ */

export const DEMO_LOCATIONS: GeoLocation[] = [
  {
    id: "demo-chennai",
    name: "Chennai",
    admin1: "Tamil Nadu",
    admin2: "Chennai district",
    country: "India",
    countryCode: "IN",
    latitude: 13.0878,
    longitude: 80.2785,
    timezone: "Asia/Kolkata",
    population: 4681087,
    source: "demo-fixture",
  },
  {
    id: "demo-bengaluru",
    name: "Bengaluru",
    admin1: "Karnataka",
    admin2: "Bengaluru Urban",
    country: "India",
    countryCode: "IN",
    latitude: 12.9716,
    longitude: 77.5946,
    timezone: "Asia/Kolkata",
    population: 8443675,
    source: "demo-fixture",
  },
  {
    id: "demo-thanjavur",
    name: "Thanjavur",
    admin1: "Tamil Nadu",
    admin2: "Thanjavur district",
    country: "India",
    countryCode: "IN",
    latitude: 10.787,
    longitude: 79.1378,
    timezone: "Asia/Kolkata",
    population: 256255,
    source: "demo-fixture",
  },
];

interface CityProfile {
  key: string;
  tempMinC: number;
  tempMaxC: number;
  humidityMin: number;
  humidityMax: number;
  windBase: number;
  windAmp: number;
  /** uv peak at solar noon */
  uvPeak: number;
  pm25Base: number;
  pm25Amp: number;
  /** traffic-peak inflation of PM2.5 */
  pm25PeakBoost: number;
  /** Rain event: start hour offset from now, duration, intensity mm/h. */
  rainEvent?: { startHour: number; durationHours: number; peakMm: number };
  /** Afternoon convective showers (start hour, probability). */
  convective?: { startHour: number; probability: number; peakMm: number };
}

const PROFILES: Record<string, CityProfile> = {
  chennai: {
    key: "chennai",
    tempMinC: 25,
    tempMaxC: 33,
    humidityMin: 62,
    humidityMax: 88,
    windBase: 12,
    windAmp: 8,
    uvPeak: 9,
    pm25Base: 28,
    pm25Amp: 10,
    pm25PeakBoost: 26,
    convective: { startHour: 14, probability: 0.55, peakMm: 7 },
  },
  bengaluru: {
    key: "bengaluru",
    tempMinC: 17,
    tempMaxC: 27,
    humidityMin: 42,
    humidityMax: 78,
    windBase: 10,
    windAmp: 6,
    uvPeak: 8,
    pm25Base: 24,
    pm25Amp: 14,
    pm25PeakBoost: 40, // strong morning traffic inversion
  },
  thanjavur: {
    key: "thanjavur",
    tempMinC: 24,
    tempMaxC: 34,
    humidityMin: 55,
    humidityMax: 85,
    windBase: 9,
    windAmp: 6,
    uvPeak: 9,
    pm25Base: 34,
    pm25Amp: 12,
    pm25PeakBoost: 22,
    rainEvent: { startHour: 30, durationHours: 12, peakMm: 6 },
  },
};

/* ----------------------------- generation ----------------------------- */

/** Deterministic PRNG (mulberry32) so demo curves are stable per city+day. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Diurnal curve: min around 03:00, max around 15:00. */
function diurnal(hourOfDay: number, min: number, max: number): number {
  const phase = Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI);
  return min + ((max - min) * (phase + 1)) / 2;
}

function isoAt(baseDate: Date, addHours: number): string {
  const d = new Date(baseDate.getTime() + addHours * 3_600_000);
  return d.toISOString().slice(0, 13) + ":00";
}

/** Generate the whole demo dataset for a fixture city. */
export function buildDemoDataset(loc: GeoLocation): WeatherDataset | null {
  const profileKey = Object.keys(PROFILES).find(
    (k) => loc.name.toLowerCase().includes(k === "bengaluru" ? "bengaluru" : k),
  );
  const profile = PROFILES[profileKey ?? ""];
  if (!profile) return null;

  // Start "now" at the current hour in the city's timezone.
  const now = zonedNow(loc.timezone);
  const base = new Date(`${now.date}T${String(now.hour).padStart(2, "0")}:00:00Z`);
  const rnd = mulberry32(seedFrom(`${profile.key}-${now.date}`));

  const HOURS = 168; // 7 days of hourly demo data
  const hourly: HourlyWeather[] = [];
  const hourlyAq: HourlyAirQuality[] = [];

  for (let i = 0; i < HOURS; i++) {
    const time = isoAt(base, i);
    const hourOfDay = (now.hour + i) % 24;
    const dayIndex = Math.floor((now.hour + i) / 24);

    const temperatureC =
      Math.round(diurnal(hourOfDay, profile.tempMinC, profile.tempMaxC) * 10) / 10;
    // Humidity inversely tracks temperature.
    const humidityPct = Math.round(
      diurnal(hourOfDay, profile.humidityMax, profile.humidityMin) + (rnd() * 6 - 3),
    );

    // Rain: convective afternoon showers (Chennai) and/or a frontal event.
    let precipitationMm = 0;
    let precipitationProbabilityPct = Math.max(0, Math.round(rnd() * 15));
    let weatherCode: number = hourOfDay >= 6 && hourOfDay < 18 ? 1 : 0;

    if (
      profile.convective &&
      dayIndex < 2 &&
      hourOfDay >= profile.convective.startHour &&
      hourOfDay < profile.convective.startHour + 4 &&
      rnd() < profile.convective.probability
    ) {
      const intensity = profile.convective.peakMm * (0.4 + rnd() * 0.8);
      precipitationMm = Math.round(intensity * 10) / 10;
      precipitationProbabilityPct = Math.round(60 + rnd() * 35);
      weatherCode = intensity > 4 ? 95 : intensity > 1.5 ? 80 : 61;
    }

    if (profile.rainEvent) {
      const re = profile.rainEvent;
      const rel = i - re.startHour;
      if (rel >= 0 && rel < re.durationHours) {
        // Bell-shaped intensity across the event.
        const shape = Math.sin(((rel + 0.5) / re.durationHours) * Math.PI);
        const intensity = re.peakMm * shape * (0.6 + rnd() * 0.6);
        precipitationMm = Math.max(precipitationMm, Math.round(intensity * 10) / 10);
        precipitationProbabilityPct = Math.max(
          precipitationProbabilityPct,
          Math.round(55 + shape * 40),
        );
        weatherCode = shape > 0.5 ? 63 : shape > 0.2 ? 61 : 51;
      } else if (rel >= -6 && rel < 0) {
        precipitationProbabilityPct = Math.max(
          precipitationProbabilityPct,
          Math.round(30 + rnd() * 25),
        );
      }
    }

    // UV: clear-sky-ish peak scaled down by cloud/rain.
    const clearUv = Math.max(0, Math.sin(((hourOfDay - 6) / 12) * Math.PI)) * profile.uvPeak;
    const uvIndex =
      Math.round(clearUv * (weatherCode >= 51 ? 0.45 : 1) * (0.85 + rnd() * 0.3) * 10) / 10;

    const windSpeedKmh =
      Math.round((profile.windBase + Math.sin((hourOfDay / 24) * 2 * Math.PI) * profile.windAmp + rnd() * 4) * 10) / 10;

    // Apparent temperature: humidity-driven heat amplification in daytime.
    const apparentTemperatureC =
      Math.round(
        (temperatureC +
          (humidityPct > 60 && temperatureC > 26 ? (humidityPct - 60) * 0.09 : 0) -
          (windSpeedKmh > 18 ? (windSpeedKmh - 18) * 0.05 : 0)) *
          10,
      ) / 10;

    const visibilityM =
      weatherCode === 45 || weatherCode === 48
        ? 800
        : weatherCode >= 61
          ? 4000 + rnd() * 3000
          : 9000 + rnd() * 8000;

    hourly.push({
      time,
      temperatureC,
      apparentTemperatureC,
      humidityPct: Math.min(99, Math.max(20, humidityPct)),
      precipitationProbabilityPct,
      precipitationMm,
      windSpeedKmh,
      uvIndex,
      visibilityM: Math.round(visibilityM),
      weatherCode,
    });

    // PM2.5: base diurnal + traffic peaks (07–10, 18–21) + noise.
    const trafficBoost =
      ((hourOfDay >= 7 && hourOfDay < 10) || (hourOfDay >= 18 && hourOfDay < 21)
        ? profile.pm25PeakBoost
        : 0) * (0.7 + rnd() * 0.5);
    // Rain washes particles out of the air.
    const washout = precipitationMm > 0.5 ? 0.55 : 1;
    const pm25 = Math.max(
      3,
      Math.round((profile.pm25Base + trafficBoost + (rnd() * profile.pm25Amp - profile.pm25Amp / 2)) * washout * 10) / 10,
    );
    const pm10 = Math.round(pm25 * (1.35 + rnd() * 0.25) * 10) / 10;
    // Coarse US EPA-style scaling of the same model estimate (labelled as such
    // in the UI): used only as a secondary reference, never called CPCB AQI.
    const usAqi = Math.round(pm25 * 1.7 + 8 + rnd() * 6);
    const europeanAqi = Math.round(pm25 * 1.5 + 5 + rnd() * 5);

    hourlyAq.push({
      time,
      pm25,
      pm10,
      ozone: Math.round(40 + rnd() * 30),
      nitrogenDioxide: Math.round(6 + trafficBoost * 0.35 + rnd() * 5),
      usAqi,
      europeanAqi,
    });
  }

  // Current = first hour, presented like Open-Meteo's analysis value.
  const h0 = hourly[0];
  const current: CurrentWeather = {
    time: h0.time,
    isPastObservation: false,
    temperatureC: h0.temperatureC,
    apparentTemperatureC: h0.apparentTemperatureC,
    humidityPct: h0.humidityPct,
    precipitationMm: h0.precipitationMm,
    weatherCode: h0.weatherCode,
    windSpeedKmh: h0.windSpeedKmh,
    uvIndex: h0.uvIndex,
  };

  // Daily rollups.
  const daily: DailyWeather[] = [];
  for (let d = 0; d < 7; d++) {
    const slice = hourly.slice(d * 24, (d + 1) * 24);
    if (!slice.length) break;
    const temps = slice.map((s) => s.temperatureC).filter((v): v is number => v != null);
    daily.push({
      date: slice[0].time.slice(0, 10),
      weatherCode: slice.reduce(
        (worst, s) => Math.max(worst, s.weatherCode ?? 0),
        0,
      ) || null,
      tempMaxC: temps.length ? Math.max(...temps) : null,
      tempMinC: temps.length ? Math.min(...temps) : null,
      precipitationProbabilityMaxPct: Math.max(
        ...slice.map((s) => s.precipitationProbabilityPct ?? 0),
      ),
      precipitationSumMm:
        Math.round(slice.reduce((s, x) => s + (x.precipitationMm ?? 0), 0) * 10) / 10,
    });
  }

  // Demo warnings — ALWAYS isDemo: true, rendered with a DEMO banner.
  const warnings: WeatherWarning[] = [];
  if (profile.key === "chennai") {
    warnings.push({
      id: "demo-chennai-heavy-rain",
      type: "Heavy Rain",
      headline: "Heavy rain warning for Chennai and suburbs",
      severity: "orange",
      affectedArea: "Chennai and Chengalpattu surroundings",
      effectiveFrom: `${now.date} 14:00`,
      effectiveTo: `${now.date} 23:59`,
      issuingAuthority: "IMD (simulated for demonstration)",
      detail:
        "DEMO ONLY — this warning is generated from synthetic data to demonstrate how an official warning would be displayed. It is not a real IMD bulletin.",
      isDemo: true,
    });
  }
  if (profile.key === "thanjavur") {
    warnings.push({
      id: "demo-thanjavur-thunderstorm",
      type: "Thunderstorm",
      headline: "Thunderstorm with lightning likely (demo)",
      severity: "yellow",
      affectedArea: "Thanjavur and delta districts",
      effectiveFrom: `${now.date} 15:00`,
      effectiveTo: `${now.date} 21:30`,
      issuingAuthority: "IMD (simulated for demonstration)",
      detail:
        "DEMO ONLY — synthetic warning showing severity highlighting. Not a real IMD bulletin.",
      isDemo: true,
    });
  }

  // Demo agricultural advisory for Thanjavur.
  const advisories: AgriculturalAdvisory[] = [];
  if (profile.key === "thanjavur") {
    advisories.push({
      id: "demo-tanjavur-kharif-advisory",
      title: "District weather advisory for standing kharif crops (DEMO)",
      issuingOrganization: "TNAU / District Agriculture Department (simulated)",
      issueDate: now.date,
      applicableLocation: "Thanjavur district",
      summary:
        "DEMO ONLY — a rain spell is indicated in the coming two days. Plan harvesting and spraying around the drier gaps, and avoid field operations during thunderstorm hours. This is synthetic content for demonstration, not real agricultural advice.",
      isDemo: true,
    });
  }

  return {
    location: { ...loc, source: "demo-fixture" },
    mode: "DEMO",
    modeReason: "Synthetic demonstration data — NOT actual conditions.",
    timezone: loc.timezone,
    utcOffsetSeconds: 19800,
    fetchedAt: new Date().toISOString(),
    providers: {
      weather: {
        name: "Mausam Sense demo fixtures",
        detail: "Synthetic data generated locally for demonstration",
      },
      airQuality: {
        name: "Mausam Sense demo fixtures",
        detail: "Synthetic pollutant values — not measurements",
      },
      warnings: {
        name: "Simulated warnings",
        detail: "Demo warnings are always marked DEMO",
      },
    },
    current,
    hourly,
    hourlyAirQuality: hourlyAq,
    daily,
    warnings,
    advisories,
    notes: [
      "DEMO MODE: all values on this screen are synthetic and must not be used for real-world decisions.",
    ],
  };
}

/** Look up a fixture by location name or id. Returns null for other cities. */
export function getDemoDataset(loc: GeoLocation): WeatherDataset | null {
  const match = DEMO_LOCATIONS.find(
    (d) =>
      d.id === loc.id ||
      d.name.toLowerCase() === loc.name.toLowerCase(),
  );
  if (!match) return null;
  return buildDemoDataset(match);
}
