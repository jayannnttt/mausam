/**
 * AirQualityReport — Dedicated Air Quality & Outdoor Health Dashboard.
 *
 * Integrates CAMS atmospheric model data (PM2.5, PM10, AQI),
 * interactive hourly pollution charts, health impact guidance,
 * and the outdoor Activity Planner (best window to go outside).
 */

import { useMemo } from "react";
import {
  Gauge,
  Wind,
  ShieldAlert,
  Info,
  Footprints,
  Heart,
  AlertCircle,
  Eye,
} from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader, EmptyState } from "./ui/primitives";
import { PollutionChart } from "./charts";
import { ActivityPlanner } from "./ActivityPlanner";
import { pm25Band } from "../engines/aqi";
import { ProviderLine } from "./DataSourceBadge";

export function AirQualityReport({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const nowIso = dataset.current?.time ?? dataset.hourly[0]?.time;
  const aqByTime = useMemo(() => {
    return new Map(dataset.hourlyAirQuality?.map((a) => [a.time, a]) ?? []);
  }, [dataset.hourlyAirQuality]);

  const nowAq = nowIso ? aqByTime.get(nowIso.slice(0, 13) + ":00") : undefined;
  const pm25Val = nowAq?.pm25 ?? null;
  const pm10Val = nowAq?.pm10 ?? null;

  const band = useMemo(() => {
    if (pm25Val == null) return null;
    return pm25Band(pm25Val);
  }, [pm25Val]);

  const pollutionTimeline = useMemo(() => {
    if (!dataset.hourlyAirQuality || dataset.hourlyAirQuality.length === 0) return [];
    const nowKey = nowIso ? nowIso.slice(0, 13) : "";
    const idx = dataset.hourlyAirQuality.findIndex((a) => a.time.slice(0, 13) === nowKey);
    const start = Math.max(0, idx);
    return dataset.hourlyAirQuality.slice(start, start + 24).map((a) => ({
      time: a.time,
      pm25: a.pm25,
      pm10: a.pm10,
    }));
  }, [dataset.hourlyAirQuality, nowIso]);

  if (dataset.mode === "UNAVAILABLE" || (!dataset.hourlyAirQuality && dataset.hourly.length === 0)) {
    return (
      <Card>
        <CardHeader title="Air Quality Telemetry" icon={<Gauge className="h-4 w-4 text-pine" />} />
        <div className="p-5">
          <EmptyState
            title="Air quality data unavailable"
            description="Atmospheric aerosol models could not be loaded for this location."
          />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* PM2.5 Main Card */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              PM2.5 Concentration
            </span>
            <div className="rounded-lg bg-pine/10 p-2 text-pine">
              <Gauge className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {pm25Val != null ? Math.round(pm25Val) : "—"}
              </span>
              <span className="text-sm font-semibold text-ink-600">µg/m³</span>
            </div>
            <p className="mt-1 text-xs font-medium text-ink-600">
              {band ? (
                <span className="font-semibold text-pine">{band.label}</span>
              ) : (
                "Fine particulate matter"
              )}
            </p>
          </div>
        </Card>

        {/* PM10 Card */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              PM10 Coarse Dust
            </span>
            <div className="rounded-lg bg-weather-sun/10 p-2 text-weather-sun">
              <Wind className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {pm10Val != null ? Math.round(pm10Val) : "—"}
              </span>
              <span className="text-sm font-semibold text-ink-600">µg/m³</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">Coarse respirable particulates</p>
          </div>
        </Card>

        {/* Health Impact Indicator */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Sensitive Groups Risk
            </span>
            <div className="rounded-lg bg-weather-rain/10 p-2 text-weather-rain">
              <Heart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                (pm25Val ?? 0) <= 30
                  ? "bg-pine/10 text-pine"
                  : (pm25Val ?? 0) <= 60
                  ? "bg-weather-sun/15 text-ink-900"
                  : "bg-weather-alert/15 text-weather-alert"
              }`}
            >
              {(pm25Val ?? 0) <= 30
                ? "Low Health Risk"
                : (pm25Val ?? 0) <= 60
                ? "Moderate Sensitivity"
                : "Heightened Caution"}
            </span>
            <p className="mt-1 text-xs text-ink-500">
              {(pm25Val ?? 0) <= 30
                ? "Clean ambient conditions for all age groups"
                : "Asthma & respiratory patients should limit intense exercise"}
            </p>
          </div>
        </Card>

        {/* Model Transparency */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Data Source
            </span>
            <div className="rounded-lg bg-line-subtle p-2 text-ink-700">
              <Info className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-sm font-bold text-ink-900">Copernicus (CAMS)</span>
            <p className="mt-1 text-xs text-ink-500">
              Global atmospheric chemistry model forecast. Not a raw ground sensor.
            </p>
          </div>
        </Card>
      </div>

      {/* 24-Hour PM2.5 & PM10 Timeline Chart */}
      {pollutionTimeline.length > 0 && (
        <Card>
          <CardHeader
            title="24-Hour Particulate Concentration Forecast"
            subtitle="PM2.5 (fine) and PM10 (coarse) in µg/m³ · Copernicus CAMS model"
            icon={<Gauge className="h-4 w-4 text-pine" />}
          />
          <div className="p-4 sm:p-6">
            <PollutionChart
              data={pollutionTimeline}
              timeFormat={prefs.timeFormat}
              strictThreshold={prefs.heightenedAqAwareness ? 30 : undefined}
            />
          </div>
        </Card>
      )}

      {/* Outdoor Health Intelligence / Activity Planner */}
      <div>
        <div className="mb-3">
          <h3 className="text-base font-bold text-ink-950">
            Outdoor Health Intelligence & Activity Windows
          </h3>
          <p className="text-xs text-ink-500">
            Transparent rules-based scoring combining air quality, temperature, humidity, UV index, and rain risk.
          </p>
        </div>
        <ActivityPlanner dataset={dataset} prefs={prefs} />
      </div>

      {dataset.providers.airQuality && (
        <div className="text-[11px] text-ink-500">
          <ProviderLine {...dataset.providers.airQuality} />
        </div>
      )}
    </div>
  );
}
