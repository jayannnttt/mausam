import { describe, expect, it } from "vitest";
import type { HourlyWeather } from "../types/weather";
import { buildFarmOutlook, detectRainPeriods } from "./farmingEngine";
import { DEMO_LOCATIONS, buildDemoDataset } from "../services/demoDataService";

function hour(time: string, over: Partial<HourlyWeather> = {}): HourlyWeather {
  return {
    time,
    temperatureC: 30,
    apparentTemperatureC: 34,
    humidityPct: 70,
    precipitationProbabilityPct: 10,
    precipitationMm: 0,
    windSpeedKmh: 10,
    uvIndex: 5,
    visibilityM: 10000,
    weatherCode: 1,
    ...over,
  };
}

describe("detectRainPeriods", () => {
  it("groups consecutive rainy hours into one period", () => {
    const hours = [
      hour("2026-10-19T06:00", { precipitationMm: 0 }),
      hour("2026-10-19T07:00", { precipitationMm: 1.5, weatherCode: 61 }),
      hour("2026-10-19T08:00", { precipitationMm: 2.5, weatherCode: 63 }),
      hour("2026-10-19T09:00", { precipitationMm: 0 }),
    ];
    const periods = detectRainPeriods(hours);
    expect(periods).toHaveLength(1);
    expect(periods[0].hours).toBe(2);
    expect(periods[0].totalMm).toBeCloseTo(4);
  });

  it("keeps separate wet spells apart", () => {
    const hours = [
      hour("2026-10-19T06:00", { precipitationMm: 1 }),
      hour("2026-10-19T07:00", { precipitationMm: 0 }),
      hour("2026-10-19T08:00", { precipitationMm: 3 }),
    ];
    expect(detectRainPeriods(hours)).toHaveLength(2);
  });

  it("returns nothing for dry hours", () => {
    const hours = [
      hour("2026-10-19T06:00"),
      hour("2026-10-19T07:00"),
    ];
    expect(detectRainPeriods(hours)).toHaveLength(0);
  });
});

describe("buildFarmOutlook (Thanjavur demo scenario)", () => {
  const dataset = buildDemoDataset(DEMO_LOCATIONS[2]); // Thanjavur

  it("exists for the fixture", () => {
    expect(dataset).not.toBeNull();
  });

  it("detects the seeded rain event around hour 30", () => {
    const outlook = buildFarmOutlook(dataset!);
    const p72 = outlook.periods[2];
    expect(p72.totalMm).toBeGreaterThan(10);
    expect(p72.rainPeriods.length).toBeGreaterThan(0);
  });

  it("produces planning messages that reflect the rain", () => {
    const outlook = buildFarmOutlook(dataset!);
    const text = outlook.messages.map((m) => m.text).join(" ");
    expect(text).toMatch(/rain|wet/i);
  });

  it("separates general summary from official advisories", () => {
    const outlook = buildFarmOutlook(dataset!);
    // The Thanjavur fixture carries only a DEMO advisory, so no *official*
    // advisory exists and the disclaimer must appear.
    expect(outlook.hasOfficialAdvisories).toBe(false);
    expect(outlook.messages.map((m) => m.text).join(" ")).toMatch(
      /not official agricultural advice/i,
    );
  });

  it("handles a dataset with no precipitation data gracefully", () => {
    const bare = { ...dataset!, hourly: [], daily: [] };
    const outlook = buildFarmOutlook(bare);
    expect(outlook.messages.map((m) => m.text).join(" ")).toMatch(
      /no reliable rainfall outlook/i,
    );
  });
});
