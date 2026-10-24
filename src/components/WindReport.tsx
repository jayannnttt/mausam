/**
 * WindReport — Dedicated Wind Intelligence Dashboard.
 *
 * Displays surface wind speeds, gusts, Beaufort wind scale classifications,
 * interactive 24-hour wind speed trend chart, and practical impact analysis
 * for cycling, commuting, outdoor activities, and agricultural spraying.
 */

import { useMemo } from "react";
import {
  Wind,
  Compass,
  AlertCircle,
  Bike,
  Car,
  Activity,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader, EmptyState } from "./ui/primitives";
import { formatHour, formatWind } from "../utils/format";
import { ProviderLine } from "./DataSourceBadge";

/** Beaufort scale mapping based on wind speed in km/h */
function getBeaufortScale(kmh: number): {
  scale: number;
  label: string;
  description: string;
  color: string;
} {
  if (kmh < 2) return { scale: 0, label: "Calm", description: "Smoke rises vertically. Sea like a mirror.", color: "text-pine" };
  if (kmh < 6) return { scale: 1, label: "Light Air", description: "Direction shown by smoke drift, but not by wind vanes.", color: "text-pine" };
  if (kmh < 12) return { scale: 2, label: "Light Breeze", description: "Wind felt on face; leaves rustle; ordinary vanes moved by wind.", color: "text-pine" };
  if (kmh < 20) return { scale: 3, label: "Gentle Breeze", description: "Leaves and small twigs in constant motion; light flags extended.", color: "text-pine-600" };
  if (kmh < 29) return { scale: 4, label: "Moderate Breeze", description: "Raises dust and loose paper; small branches move.", color: "text-weather-rain" };
  if (kmh < 39) return { scale: 5, label: "Fresh Breeze", description: "Small trees in leaf begin to sway; crested wavelets form on inland waters.", color: "text-weather-rain" };
  if (kmh < 50) return { scale: 6, label: "Strong Breeze", description: "Large branches in motion; whistling heard in telegraph wires; umbrellas used with difficulty.", color: "text-weather-sun" };
  if (kmh < 62) return { scale: 7, label: "Near Gale", description: "Whole trees in motion; inconvenience felt when walking against the wind.", color: "text-weather-sun" };
  if (kmh < 75) return { scale: 8, label: "Gale", description: "Breaks twigs off trees; generally impedes progress.", color: "text-weather-alert" };
  if (kmh < 89) return { scale: 9, label: "Strong Gale", description: "Slight structural damage occurs (chimney-pots and slates removed).", color: "text-weather-alert" };
  return { scale: 10, label: "Storm / Violent Storm", description: "Seldom experienced inland; trees uprooted; considerable structural damage.", color: "text-weather-alert" };
}

import { getTranslation } from "../i18n/translations";

