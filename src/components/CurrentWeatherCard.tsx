/**
 * CurrentWeatherCard — Editorial meteorological hero instrument.
 * Displays primary conditions, natural-language editorial summary,
 * 24-hour timeline, proportional 7-day forecast bars, and secondary details grid.
 */

import { useMemo, useState } from "react";
import {
  Droplets,
  Wind,
  Gauge,
  CloudRain,
  Sun,
  Eye,
  Clock,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Preferences, WeatherDataset, CurrentWeather, HourlyWeather, DailyWeather } from "../types/weather";
import { ProviderLine } from "./DataSourceBadge";
import { Card } from "./ui/primitives";
import { WeatherIcon, isNightTime } from "../utils/wmo";
import { getTranslation, getTranslatedWeatherText, getTranslatedDay } from "../i18n/translations";
import {
  formatHour,
  formatTemp,
  formatWind,
  formatVisibility,
  dayLabel,
  todayIso,
  locationClock,
  tempUnitLabel,
} from "../utils/format";

function getEditorialSummary(
  current: CurrentWeather | null | undefined,
  hourly: HourlyWeather[],
  daily: DailyWeather[],
  today: string
): string {
  const next12 = hourly.slice(0, 12);
  const rainHour = next12.find(
    (h) => (h.precipitationProbabilityPct ?? 0) >= 45 || (h.precipitationMm ?? 0) > 0.5
  );

  if (rainHour) {
    const timeStr = rainHour.time.slice(11, 16);
    const prob = rainHour.precipitationProbabilityPct ?? 60;
    return `Precipitation likely near ${timeStr} (${Math.round(prob)}% probability). Cloud cover expected to thicken through the period.`;
  }

  const todayDaily = daily.find((d) => d.date === today) ?? daily[0];
  if (todayDaily && (todayDaily.precipitationProbabilityMaxPct ?? 0) >= 40) {
    return `Scattered precipitation possible during the day with a ${Math.round(todayDaily.precipitationProbabilityMaxPct!)}% peak likelihood.`;
  }

  const temp = current?.temperatureC ?? 26;
  const apparent = current?.apparentTemperatureC ?? temp;
  if (apparent >= 36) {
    return `Intense heat index through midday. Plan hydration and moderate sustained physical exertion in open sunlight.`;
  }
  if (temp <= 14) {
    return `Cooler airmass settled over the region. Moderate thermal retention layers advised for morning and evening travel.`;
  }
  if ((current?.windSpeedKmh ?? 0) >= 28) {
    return `Noticeable surface breeze sustained around ${Math.round(current!.windSpeedKmh!)} km/h with occasional higher gusts.`;
  }
  return `Stable, calm atmospheric conditions with consistent barometric reading and good ambient visibility.`;
}

