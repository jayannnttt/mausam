/**
 * WeatherFeelCard — "How the Weather Feels".
 * Plain-language interpretation of the current conditions via the
 * Weather Feel Engine, with every contributing measurement shown.
 */

import { ThermometerSun, Info } from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader } from "./ui/primitives";
import { DemoBanner, ProviderLine } from "./DataSourceBadge";
import { classifyWeatherFeel } from "../engines/weatherFeelEngine";
import { formatTemp, formatWind } from "../utils/format";

const TONE_STYLES: Record<string, string> = {
  hot: "border-orange-500/50 bg-orange-500/10 text-orange-200",
  warm: "border-amber-450/50 bg-amber-450/10 text-amber-200",
  pleasant: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  cool: "border-sky-450/50 bg-sky-450/10 text-sky-200",
  cold: "border-indigo-400/50 bg-indigo-400/10 text-indigo-200",
  rain: "border-sky-450/50 bg-sky-450/10 text-sky-200",
  storm: "border-red-500/50 bg-red-500/10 text-red-200",
};

export function WeatherFeelCard({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  if (dataset.mode === "UNAVAILABLE" || !dataset.current) {
    return (
      <Card>
        <CardHeader
          title="How the weather feels"
          icon={<ThermometerSun className="h-4 w-4 text-amber-450" aria-hidden="true" />}
        />
        <div className="px-4 py-4 text-sm text-slate-400 sm:px-5">
          Current conditions are unavailable, so no weather-feel description is shown rather than
          guessing.
        </div>
      </Card>
    );
  }

  const nowHourIso = `${dataset.current.time.slice(0, 13)}:00`;
  const hourlyNow = dataset.hourly.find((h) => h.time === nowHourIso);
  const aqNow = dataset.hourlyAirQuality?.find((a) => a.time === nowHourIso);
  const feel = classifyWeatherFeel(dataset.current, hourlyNow, aqNow);

  return (
    <Card ariaLabel="How the weather feels">
      {dataset.mode === "DEMO" && (
        <div className="px-4 pt-3 sm:px-5">
          <DemoBanner />
        </div>
      )}
      <CardHeader
        title="How the weather feels"
        subtitle="Mausam Sense interpretation — not an official meteorological category"
        icon={<ThermometerSun className="h-4 w-4 text-amber-450" aria-hidden="true" />}
      />
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className={`rounded-xl border p-3.5 ${TONE_STYLES[feel.tone] ?? TONE_STYLES.cool}`}>
          <p className="text-xl font-bold">{feel.label}</p>
          <p className="mt-1 text-sm text-slate-200/90">{feel.summary}</p>
          {feel.nuance && (
            <p className="mt-1.5 text-xs text-slate-300">{feel.nuance}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Air temperature"
            value={formatTemp(dataset.current.temperatureC, prefs.temperatureUnit)}
          />
          <Stat
            label="Feels like"
            value={formatTemp(dataset.current.apparentTemperatureC, prefs.temperatureUnit)}
            highlight
          />
          <Stat
            label="Humidity"
            value={
              dataset.current.humidityPct != null
                ? `${Math.round(dataset.current.humidityPct)}%`
                : "—"
            }
          />
          <Stat
            label="Wind"
            value={formatWind(dataset.current.windSpeedKmh, prefs.windUnit)}
          />
        </div>

        <details className="rounded-xl border border-navy-700 bg-navy-850/60 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">
            What drives this description?
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
            {feel.factors.map((f) => (
              <li key={f.label}>
                <strong>{f.label}</strong> — {f.value}: {f.contribution}
              </li>
            ))}
          </ul>
        </details>

        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {feel.disclaimer}
        </p>
        {dataset.providers.weather && <ProviderLine {...dataset.providers.weather} />}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-850 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${highlight ? "text-amber-450" : ""}`}>{value}</p>
    </div>
  );
}
