import { describe, expect, it } from "vitest";
import type { CurrentWeather } from "../types/weather";
import { classifyWeatherFeel } from "./weatherFeelEngine";

function current(over: Partial<CurrentWeather>): CurrentWeather {
  return {
    time: "2026-10-19T14:00",
    isPastObservation: false,
    temperatureC: 30,
    apparentTemperatureC: 33,
    humidityPct: 70,
    precipitationMm: 0,
    weatherCode: 1,
    windSpeedKmh: 10,
    ...over,
  };
}

describe("classifyWeatherFeel", () => {
  it("describes hot and humid conditions", () => {
    const feel = classifyWeatherFeel(
      current({
        temperatureC: 34,
        apparentTemperatureC: 38,
        humidityPct: 82,
      }),
      undefined,
      undefined,
    );
    expect(feel.label).toBe("Hot and humid");
    expect(feel.tone).toBe("hot");
  });

  it("describes dry heat differently from humid heat", () => {
    const feel = classifyWeatherFeel(
      current({
        temperatureC: 37,
        apparentTemperatureC: 37,
        humidityPct: 22,
      }),
      undefined,
      undefined,
    );
    expect(feel.label).toBe("Dry heat");
  });

  it("describes cool and crisp conditions", () => {
    const feel = classifyWeatherFeel(
      current({
        temperatureC: 16,
        apparentTemperatureC: 15,
        humidityPct: 35,
        windSpeedKmh: 8,
      }),
      undefined,
      undefined,
    );
    expect(feel.label).toBe("Cool and crisp");
    expect(feel.tone).toBe("cool");
  });

  it("describes warm and breezy conditions", () => {
    const feel = classifyWeatherFeel(
      current({
        temperatureC: 29,
        apparentTemperatureC: 30,
        humidityPct: 50,
        windSpeedKmh: 22,
      }),
      undefined,
      undefined,
    );
    expect(feel.label).toBe("Warm and breezy");
  });

  it("flags rainy and muggy conditions", () => {
    const feel = classifyWeatherFeel(
      current({
        temperatureC: 28,
        apparentTemperatureC: 31,
        humidityPct: 88,
        precipitationMm: 1.5,
        weatherCode: 63,
      }),
      undefined,
      undefined,
    );
    expect(feel.label).toBe("Rainy and muggy");
  });

  it("does not fabricate humidity — it says so when humidity is missing", () => {
    const feel = classifyWeatherFeel(
      current({
        temperatureC: 35,
        apparentTemperatureC: 36,
        humidityPct: null,
      }),
      undefined,
      undefined,
    );
    expect(feel.label).toBe("Hot");
    expect(feel.missing).toContain("humidity");
    expect(feel.summary).toMatch(/humidity is unknown/i);
  });

  it("falls back to air temperature when feels-like is missing", () => {
    const feel = classifyWeatherFeel(
      current({ temperatureC: 24, apparentTemperatureC: null }),
      undefined,
      undefined,
    );
    expect(feel.usedApparentTemperature).toBe(false);
    expect(feel.missing).toContain("feels-like temperature");
    expect(feel.label).toBe("Pleasant");
  });

  it("adds a nuance when feels-like departs from the thermometer", () => {
    const feel = classifyWeatherFeel(
      current({ temperatureC: 30, apparentTemperatureC: 38, humidityPct: 80 }),
      undefined,
      undefined,
    );
    expect(feel.nuance).toMatch(/warmer than the thermometer/i);
  });

  it("never returns a description without temperature data", () => {
    const feel = classifyWeatherFeel(
      current({ temperatureC: null, apparentTemperatureC: null }),
      undefined,
      undefined,
    );
    expect(feel.label).toBe("Conditions unavailable");
  });

  it("always carries the interpretation disclaimer", () => {
    const feel = classifyWeatherFeel(current({}), undefined, undefined);
    expect(feel.disclaimer).toMatch(/not an official meteorological category/i);
  });

  it("changes its description when inputs change", () => {
    const warm = classifyWeatherFeel(current({ temperatureC: 30, apparentTemperatureC: 33, humidityPct: 70 }), undefined, undefined);
    const cool = classifyWeatherFeel(current({ temperatureC: 14, apparentTemperatureC: 12, humidityPct: 70 }), undefined, undefined);
    expect(warm.label).not.toBe(cool.label);
  });
});
