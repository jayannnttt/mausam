import { describe, expect, it } from "vitest";
import type { HourlyAirQuality, HourlyWeather } from "../types/weather";
import {
  ACTIVITY_PROFILES,
  addHoursIso,
  avgScore,
  contrastFactors,
  rankHours,
  scoreHour,
  temperatureScore,
  uvScore,
  rainScore,
  windScore,
  humidityScore,
} from "./recommendationEngine";

function hour(over: Partial<HourlyWeather>): HourlyWeather {
  return {
    time: "2026-10-19T06:00",
    temperatureC: 22,
    apparentTemperatureC: 22,
    humidityPct: 55,
    precipitationProbabilityPct: 5,
    precipitationMm: 0,
    windSpeedKmh: 10,
    uvIndex: 1,
    visibilityM: 10000,
    weatherCode: 1,
    ...over,
  };
}

function aq(over: Partial<HourlyAirQuality>): HourlyAirQuality {
  return {
    time: "2026-10-19T06:00",
    pm25: 10,
    pm10: 18,
    ozone: 40,
    nitrogenDioxide: 5,
    usAqi: 30,
    europeanAqi: 20,
    ...over,
  };
}

const OPTS = {
  heightenedAqAwareness: false,
  warningsAvailable: true,
  warningsByHour: {} as Record<string, "red" | "orange" | "yellow">,
};

describe("factor score functions", () => {
  it("temperature scores 100 inside the ideal band and falls outside", () => {
    expect(temperatureScore(20, [10, 24], 14)).toBe(100);
    expect(temperatureScore(38, [10, 24], 14)).toBe(0);
    const mild = temperatureScore(30, [10, 24], 14);
    expect(mild).toBeLessThan(100);
    expect(mild).toBeGreaterThan(0);
  });

  it("temperature returns null for missing data instead of guessing", () => {
    expect(temperatureScore(null, [10, 24], 14)).toBeNull();
  });

  it("uv penalises high sun and is harsher with heightened awareness", () => {
    expect(uvScore(0, false)).toBe(100);
    expect(uvScore(9, true)!).toBeLessThan(uvScore(9, false)!);
  });

  it("rain score drops with both probability and actual mm", () => {
    expect(rainScore(0, 0)).toBe(100);
    const probOnly = rainScore(80, null)!;
    const withRain = rainScore(80, 4)!;
    expect(probOnly).toBeGreaterThan(withRain);
  });

  it("wind is calm at breeze and drops in gales", () => {
    expect(windScore(15, 40)).toBe(100);
    expect(windScore(55, 40)!).toBeLessThan(20);
  });

  it("humidity prefers 30–70%", () => {
    expect(humidityScore(50)).toBe(100);
    expect(humidityScore(95)!).toBeLessThan(70);
  });
});

describe("scoreHour", () => {
  it("prefers clean air over heavily polluted air, all else equal", () => {
    const clean = scoreHour(hour({}), aq({ pm25: 8 }), ACTIVITY_PROFILES.running, OPTS);
    const dirty = scoreHour(hour({}), aq({ pm25: 120 }), ACTIVITY_PROFILES.running, OPTS);
    expect(clean.total!).toBeGreaterThan(dirty.total!);
  });

  it("tightens PM2.5 judgement under heightened awareness", () => {
    // 30 µg/m³: "Fair" under default bands, "Moderate" under strict bands.
    const normal = scoreHour(hour({}), aq({ pm25: 30 }), ACTIVITY_PROFILES.running, OPTS);
    const strict = scoreHour(
      hour({}),
      aq({ pm25: 30 }),
      ACTIVITY_PROFILES.running,
      { ...OPTS, heightenedAqAwareness: true },
    );
    expect(strict.total!).toBeLessThan(normal.total!);
  });

  it("redistributes weight and lowers confidence when AQ is missing", () => {
    const withAq = scoreHour(hour({}), aq({}), ACTIVITY_PROFILES.running, OPTS);
    const withoutAq = scoreHour(hour({}), undefined, ACTIVITY_PROFILES.running, OPTS);
    expect(withAq.missing).not.toContain("airQuality");
    expect(withoutAq.missing).toContain("airQuality");
    expect(withoutAq.total).not.toBeNull();
  });

  it("applies a heavy penalty for an active red warning", () => {
    const h = hour({});
    const calm = scoreHour(h, aq({}), ACTIVITY_PROFILES.running, OPTS);
    const warned = scoreHour(h, aq({}), ACTIVITY_PROFILES.running, {
      ...OPTS,
      warningsByHour: { [h.time]: "red" },
    });
    expect(warned.total!).toBeLessThan(calm.total! - 15);
  });

  it("drops the warning factor entirely when the source is unavailable", () => {
    const h = hour({});
    const r = scoreHour(h, aq({}), ACTIVITY_PROFILES.running, {
      ...OPTS,
      warningsAvailable: false,
    });
    expect(r.missing).toContain("warning");
    expect(r.total).not.toBeNull();
  });
});

