/**
 * Live / DEMO separation guarantees:
 * - demo fixtures are always labelled DEMO with isDemo warnings;
 * - demo mode refuses cities without fixtures (no silent synthesis);
 * - live failure falls back to demo with an explicit reason;
 * - demo and live values are never mixed inside one dataset.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_LOCATIONS, getDemoDataset } from "./demoDataService";
import { loadDataset } from "./dataOrchestrator";
import { manualLocation } from "./geocodingService";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demoDataService", () => {
  it("produces a DEMO dataset for Chennai with coherent data", () => {
    const ds = getDemoDataset(DEMO_LOCATIONS[0])!;
    expect(ds).not.toBeNull();
    expect(ds.mode).toBe("DEMO");
    expect(ds.hourly.length).toBeGreaterThanOrEqual(48);
    expect(ds.daily.length).toBe(7);
    expect(ds.current).toBeDefined();
    expect(ds.hourlyAirQuality?.length).toBe(ds.hourly.length);
  });

  it("flags every demo warning and advisory as demo", () => {
    const ds = getDemoDataset(DEMO_LOCATIONS[0])!;
    ds.warnings.forEach((w) => expect(w.isDemo).toBe(true));
    const tanjavur = getDemoDataset(DEMO_LOCATIONS[2])!;
    tanjavur.advisories.forEach((a) => expect(a.isDemo).toBe(true));
    tanjavur.warnings.forEach((w) => expect(w.isDemo).toBe(true));
  });

  it("varies conditions by hour so rankings can differ", () => {
    const ds = getDemoDataset(DEMO_LOCATIONS[0])!;
    const scores = new Set(
      ds.hourly.slice(0, 24).map((h) => h.precipitationProbabilityPct),
    );
    expect(scores.size).toBeGreaterThan(5);
  });

  it("returns null for cities without fixtures", () => {
    const london = manualLocation("London", 51.5, -0.12);
    expect(getDemoDataset(london)).toBeNull();
  });

  it("marks the dataset reason as synthetic", () => {
    const ds = getDemoDataset(DEMO_LOCATIONS[1])!;
    expect(ds.modeReason).toMatch(/synthetic/i);
    expect(ds.notes.join(" ")).toMatch(/DEMO MODE/);
  });
});

describe("loadDataset — demo mode", () => {
  it("serves fixtures in demo mode without touching the network", async () => {
    const ds = await loadDataset(DEMO_LOCATIONS[1], { preferDemo: true });
    expect(ds.mode).toBe("DEMO");
  });

  it("refuses non-fixture cities in demo mode instead of inventing data", async () => {
    const london = manualLocation("London", 51.5, -0.12);
    const ds = await loadDataset(london, { preferDemo: true });
    expect(ds.mode).toBe("UNAVAILABLE");
    expect(ds.hourly).toHaveLength(0);
    expect(ds.modeReason).toMatch(/fixtures/i);
  });
});

describe("loadDataset — live mode with failing network", () => {
  it("falls back to demo with an explicit reason for fixture cities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const ds = await loadDataset(DEMO_LOCATIONS[0], { preferDemo: false });
    expect(ds.mode).toBe("DEMO");
    expect(ds.modeReason).toMatch(/Live data could not be retrieved/i);
    // Demo warnings stay flagged even after fallback.
    ds.warnings.forEach((w) => expect(w.isDemo).toBe(true));
  });

  it("returns UNAVAILABLE for non-fixture cities when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const london = manualLocation("London", 51.5, -0.12);
    const ds = await loadDataset(london, { preferDemo: false });
    expect(ds.mode).toBe("UNAVAILABLE");
    expect(ds.modeReason).toMatch(/Could not load live weather data/i);
  });
});

describe("loadDataset — live mode with working network (mocked providers)", () => {
  it("normalizes provider responses and never mixes in demo values", async () => {
    const hourlyTimes = Array.from({ length: 48 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 19, i));
      return d.toISOString().slice(0, 13) + ":00";
    });
    const forecast = {
      timezone: "Asia/Kolkata",
      utc_offset_seconds: 19800,
      current: {
        time: "2026-10-19T09:00",
        temperature_2m: 31.2,
        apparent_temperature: 36.4,
        relative_humidity_2m: 74,
        precipitation: 0,
        weather_code: 2,
        wind_speed_10m: 12,
      },
      hourly: {
        time: hourlyTimes,
        temperature_2m: hourlyTimes.map(() => 30),
        apparent_temperature: hourlyTimes.map(() => 34),
        relative_humidity_2m: hourlyTimes.map(() => 70),
        precipitation_probability: hourlyTimes.map(() => 12),
        precipitation: hourlyTimes.map(() => 0),
        wind_speed_10m: hourlyTimes.map(() => 11),
        uv_index: hourlyTimes.map(() => 4),
        visibility: hourlyTimes.map(() => 9000),
        weather_code: hourlyTimes.map(() => 2),
      },
      daily: {
        time: ["2026-10-19"],
        weather_code: [2],
        temperature_2m_max: [33],
        temperature_2m_min: [25],
        precipitation_probability_max: [20],
        precipitation_sum: [0.4],
      },
    };
    const airQuality = {
      hourly: {
        time: hourlyTimes,
        pm2_5: hourlyTimes.map(() => 18),
        pm10: hourlyTimes.map(() => 30),
        ozone: hourlyTimes.map(() => 44),
        nitrogen_dioxide: hourlyTimes.map(() => 9),
        us_aqi: hourlyTimes.map(() => 55),
        european_aqi: hourlyTimes.map(() => 35),
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("air-quality")) {
          return Promise.resolve(
            new Response(JSON.stringify(airQuality), { status: 200 }),
          );
        }
        if (url.includes("/v1/forecast")) {
          return Promise.resolve(
            new Response(JSON.stringify(forecast), { status: 200 }),
          );
        }
        // IMD warning endpoint without a key → 401, matching reality.
        return Promise.resolve(
          new Response(JSON.stringify({ error: "API key missing" }), { status: 401 }),
        );
      }),
    );

    const chennai = manualLocation("Chennai", 13.08, 80.27);
    const ds = await loadDataset(chennai, { preferDemo: false });
    expect(ds.mode).toBe("LIVE");
    expect(ds.providers.weather?.name).toMatch(/Open-Meteo/);
    expect(ds.current?.temperatureC).toBe(31.2);
    expect(ds.hourlyAirQuality?.[0].pm25).toBe(18);
    // No demo warnings can leak into a LIVE dataset.
    expect(ds.warnings.every((w) => !w.isDemo)).toBe(true);
    // IMD note is surfaced rather than silently dropped.
    expect(ds.notes.join(" ")).toMatch(/IMD|warning/i);
  });
});