export function CurrentWeatherCard({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const nowIso = dataset.current?.time ?? dataset.hourly[0]?.time;
  const hourlyStart = useMemo(() => {
    if (!nowIso) return 0;
    const hourKey = nowIso.slice(0, 13);
    const idx = dataset.hourly.findIndex((h) => h.time.slice(0, 13) === hourKey);
    return Math.max(0, idx);
  }, [dataset.hourly, nowIso]);

  const upcoming = dataset.hourly.slice(hourlyStart, hourlyStart + 24);
  const aqByTime = useMemo(() => {
    const map = new Map(dataset.hourlyAirQuality?.map((a) => [a.time, a]) ?? []);
    return map;
  }, [dataset.hourlyAirQuality]);
  const nowAq = nowIso ? aqByTime.get(nowIso.slice(0, 13) + ":00") : undefined;

  if (!dataset.current && upcoming.length === 0) {
    return null;
  }

  const c = dataset.current;
  const today = todayIso(dataset.timezone);
  const t = getTranslation(prefs.language);

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

  // Compute week's minimum and maximum for proportional range bar
  const { weekMin, weekMax } = useMemo(() => {
    let min = 999;
    let max = -999;
    for (const d of dataset.daily) {
      if (d.tempMinC != null && d.tempMinC < min) min = d.tempMinC;
      if (d.tempMaxC != null && d.tempMaxC > max) max = d.tempMaxC;
    }
    if (min === 999) min = 0;
    if (max === -999) max = 40;
    if (min === max) max = min + 1;
    return { weekMin: min, weekMax: max };
  }, [dataset.daily]);

  const editorialNote = useMemo(
    () => getEditorialSummary(c, dataset.hourly, dataset.daily, today),
    [c, dataset.hourly, dataset.daily, today]
  );

  return (
    <Card ariaLabel="Current meteorological conditions" className="overflow-hidden">
      {/* Header bar: Station & Time precision */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
            Observation Point
          </span>
          <h2 className="text-base font-semibold text-ink-950 sm:text-lg">
            {dataset.location.name}
            {dataset.location.admin1 ? (
              <span className="text-sm font-normal text-ink-500">, {dataset.location.admin1}</span>
            ) : null}
          </h2>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-ink-900 tabular-nums">
            {locationClock(dataset.timezone, prefs.timeFormat)}
          </p>
          <p className="flex items-center justify-end gap-1 text-[11px] text-ink-500">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>Updated {formatHour(nowIso ?? "", prefs.timeFormat)}</span>
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* ================= HERO SECTION ================= */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-line pb-6">
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className="text-6xl sm:text-7xl font-light tracking-tight text-ink-950 tabular-nums">
                {formatTemp(c?.temperatureC ?? null, prefs.temperatureUnit)}
              </span>
              <div className="space-y-0.5">
                <p className="text-base font-medium text-ink-900">
                  {getTranslatedWeatherText(c?.weatherCode, prefs.language)}
                </p>
                {c?.apparentTemperatureC != null && (
                  <p className="text-xs text-ink-500">
                    {t.feelsLike}{" "}
                    <span className="font-medium text-ink-700 tabular-nums">
                      {formatTemp(c.apparentTemperatureC, prefs.temperatureUnit)}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* High & Low Range Pills */}
            <div className="flex items-center gap-2" aria-label="Today's temperature span">
              <span className="inline-flex items-center gap-1 rounded-md border border-weather-sunBorder bg-weather-sunSurface px-2.5 py-1 text-xs font-medium text-ink-800">
                <ArrowUp className="h-3.5 w-3.5 text-weather-sun stroke-[2.5]" aria-hidden="true" />
                <span className="text-ink-500">{t.highestTemp}:</span>
                <span className="font-semibold text-ink-950 tabular-nums">
                  {formatTemp(maxTempC, prefs.temperatureUnit)}
                </span>
              </span>

              <span className="inline-flex items-center gap-1 rounded-md border border-weather-rainBorder bg-weather-rainSurface px-2.5 py-1 text-xs font-medium text-ink-800">
                <ArrowDown className="h-3.5 w-3.5 text-weather-rain stroke-[2.5]" aria-hidden="true" />
                <span className="text-ink-500">{t.lowestTemp}:</span>
                <span className="font-semibold text-ink-950 tabular-nums">
                  {formatTemp(minTempC, prefs.temperatureUnit)}
                </span>
              </span>
            </div>
          </div>

          {/* Weather Icon & Natural Language Summary */}
          <div className="md:max-w-xs space-y-2.5">
            <div className="flex items-center gap-3">
              <WeatherIcon
                code={c?.weatherCode}
                className="h-10 w-10 text-pine"
              />
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-500">
                Synoptic Outlook
              </span>
            </div>
            <p className="font-editorial italic text-sm sm:text-base leading-relaxed text-ink-800">
              “{editorialNote}”
            </p>
          </div>
        </div>

        {/* ================= HOURLY TIMELINE ================= */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="label-caps">
              {t.next24Hours} ({tempUnitLabel(prefs.temperatureUnit)})
            </span>
            <span className="text-[10px] text-ink-500 tabular-nums">
              Horizontal scroll · 24-hr sequence
            </span>
          </div>

          <div className="relative">
            <ul
              className="strip-scroll flex gap-2 overflow-x-auto pb-2 pt-1"
              aria-label="Hourly forecast sequence"
            >
              {upcoming.map((h, i) => {
                const prob = h.precipitationProbabilityPct ?? 0;
                return (
                  <li
                    key={h.time}
                    className={`flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-lg border py-2.5 px-1.5 transition-colors ${
                      i === 0
                        ? "border-pine bg-pine-surface/50 font-semibold text-ink-950"
                        : "border-line bg-surface text-ink-800 hover:border-ink-300"
                    }`}
                  >
                    <span className="text-[11px] font-medium text-ink-500 tabular-nums">
                      {i === 0 ? t.now : formatHour(h.time, prefs.timeFormat)}
                    </span>
                    <WeatherIcon
                      code={h.weatherCode}
                      isNight={isNightTime(h.time)}
                      className="h-5 w-5 text-pine"
                    />
                    <span className="text-xs font-semibold tabular-nums text-ink-950">
                      {formatTemp(h.temperatureC, prefs.temperatureUnit)}
                    </span>

                    {/* Rain Probability Pill */}
                    <span
                      className={`text-[10px] font-medium tabular-nums ${
                        prob >= 40 ? "text-weather-rain font-semibold" : "text-ink-400"
                      }`}
                      title={prob > 0 ? `${Math.round(prob)}% precipitation chance` : "No rain"}
                    >
                      {prob > 0 ? `${Math.round(prob)}%` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ================= 7-DAY FORECAST LIST ================= */}
        {dataset.daily.length > 0 && (
          <div className="border-t border-line pt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="label-caps">{t.sevenDayForecast}</span>
              <span className="text-[10px] text-ink-500">
                Range indicator: {formatTemp(weekMin, prefs.temperatureUnit)} → {formatTemp(weekMax, prefs.temperatureUnit)}
              </span>
            </div>

            <ul className="divide-y divide-line-subtle rounded-lg border border-line bg-surface" aria-label="7-day outlook table">
              {dataset.daily.map((d) => {
                const isToday = d.date === today;
                const isExpanded = expandedDate === d.date;
                const range = weekMax - weekMin;
                const minC = d.tempMinC ?? 0;
                const maxC = d.tempMaxC ?? 0;
                const leftPct = range > 0 ? Math.max(0, Math.min(100, ((minC - weekMin) / range) * 100)) : 0;
                const widthPct = range > 0 ? Math.max(8, Math.min(100 - leftPct, ((maxC - minC) / range) * 100)) : 100;
                const prob = d.precipitationProbabilityMaxPct;

                return (
                  <li key={d.date} className="transition-colors hover:bg-line-subtle/30">
                    <button
                      type="button"
                      onClick={() => setExpandedDate(isExpanded ? null : d.date)}
                      className="flex w-full items-center justify-between px-3 py-2.5 sm:px-4 text-left"
                      aria-expanded={isExpanded}
                    >
                      {/* Day Label */}
                      <span className="w-20 sm:w-24 shrink-0 text-xs sm:text-sm font-medium text-ink-900">
                        {isToday ? (
                          <strong className="text-pine font-semibold">{t.today}</strong>
                        ) : (
                          getTranslatedDay(dayLabel(d.date, today), prefs.language)
                        )}
                      </span>

                      {/* Weather Icon & Brief Text */}
                      <div className="flex items-center gap-2 min-w-0 flex-1 px-1 sm:px-2">
                        <WeatherIcon
                          code={d.weatherCode}
                          isNight={false}
                          className="h-4 w-4 shrink-0 text-pine"
                        />
                        <span className="hidden sm:inline-block truncate text-xs text-ink-500">
                          {getTranslatedWeatherText(d.weatherCode, prefs.language)}
                        </span>
                      </div>

                      {/* Rain Probability */}
                      <span
                        className="w-12 shrink-0 text-center text-xs tabular-nums text-weather-rain font-medium"
                        title={prob != null ? `Max rain chance: ${Math.round(prob)}%` : undefined}
                      >
                        {prob != null && prob > 15 ? `${Math.round(prob)}%` : "—"}
                      </span>

                      {/* Min Temperature */}
                      <span className="w-8 shrink-0 text-right text-xs font-medium text-ink-500 tabular-nums">
                        {formatTemp(d.tempMinC, prefs.temperatureUnit)}
                      </span>

                      {/* Proportional Range Bar */}
                      <div className="mx-2 sm:mx-3 relative h-1.5 w-16 sm:w-28 rounded-full bg-line-subtle overflow-hidden shrink-0">
                        <div
                          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-weather-rain to-weather-sun"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        />
                      </div>

                      {/* Max Temperature */}
                      <span className="w-8 shrink-0 text-left text-xs font-semibold text-ink-950 tabular-nums">
                        {formatTemp(d.tempMaxC, prefs.temperatureUnit)}
                      </span>

                      {/* Expand indicator */}
                      <span className="ml-1 text-ink-400">
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </span>
                    </button>

                    {/* Expandable Day Details */}
                    {isExpanded && (
                      <div className="border-t border-line-subtle bg-line-subtle/40 px-4 py-3 text-xs text-ink-700">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-ink-500">Conditions</span>
                            <p className="mt-0.5 font-medium text-ink-900">
                              {getTranslatedWeatherText(d.weatherCode, prefs.language)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-ink-500">Rain Accumulation</span>
                            <p className="mt-0.5 font-medium text-ink-900 tabular-nums">
                              {d.precipitationSumMm != null ? `${d.precipitationSumMm} mm` : "None expected"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-ink-500">Max Rain Risk</span>
                            <p className="mt-0.5 font-medium text-ink-900 tabular-nums">
                              {d.precipitationProbabilityMaxPct != null ? `${Math.round(d.precipitationProbabilityMaxPct)}%` : "Minimal"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-ink-500">Thermal Span</span>
                            <p className="mt-0.5 font-medium text-ink-900 tabular-nums">
                              {formatTemp(d.tempMinC, prefs.temperatureUnit)} → {formatTemp(d.tempMaxC, prefs.temperatureUnit)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ================= SECONDARY WEATHER DETAILS ================= */}
        <div className="border-t border-line pt-5">
          <span className="label-caps mb-3 block">Observation Matrix</span>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <MetricTile
              icon={<Droplets className="h-4 w-4 text-weather-rain" aria-hidden="true" />}
              label={t.humidity}
              value={c?.humidityPct != null ? `${Math.round(c.humidityPct)}%` : "—"}
              detail="Relative humidity"
            />

            <MetricTile
              icon={<Wind className="h-4 w-4 text-pine" aria-hidden="true" />}
              label={t.wind}
              value={formatWind(c?.windSpeedKmh ?? null, prefs.windUnit)}
              detail="Surface speed"
            />

            <MetricTile
              icon={<CloudRain className="h-4 w-4 text-weather-rain" aria-hidden="true" />}
              label={t.rainNow}
              value={c?.precipitationMm != null ? `${c.precipitationMm} mm` : "0.0 mm"}
              detail="Current hour rate"
            />

            <MetricTile
              icon={<Gauge className="h-4 w-4 text-pine" aria-hidden="true" />}
              label={t.pm25}
              value={nowAq?.pm25 != null ? `${Math.round(nowAq.pm25)} µg/m³` : "—"}
              detail="Air particulate level"
            />

            <MetricTile
              icon={<Sun className="h-4 w-4 text-weather-sun" aria-hidden="true" />}
              label="UV Index"
              value={upcoming[0]?.uvIndex != null ? `${Math.round(upcoming[0].uvIndex * 10) / 10}` : "—"}
              detail="Solar exposure rate"
            />

            <MetricTile
              icon={<Eye className="h-4 w-4 text-pine" aria-hidden="true" />}
              label="Visibility"
              value={upcoming[0]?.visibilityM != null ? formatVisibility(upcoming[0].visibilityM) : "—"}
              detail="Atmospheric clarity"
            />
          </dl>
        </div>
      </div>
    </Card>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-line bg-surface p-3 transition-colors hover:border-ink-300">
      <div className="flex items-center justify-between">
        <dt className="text-xs font-medium text-ink-500">{label}</dt>
        <span className="p-1 rounded bg-line-subtle/50 text-ink-700">{icon}</span>
      </div>
      <dd className="mt-2 text-lg sm:text-xl font-semibold text-ink-950 tabular-nums leading-tight">
        {value}
      </dd>
      <span className="mt-1 text-[10px] text-ink-400 truncate">{detail}</span>
    </div>
  );
}
