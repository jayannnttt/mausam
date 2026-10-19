/**
 * Mausam Sense — canonical internal data model.
 *
 * Every provider response (Open-Meteo, IMD, demo fixtures) is normalized into
 * these structures before it reaches the UI. All temperatures are °C, wind in
 * km/h, precipitation in mm, concentrations in µg/m³, visibility in metres.
 * Unit conversion happens only at presentation time.
 */

export type DataMode = "LIVE" | "DEMO" | "UNAVAILABLE";

export type LocationSource =
  | "open-meteo-geocoding"
  | "manual"
  | "demo-fixture"
  | "device";

export interface GeoLocation {
  /** Stable id used for persistence (geocoding id or synthetic manual id). */
  id: string;
  name: string;
  /** State / province (admin1) when known. */
  admin1?: string;
  /** District (admin2) when known — important for IMD district warnings. */
  admin2?: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population?: number;
  source: LocationSource;
}

export interface HourlyWeather {
  /** ISO local time in the location's timezone, e.g. 2026-10-19T14:00 */
  time: string;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  humidityPct: number | null;
  precipitationProbabilityPct: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  uvIndex: number | null;
  visibilityM: number | null;
  weatherCode: number | null;
}

export interface HourlyAirQuality {
  time: string;
  /** PM2.5 mass concentration, µg/m³ (CAMS model estimate unless noted). */
  pm25: number | null;
  pm10: number | null;
  ozone: number | null;
  nitrogenDioxide: number | null;
  /** US EPA AQI — NOT India's CPCB AQI. */
  usAqi: number | null;
  /** European AQI — NOT India's CPCB AQI. */
  europeanAqi: number | null;
}

export interface DailyWeather {
  /** ISO date, e.g. 2026-10-19 */
  date: string;
  weatherCode: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationProbabilityMaxPct: number | null;
  precipitationSumMm: number | null;
}

export interface CurrentWeather {
  /** ISO local time of this value. */
  time: string;
  /**
   * True when the value comes from a past-hour reanalysis/observation slot,
   * false when it is the forecast model's analysis for the current hour.
   * Open-Meteo `current` is a model analysis — never labelled as a ground
   * station observation.
   */
  isPastObservation: boolean;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
  uvIndex?: number | null;
}

export type WarningSeverity = "red" | "orange" | "yellow" | "unknown";

export interface WeatherWarning {
  id: string;
  /** Warning category, e.g. "Heavy Rain", "Heat Wave", "Thunderstorm". */
  type: string;
  headline: string;
  severity: WarningSeverity;
  affectedArea: string;
  effectiveFrom: string;
  effectiveTo: string;
  issuingAuthority: string;
  sourceUrl?: string;
  detail?: string;
  /**
   * MUST be true for any warning generated from demo/synthetic data.
   * The UI renders a DEMO banner for these and never presents them as real.
   */
  isDemo: boolean;
}

export interface AgriculturalAdvisory {
  id: string;
  title: string;
  issuingOrganization: string;
  issueDate: string;
  applicableLocation: string;
  summary: string;
  sourceUrl?: string;
  isDemo: boolean;
}

export interface ProviderAttribution {
  name: string;
  detail?: string;
  url?: string;
}

export interface WeatherDataset {
  location: GeoLocation;
  mode: DataMode;
  /** Human-readable explanation whenever mode is not LIVE. */
  modeReason?: string;
  timezone: string;
  utcOffsetSeconds: number;
  /** ISO timestamp when this dataset was assembled. */
  fetchedAt: string;
  providers: {
    weather?: ProviderAttribution;
    airQuality?: ProviderAttribution;
    warnings?: ProviderAttribution;
    advisories?: ProviderAttribution;
  };
  current?: CurrentWeather;
  hourly: HourlyWeather[];
  hourlyAirQuality?: HourlyAirQuality[];
  daily: DailyWeather[];
  warnings: WeatherWarning[];
  advisories: AgriculturalAdvisory[];
  /**
   * Non-fatal provider issues, e.g. "air-quality service returned no data".
   * Surfaced in the UI instead of being silently dropped.
   */
  notes: string[];
}

/* --------------------------- preferences model --------------------------- */

export type InterestKey =
  | "outdoor"
  | "farming"
  | "comfort"
  | "commuting";

export const INTERESTS: { key: InterestKey; label: string; blurb: string }[] = [
  {
    key: "outdoor",
    label: "Outdoor exercise & air quality",
    blurb: "Best windows for running, walking, cycling",
  },
  {
    key: "farming",
    label: "Farming & gardening",
    blurb: "Rainfall outlook and planning signals",
  },
  {
    key: "comfort",
    label: "General weather comfort",
    blurb: "How the weather actually feels",
  },
  {
    key: "commuting",
    label: "Commuting & travel",
    blurb: "Rain, heat and visibility on the road",
  },
];

export interface Preferences {
  version: 1;
  locations: GeoLocation[];
  selectedLocationId: string | null;
  interests: InterestKey[];
  /** Heightened air-quality awareness (no medical diagnosis required). */
  heightenedAqAwareness: boolean;
  temperatureUnit: "C" | "F";
  windUnit: "kmh" | "mph";
  timeFormat: "12h" | "24h";
  /** "auto" tries live providers and falls back to demo. */
  dataMode: "auto" | "live" | "demo";
  onboarded: boolean;
}
