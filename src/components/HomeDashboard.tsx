/**
 * HomeDashboard — Minimalist, clean, user-friendly meteorological home.
 *
 * Focuses purely on essential core observations:
 * - Current Temperature, Condition icon & label, Feels-like
 * - Highest & Lowest temperature span
 * - Clean 24-Hour hourly forecast timeline
 * - Synoptic outlook note
 * - Official weather alerts (pinned if active)
 * - Quick-access links to specialized reports (Rain, Wind, Air Quality, Mausam Prediction)
 */

import { useMemo } from "react";
import {
  ArrowUp,
  ArrowDown,
  CloudRain,
  Wind,
  Gauge,
  Brain,
  Clock,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card } from "./ui/primitives";
import { WeatherIcon, isNightTime } from "../utils/wmo";
import { getTranslation, getTranslatedWeatherText } from "../i18n/translations";
import { translateLocationName } from "../i18n/locations";
import {
  formatHour,
  formatTemp,
  todayIso,
  locationClock,
  tempUnitLabel,
} from "../utils/format";
import { WeatherAlertCard } from "./WeatherAlertCard";

interface HomeDashboardProps {
  dataset: WeatherDataset;
  prefs: Preferences;
  onNavigate: (tab: "rain" | "wind" | "air-quality" | "prediction") => void;
}

