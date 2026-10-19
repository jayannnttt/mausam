/**
 * CurrentWeatherCard — latest conditions + hourly strip + 7-day forecast.
 * Forecast values are visually separated from the current/latest value, and
 * the provider + update time are always shown.
 */

import { useMemo } from "react";
import { Droplets, Wind, Gauge, CloudRain, Sun, Clock } from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { DemoBanner, ProviderLine, DataSourceBadge } from "./DataSourceBadge";
import { Card, CardHeader } from "./ui/primitives";
import { WeatherIcon, isNightTime, weatherCodeText } from "../utils/wmo";
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
import { useDemoWarningAwareness } from "./useDemoWarningAwareness";

export function CurrentWeatherCard({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
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
  const demoAware = useDemoWarningAwareness(dataset);

  if (!dataset.current && upcoming.length === 0) {
    return null;
  }

  const c = dataset.current;
  const today = todayIso(dataset.timezone);

  return (
    <Card ariaLabel="Current weather">
      {dataset.mode === "DEMO" && <div className="px-4 pt-3 sm:px-5"><DemoBanner /></div>}
      <CardHeader
        title={dataset.location.name}
        subtitle={
          <>
            {dataset.location.admin1 ? `${dataset.location.admin1} · ` : ""}
            {locationClock(dataset.timezone, prefs.timeFormat)} local
          </>
        }
        icon={<WeatherIcon code={c?.weatherCode} className="h-4 w-4 text-sky-450" />}
        action={<DataSourceBadge mode={dataset.mode} />}
      />

      <div className="px-4 pb-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-start gap-3">
              <WeatherIcon
                code={c?.weatherCode}
                className="h-14 w-14 text-sky-350"
              />
              <div>
                <p className="text-5xl font-bold tracking-tight" aria-label="Temperature">
                  {formatTemp(c?.temperatureC ?? null, prefs.temperatureUnit)}
                </p>
                <p className="mt-0.5 text-sm text-slate-300">
                  {weatherCodeText(c?.weatherCode)}
                </p>
              </div>
            </div>
            {c?.apparentTemperatureC != null && (
              <p className="mt-2 text-sm text-slate-300">
                Feels like{" "}
                <strong>{formatTemp(c.apparentTemperatureC, prefs.temperatureUnit)}</strong>
              </p>
            )}
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Latest model analysis · {formatHour(nowIso ?? "", prefs.timeFormat)} local
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-1">
            <Metric
              icon={<Droplets className="h-4 w-4 text-sky-450" aria-hidden="true" />}
              label="Humidity"
              value={c?.humidityPct != null ? `${Math.round(c.humidityPct)}%` : "—"}
            />
            <Metric
              icon={<Wind className="h-4 w-4 text-sky-450" aria-hidden="true" />}
              label="Wind"
              value={formatWind(c?.windSpeedKmh ?? null, prefs.windUnit)}
            />
            <Metric
              icon={<CloudRain className="h-4 w-4 text-sky-450" aria-hidden="true" />}
              label="Rain now"
              value={
                c?.precipitationMm != null ? `${c.precipitationMm} mm` : "—"
              }
            />
            {nowIso && aqByTime.get(`${nowIso.slice(0, 13)}:00`)?.pm25 != null && (
              <Metric
                icon={<Gauge className="h-4 w-4 text-sky-450" aria-hidden="true" />}
                label="PM2.5"
                value={`${nowAq?.pm25 != null ? Math.round(nowAq.pm25 * 10) / 10 : "—"} µg/m³`}
              />
            )}
          </dl>
        </div>

        {/* Hourly strip — clearly labelled as forecast */}
        <div className="mt-5">
          <p className="label-caps">
            Next 24 hours — forecast {tempUnitLabel(prefs.temperatureUnit)}
          </p>
          <ul
            className="strip-scroll mt-2 flex gap-1.5 overflow-x-auto pb-2"
            aria-label="Hourly forecast"
          >
            {upcoming.map((h, i) => (
              <li
                key={h.time}
                className={`flex w-14 shrink-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 ${
                  i === 0
                    ? "border-sky-450/60 bg-sky-450/10"
                    : "border-navy-700/60 bg-navy-850"
                }`}
              >
                <span className="text-[11px] font-medium text-slate-300">
                  {i === 0 ? "Now" : formatHour(h.time, prefs.timeFormat)}
                </span>
                <WeatherIcon
                  code={h.weatherCode}
                  isNight={isNightTime(h.time)}
                  className="h-5 w-5 text-sky-350"
                />
                <span className="text-sm font-semibold">
                  {formatTemp(h.temperatureC, prefs.temperatureUnit)}
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    (h.precipitationProbabilityPct ?? 0) >= 50
                      ? "text-sky-350"
                      : "text-slate-500"
                  }`}
                  aria-label={`${h.precipitationProbabilityPct ?? 0} percent chance of rain`}
                >
                  {h.precipitationProbabilityPct != null
                    ? `${Math.round(h.precipitationProbabilityPct)}%`
                    : "·"}
                </span>
                {aqByTime.get(h.time)?.pm25 != null && (
                  <span
                    className="text-[10px] text-slate-500"
                    title="PM2.5 (µg/m³, model estimate)"
                  >
                    {Math.round(aqByTime.get(h.time)!.pm25!)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-slate-500">
            Rain % = probability of precipitation · bottom number = PM2.5 µg/m³ (model estimate)
          </p>
        </div>

        {/* 7-day forecast */}
        {dataset.daily.length > 0 && (
          <div className="mt-4">
            <p className="label-caps">7-day forecast</p>
            <ul className="mt-2 divide-y divide-navy-700/50" aria-label="Daily forecast">
              {dataset.daily.map((d) => (
                <li key={d.date} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-16 shrink-0 font-medium text-slate-300">
                    {dayLabel(d.date, today)}
                  </span>
                  <WeatherIcon
                    code={d.weatherCode}
                    isNight={false}
                    className="h-5 w-5 shrink-0 text-sky-350"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                    {weatherCodeText(d.weatherCode)}
                  </span>
                  <span
                    className="w-12 shrink-0 text-right text-xs font-semibold text-sky-350"
                    aria-label={`${d.precipitationProbabilityMaxPct ?? 0} percent max rain probability`}
                  >
                    {d.precipitationProbabilityMaxPct != null
                      ? `${Math.round(d.precipitationProbabilityMaxPct)}%`
                      : "—"}
                  </span>
                  <span className="w-20 shrink-0 text-right font-medium">
                    <span className="text-slate-100">
                      {formatTemp(d.tempMaxC, prefs.temperatureUnit)}
                    </span>{" "}
                    <span className="text-slate-500">
                      {formatTemp(d.tempMinC, prefs.temperatureUnit)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* UV + visibility snapshot when available */}
        {(upcoming[0]?.uvIndex != null || upcoming[0]?.visibilityM != null) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {upcoming[0].uvIndex != null && (
              <span className="chip">
                <Sun className="h-3 w-3 text-amber-450" aria-hidden="true" />
                UV now: {Math.round(upcoming[0].uvIndex * 10) / 10}
              </span>
            )}
            {upcoming[0].visibilityM != null && (
              <span className="chip">Visibility: {formatVisibility(upcoming[0].visibilityM)}</span>
            )}
          </div>
        )}

        {demoAware}
        <div className="mt-3 space-y-1">
          {dataset.providers.weather && (
            <ProviderLine {...dataset.providers.weather} />
          )}
          {dataset.providers.airQuality && <ProviderLine {...dataset.providers.airQuality} />}
        </div>
      </div>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <dt className="text-[11px] text-slate-400">{label}</dt>
        <dd className="font-semibold leading-tight">{value}</dd>
      </div>
    </div>
  );
}