describe("rankHours", () => {
  const hours = [
    hour({ time: "2026-10-19T06:00", temperatureC: 21, apparentTemperatureC: 21, uvIndex: 0.5 }),
    hour({
      time: "2026-10-19T07:00",
      temperatureC: 23,
      apparentTemperatureC: 23,
      uvIndex: 1.5,
    }),
    hour({
      time: "2026-10-19T13:00",
      temperatureC: 36,
      apparentTemperatureC: 42,
      humidityPct: 80,
      uvIndex: 9,
      precipitationProbabilityPct: 85,
      precipitationMm: 4,
    }),
    hour({
      time: "2026-10-19T14:00",
      temperatureC: 37,
      apparentTemperatureC: 44,
      humidityPct: 82,
      uvIndex: 9.5,
      precipitationProbabilityPct: 90,
      precipitationMm: 6,
    }),
  ];
  const aqMap = new Map<string, HourlyAirQuality>([
    ["2026-10-19T06:00", aq({ time: "2026-10-19T06:00", pm25: 9 })],
    ["2026-10-19T07:00", aq({ time: "2026-10-19T07:00", pm25: 12 })],
    ["2026-10-19T13:00", aq({ time: "2026-10-19T13:00", pm25: 55 })],
    ["2026-10-19T14:00", aq({ time: "2026-10-19T14:00", pm25: 70 })],
  ]);

  it("ranks the cool, clean morning above the hot, wet afternoon", () => {
    const result = rankHours(hours, aqMap, "running", OPTS);
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0].start).toBe("2026-10-19T06:00");
  });

  it("produces up to three distinct comparison windows", () => {
    const result = rankHours(hours, aqMap, "running", OPTS);
    expect(result.windows.length).toBeLessThanOrEqual(3);
    const starts = new Set(result.windows.map((w) => w.start));
    expect(starts.size).toBe(result.windows.length);
  });

  it("explains why the best window wins via contrast factors", () => {
    const result = rankHours(hours, aqMap, "running", OPTS);
    const avg = avgScore(result.windows[0].hours);
    const scoredAfternoon = result.hourScores.find((h) => h.time === "2026-10-19T13:00")!;
    const other = avgScore([scoredAfternoon]);
    const contrasts = contrastFactors(avg, other);
    expect(contrasts.length).toBeGreaterThan(0);
    expect(["rain", "heat", "uv", "airQuality"]).toContain(contrasts[0]);
  });

  it("still ranks with no air-quality data but flags the limitation", () => {
    const result = rankHours(hours, new Map(), "running", OPTS);
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.notes.join(" ")).toMatch(/air-quality/i);
    expect(result.dataCoverage).toBeLessThan(0.9);
  });

  it("reports insufficient data when there are too few hours", () => {
    const result = rankHours([], new Map(), "running", OPTS);
    expect(result.insufficient).toBeDefined();
    expect(result.windows).toHaveLength(0);
  });

  it("penalises hours covered by official warnings in the ranking", () => {
    const clean = rankHours(hours, aqMap, "running", OPTS);
    const warned = rankHours(hours, aqMap, "running", {
      ...OPTS,
      warningsByHour: { "2026-10-19T06:00": "red", "2026-10-19T07:00": "red" },
    });
    // The morning hours were the best option; covering them with a red
    // warning must drag the best achievable score down.
    expect(warned.windows[0].score).toBeLessThan(clean.windows[0].score);
  });

  it("activity choice changes rankings (cycling punishes wind more)", () => {
    const windy = [
      hour({ time: "2026-10-19T08:00", windSpeedKmh: 34 }),
      hour({ time: "2026-10-19T09:00", windSpeedKmh: 6 }),
    ];
    const windyAq = new Map<string, HourlyAirQuality>([
      ["2026-10-19T08:00", aq({ time: "2026-10-19T08:00" })],
      ["2026-10-19T09:00", aq({ time: "2026-10-19T09:00" })],
    ]);
    const cycle = rankHours(windy, windyAq, "cycling", OPTS);
    const scoreAt = (t: string) =>
      cycle.hourScores.find((h) => h.time === t)!.total!;
    // Everything equal except wind: the calmer hour must outrank the windy one.
    expect(scoreAt("2026-10-19T09:00")).toBeGreaterThan(scoreAt("2026-10-19T08:00"));
    // And cycling should punish the 34 km/h hour harder than walking does.
    const walk = rankHours(windy, windyAq, "walking", OPTS);
    const walkGap =
      walk.hourScores.find((h) => h.time === "2026-10-19T09:00")!.total! -
      walk.hourScores.find((h) => h.time === "2026-10-19T08:00")!.total!;
    const cycleGap = scoreAt("2026-10-19T09:00") - scoreAt("2026-10-19T08:00");
    expect(cycleGap).toBeGreaterThan(walkGap);
  });
});

describe("addHoursIso", () => {
  it("rolls over hours and days", () => {
    expect(addHoursIso("2026-10-19T22:00", 3)).toBe("2026-10-20T01:00");
    expect(addHoursIso("2026-10-19T06:00", 1)).toBe("2026-10-19T07:00");
  });
});