export function HomeDashboard({ dataset, prefs, onNavigate }: HomeDashboardProps) {
  const c = dataset.current;
  const today = todayIso(dataset.timezone);
  const t = getTranslation(prefs.language);

  const nowIso = dataset.current?.time ?? dataset.hourly[0]?.time;
  const hourlyStart = useMemo(() => {
    if (!nowIso) return 0;
    const hourKey = nowIso.slice(0, 13);
    const idx = dataset.hourly.findIndex((h) => h.time.slice(0, 13) === hourKey);
    return Math.max(0, idx);
  }, [dataset.hourly, nowIso]);

  const upcoming24h = dataset.hourly.slice(hourlyStart, hourlyStart + 24);

  // Highest and lowest temperature calculation for today
  const todayDaily = dataset.daily.find((d) => d.date === today) ?? dataset.daily[0];
  const dayHourlyTemps = useMemo(() => {
    const temps = dataset.hourly
      .filter((h) => h.time.startsWith(today) && h.temperatureC != null)
      .map((h) => h.temperatureC as number);
    if (temps.length === 0) return null;
    return {
      max: Math.max(...temps),
      min: Math.min(...temps),
    };
  }, [dataset.hourly, today]);

  const maxTempC = todayDaily?.tempMaxC ?? dayHourlyTemps?.max ?? c?.temperatureC ?? null;
  const minTempC = todayDaily?.tempMinC ?? dayHourlyTemps?.min ?? c?.temperatureC ?? null;

  // Synoptic brief
  const synopticBrief = useMemo(() => {
    const next12 = dataset.hourly.slice(0, 12);
    const rain = next12.find((h) => (h.precipitationProbabilityPct ?? 0) >= 45);
    if (rain) {
      return `${t.precipitationLikely} (${Math.round(rain.precipitationProbabilityPct ?? 0)}%).`;
    }
    const temp = c?.temperatureC ?? 26;
    if (temp >= 35) return t.intenseHeat;
    if (temp <= 14) return t.coolWeather;
    return t.calmWeather;
  }, [c?.temperatureC, dataset.hourly, t]);

  return (
    <div className="space-y-6">
      {/* Official Weather Alert (pinned if active) */}
      <WeatherAlertCard dataset={dataset} prefs={prefs} />

      {/* Main Meteorological Hero Card */}
      <Card ariaLabel="Primary Weather Conditions" className="overflow-hidden border-line shadow-xs">
        {/* Header bar: Station & Clock */}
        <div className="flex items-center justify-between border-b border-line bg-surface/50 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pine animate-pulse" />
            <h2 className="text-base font-semibold text-ink-950 sm:text-lg">
              {translateLocationName(dataset.location.name, prefs.language)}
              {dataset.location.admin1 ? (
                <span className="text-sm font-normal text-ink-500">, {translateLocationName(dataset.location.admin1, prefs.language)}</span>
              ) : null}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-600 tabular-nums">
            <Clock className="h-3.5 w-3.5 text-ink-400" />
            <span>{locationClock(dataset.timezone, prefs.timeFormat)}</span>
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-6">
          {/* Temperature, Condition, High/Low */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-line pb-6">
            <div className="space-y-3">
              <div className="flex items-baseline gap-4">
                <span className="text-6xl sm:text-8xl font-light tracking-tight text-ink-950 tabular-nums">
                  {formatTemp(c?.temperatureC ?? null, prefs.temperatureUnit)}
                </span>
                <div className="space-y-1">
                  <p className="text-lg sm:text-xl font-medium text-ink-900">
                    {getTranslatedWeatherText(c?.weatherCode, prefs.language)}
                  </p>
                  {c?.apparentTemperatureC != null && (
                    <p className="text-xs sm:text-sm text-ink-500">
                      {t.feelsLike}{" "}
                      <span className="font-semibold text-ink-700 tabular-nums">
                        {formatTemp(c.apparentTemperatureC, prefs.temperatureUnit)}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* High & Low Temperature Pills */}
              <div className="flex items-center gap-2.5" aria-label="Today's high and low">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-weather-sunBorder bg-weather-sunSurface px-3 py-1.5 text-xs font-medium text-ink-800">
                  <ArrowUp className="h-3.5 w-3.5 text-weather-sun stroke-[2.5]" aria-hidden="true" />
                  <span className="text-ink-500">{t.highestTemp}:</span>
                  <span className="font-bold text-ink-950 tabular-nums">
                    {formatTemp(maxTempC, prefs.temperatureUnit)}
                  </span>
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-lg border border-weather-rainBorder bg-weather-rainSurface px-3 py-1.5 text-xs font-medium text-ink-800">
                  <ArrowDown className="h-3.5 w-3.5 text-weather-rain stroke-[2.5]" aria-hidden="true" />
                  <span className="text-ink-500">{t.lowestTemp}:</span>
                  <span className="font-bold text-ink-950 tabular-nums">
                    {formatTemp(minTempC, prefs.temperatureUnit)}
                  </span>
                </span>
              </div>
            </div>

            {/* Icon & Synoptic Outlook Note */}
            <div className="md:max-w-xs space-y-2">
              <div className="flex items-center gap-3">
                <WeatherIcon
                  code={c?.weatherCode}
                  className="h-12 w-12 text-pine"
                />
                <span className="text-xs uppercase tracking-wider font-semibold text-ink-500">
                  {t.todaysOutlook}
                </span>
              </div>
              <p className="font-editorial italic text-sm leading-relaxed text-ink-700">
                “{synopticBrief}”
              </p>
            </div>
          </div>

          {/* 24-HOUR FORECAST TIMELINE */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="label-caps flex items-center gap-1.5">
                <span>{t.next24Hours}</span>
                <span className="text-ink-400 font-normal">({tempUnitLabel(prefs.temperatureUnit)})</span>
              </span>
              <span className="text-[11px] text-ink-400">{t.horizontalScroll}</span>
            </div>

            <div className="relative">
              <ul
                className="strip-scroll flex gap-2.5 overflow-x-auto pb-3 pt-1"
                aria-label="24-hour forecast strip"
              >
                {upcoming24h.map((h, i) => {
                  const prob = h.precipitationProbabilityPct ?? 0;
                  return (
                    <li
                      key={h.time}
                      className={`flex w-20 shrink-0 flex-col items-center gap-2 rounded-xl border py-3 px-2 transition-all ${
                        i === 0
                          ? "border-pine bg-pine/5 font-semibold text-ink-950 shadow-xs"
                          : "border-line bg-surface text-ink-800 hover:border-ink-300"
                      }`}
                    >
                      <span className="text-[11px] font-medium text-ink-500 tabular-nums">
                        {i === 0 ? t.now : formatHour(h.time, prefs.timeFormat)}
                      </span>
                      <WeatherIcon
                        code={h.weatherCode}
                        isNight={isNightTime(h.time)}
                        className="h-6 w-6 text-pine"
                      />
                      <span className="text-sm font-bold tabular-nums text-ink-950">
                        {formatTemp(h.temperatureC, prefs.temperatureUnit)}
                      </span>

                      {/* Rain Probability */}
                      <span
                        className={`text-[10px] font-medium tabular-nums ${
                          prob >= 30 ? "text-weather-rain font-semibold" : "text-ink-400"
                        }`}
                      >
                        {prob > 0 ? `${Math.round(prob)}% ${t.rain}` : t.noRain}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </Card>

      {/* Quick Navigation Cards to Specialized Reports */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="label-caps">{t.deepReports}</span>
          <span className="text-[11px] text-ink-400">{t.tapToOpen}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Rain Report Card */}
          <button
            type="button"
            onClick={() => onNavigate("rain")}
            className="group flex flex-col justify-between rounded-xl border border-line bg-surface p-4 text-left transition-all hover:border-weather-rain hover:shadow-xs"
          >
            <div className="flex items-center justify-between w-full">
              <div className="rounded-lg bg-weather-rain/10 p-2 text-weather-rain">
                <CloudRain className="h-5 w-5" />
              </div>
              <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-ink-900 group-hover:text-weather-rain">
                {t.tabRain}
              </h3>
              <p className="mt-0.5 text-xs text-ink-500">
                {t.rainCardDesc}
              </p>
            </div>
          </button>

          {/* Wind Report Card */}
          <button
            type="button"
            onClick={() => onNavigate("wind")}
            className="group flex flex-col justify-between rounded-xl border border-line bg-surface p-4 text-left transition-all hover:border-pine hover:shadow-xs"
          >
            <div className="flex items-center justify-between w-full">
              <div className="rounded-lg bg-pine/10 p-2 text-pine">
                <Wind className="h-5 w-5" />
              </div>
              <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-ink-900 group-hover:text-pine">
                {t.tabWind}
              </h3>
              <p className="mt-0.5 text-xs text-ink-500">
                {t.windCardDesc}
              </p>
            </div>
          </button>

          {/* Air Quality Card */}
          <button
            type="button"
            onClick={() => onNavigate("air-quality")}
            className="group flex flex-col justify-between rounded-xl border border-line bg-surface p-4 text-left transition-all hover:border-weather-sun hover:shadow-xs"
          >
            <div className="flex items-center justify-between w-full">
              <div className="rounded-lg bg-weather-sun/10 p-2 text-weather-sun">
                <Gauge className="h-5 w-5" />
              </div>
              <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-ink-900 group-hover:text-weather-sun">
                {t.tabAirQuality}
              </h3>
              <p className="mt-0.5 text-xs text-ink-500">
                {t.airQualityCardDesc}
              </p>
            </div>
          </button>

          {/* Mausam Prediction Card */}
          <button
            type="button"
            onClick={() => onNavigate("prediction")}
            className="group flex flex-col justify-between rounded-xl border border-pine/30 bg-pine/5 p-4 text-left transition-all hover:border-pine hover:shadow-xs"
          >
            <div className="flex items-center justify-between w-full">
              <div className="rounded-lg bg-pine p-2 text-surface">
                <Brain className="h-5 w-5" />
              </div>
              <ChevronRight className="h-4 w-4 text-pine transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-pine">
                {t.tabPrediction}
              </h3>
              <p className="mt-0.5 text-xs text-ink-600">
                {t.predictionCardDesc}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