export function WindReport({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const t = getTranslation(prefs.language);
  const currentSpeed = dataset.current?.windSpeedKmh ?? 0;
  const beaufort = getBeaufortScale(currentSpeed);

  const hourlyWind = useMemo(() => {
    const nowIso = dataset.current?.time ?? dataset.hourly[0]?.time;
    const nowKey = nowIso ? nowIso.slice(0, 13) : "";
    const idx = dataset.hourly.findIndex((h) => h.time.slice(0, 13) === nowKey);
    const start = Math.max(0, idx);
    return dataset.hourly.slice(start, start + 24).map((h) => {
      const spd = h.windSpeedKmh ?? 0;
      // Convert to mph if user preference
      const displayVal = prefs.windUnit === "mph" ? Math.round(spd * 0.621371) : Math.round(spd);
      const estGust = Math.round(displayVal * 1.35); // Estimated gust speed
      return {
        time: h.time,
        label: formatHour(h.time, prefs.timeFormat),
        speed: displayVal,
        gust: estGust,
      };
    });
  }, [dataset.hourly, dataset.current?.time, prefs.timeFormat, prefs.windUnit]);

  // Statistics for next 24h
  const stats = useMemo(() => {
    if (hourlyWind.length === 0) return { max: 0, min: 0, avg: 0 };
    const speeds = hourlyWind.map((h) => h.speed);
    const max = Math.max(...speeds);
    const min = Math.min(...speeds);
    const avg = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
    return { max, min, avg };
  }, [hourlyWind]);

  if (dataset.mode === "UNAVAILABLE" || dataset.hourly.length === 0) {
    return (
      <Card>
        <CardHeader title={t.windReportTitle} icon={<Wind className="h-4 w-4 text-pine" />} />
        <div className="p-5">
          <EmptyState
            title="Wind telemetry unavailable"
            description="Wind and atmospheric circulation data could not be retrieved for this location."
          />
        </div>
      </Card>
    );
  }

  const unitLabel = prefs.windUnit === "mph" ? "mph" : "km/h";

  return (
    <div className="space-y-5">
      {/* Overview Hero Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Current Wind Speed Hero */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              {t.currentSurfaceWind}
            </span>
            <div className="rounded-lg bg-pine/10 p-2 text-pine">
              <Wind className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {formatWind(currentSpeed, prefs.windUnit).split(" ")[0]}
              </span>
              <span className="text-sm font-semibold text-ink-600">{unitLabel}</span>
            </div>
            <p className={`mt-1 text-xs font-semibold ${beaufort.color}`}>
              {beaufort.label}
            </p>
          </div>
        </Card>

        {/* 24h Peak Wind Gust */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Peak Gust Risk
            </span>
            <div className="rounded-lg bg-weather-sun/10 p-2 text-weather-sun">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {Math.round(stats.max * 1.35)}
              </span>
              <span className="text-sm font-semibold text-ink-600">{unitLabel} (est.)</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Expected around peak thermal hours
            </p>
          </div>
        </Card>

        {/* 24h Average Speed */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              24-Hour Average
            </span>
            <div className="rounded-lg bg-weather-rain/10 p-2 text-weather-rain">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {stats.avg}
              </span>
              <span className="text-sm font-semibold text-ink-600">{unitLabel}</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Span: {stats.min} → {stats.max} {unitLabel}
            </p>
          </div>
        </Card>

        {/* Agricultural / Outdoor Safety Status */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Spray & Outdoor Safety
            </span>
            <div className="rounded-lg bg-line-subtle p-2 text-ink-700">
              <Compass className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                currentSpeed < 15
                  ? "bg-pine/10 text-pine"
                  : currentSpeed < 25
                  ? "bg-weather-sun/15 text-ink-900"
                  : "bg-weather-alert/15 text-weather-alert"
              }`}
            >
              {currentSpeed < 15 ? "Favorable for Spraying" : currentSpeed < 25 ? "Moderate Drift Risk" : "Unfavorable (High Drift)"}
            </span>
            <p className="mt-1 text-xs text-ink-500">
              {currentSpeed < 15 ? "Minimal pesticide/spray drift" : "Delay pesticide application if possible"}
            </p>
          </div>
        </Card>
      </div>

      {/* Main 24-Hour Wind Speed Trend Chart */}
      <Card>
        <CardHeader
          title="24-Hour Wind Speed & Gust Projection"
          subtitle={`Surface speeds and estimated gusts in ${unitLabel}`}
          icon={<Wind className="h-4 w-4 text-pine" />}
        />
        <div className="p-4 sm:p-6 space-y-4">
          <div className="h-64 w-full" role="img" aria-label="24-hour wind speed trend chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourlyWind} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#35665F" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#35665F" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#DEE2DD" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#68747A", fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
                <YAxis tick={{ fill: "#68747A", fontSize: 11 }} width={38} unit={` ${unitLabel}`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-line bg-surface p-2.5 text-xs shadow-md">
                        <p className="font-semibold text-ink-900">{label}</p>
                        <p className="mt-1 text-pine font-medium">
                          Sustained: {payload[0]?.value} {unitLabel}
                        </p>
                        <p className="text-weather-sun font-medium">
                          Gusts (est.): {payload[1]?.value} {unitLabel}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="speed"
                  name="Sustained Wind"
                  stroke="#35665F"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#windGradient)"
                />
                <Line
                  type="monotone"
                  dataKey="gust"
                  name="Peak Gusts"
                  stroke="#D9A441"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-600">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-pine" />
                {t.sustainedSpeed} ({unitLabel})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-weather-sun" />
                {t.estimatedGusts} ({unitLabel})
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Beaufort Scale & Commute Impact Matrix */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Beaufort Scale Reference */}
        <Card>
          <CardHeader
            title={t.windScaleTitle}
            subtitle={t.windScaleSub}
            icon={<Compass className="h-4 w-4 text-pine" />}
          />
          <div className="p-4 sm:p-5 space-y-3">
            <div className="rounded-lg border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-950">
                  {beaufort.label}
                </span>
                <span className={`text-xs font-semibold ${beaufort.color}`}>
                  {formatWind(currentSpeed, prefs.windUnit)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-600 leading-relaxed">
                {beaufort.description}
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-line-subtle text-ink-600">
                <span>0–5 km/h</span>
                <span className="text-pine font-medium">Safe & Calm</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-line-subtle text-ink-600">
                <span>6–19 km/h</span>
                <span className="text-pine font-medium">Pleasant Breeze</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-line-subtle text-ink-600">
                <span>20–38 km/h</span>
                <span className="text-weather-sun font-medium">Moderate Wind</span>
              </div>
              <div className="flex items-center justify-between py-1 text-ink-600">
                <span>39+ km/h</span>
                <span className="text-weather-alert font-medium">Caution Advised</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Activity & Commute Impact Guidance */}
        <Card>
          <CardHeader
            title={t.transitAdvisoryTitle}
            subtitle={t.transitAdvisorySub}
            icon={<AlertCircle className="h-4 w-4 text-pine" />}
          />
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
              <Bike className="mt-0.5 h-4 w-4 shrink-0 text-pine" />
              <div>
                <h4 className="text-xs font-semibold text-ink-900">{t.cyclingTwoWheelers}</h4>
                <p className="mt-0.5 text-xs text-ink-600 leading-relaxed">
                  {currentSpeed < 20
                    ? t.cyclingSafe
                    : currentSpeed < 35
                    ? t.cyclingModerate
                    : t.cyclingCaution}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
              <Car className="mt-0.5 h-4 w-4 shrink-0 text-pine" />
              <div>
                <h4 className="text-xs font-semibold text-ink-900">{t.highwayVehicles}</h4>
                <p className="mt-0.5 text-xs text-ink-600 leading-relaxed">
                  {currentSpeed < 30
                    ? t.drivingNormal
                    : t.drivingCaution}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-pine" />
              <div>
                <h4 className="text-xs font-semibold text-ink-900">{t.outdoorHazards}</h4>
                <p className="mt-0.5 text-xs text-ink-600 leading-relaxed">
                  {currentSpeed < 15
                    ? t.outdoorSafe
                    : t.outdoorCaution}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
