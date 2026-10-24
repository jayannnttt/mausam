/**
 * RainReport — Dedicated Rainfall & Precipitation Dashboard.
 *
 * Consolidates rainfall totals (24/48/72 h), wet-spell detection,
 * hourly rain probability charts (next 48h), daily rainfall accumulation charts,
 * and agricultural/outdoor rain advisories into a clean, focused report.
 */

import { useMemo, useState } from "react";
import {
  CloudRain,
  Droplets,
  CalendarDays,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Umbrella,
  FileText,
} from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader, EmptyState } from "./ui/primitives";
import { buildFarmOutlook } from "../engines/farmingEngine";
import { RainfallChart, RainProbabilityChart } from "./charts";
import { formatRange, formatTemp, todayIso } from "../utils/format";
import { ProviderLine } from "./DataSourceBadge";

import { getTranslation } from "../i18n/translations";

const TONE_CHIP: Record<string, string> = {
  alert: "border-weather-alert/40 bg-weather-alert/10 text-weather-alert",
  watch: "border-weather-sun/40 bg-weather-sun/10 text-ink-950",
  info: "border-weather-rain/40 bg-weather-rain/10 text-ink-950",
  calm: "border-pine-600/30 bg-pine-600/10 text-pine-900",
};

export function RainReport({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const t = getTranslation(prefs.language);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const outlook = useMemo(() => buildFarmOutlook(dataset), [dataset]);

  if (dataset.mode === "UNAVAILABLE" || dataset.hourly.length === 0) {
    return (
      <Card>
        <CardHeader title={t.rainReportTitle} icon={<CloudRain className="h-4 w-4 text-weather-rain" />} />
        <div className="p-5">
          <EmptyState
            title="Precipitation data unavailable"
            description="Rainfall telemetry and forecast data could not be retrieved for this location."
          />
        </div>
      </Card>
    );
  }

  const today = todayIso(dataset.timezone);
  const p24 = outlook.periods[0];
  const nowKey = dataset.current?.time.slice(0, 13) ?? dataset.hourly[0]?.time.slice(0, 13);
  const next48 = dataset.hourly
    .filter((h) => h.time.slice(0, 13) >= nowKey)
    .slice(0, 48);

  const currentRate = dataset.current?.precipitationMm ?? 0;

  return (
    <div className="space-y-5">
      {/* Overview Stat Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Current Rain Status */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              {t.currentRainRate}
            </span>
            <div className="rounded-lg bg-weather-rain/10 p-2 text-weather-rain">
              <Umbrella className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {currentRate}
              </span>
              <span className="text-sm font-semibold text-ink-600">mm / hr</span>
            </div>
            <p className="mt-1 text-xs font-medium text-ink-500">
              {currentRate > 0 ? t.activeRainDetected : t.noRainCurrently}
            </p>
          </div>
        </Card>

        {/* 24h Total */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              {t.next24hAccumulation}
            </span>
            <div className="rounded-lg bg-weather-rain/10 p-2 text-weather-rain">
              <Droplets className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-weather-rain tabular-nums">
                {outlook.periods[0]?.hasData ? `${outlook.periods[0].totalMm}` : "0"}
              </span>
              <span className="text-sm font-semibold text-ink-600">mm</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {t.chanceOfRain}: {outlook.periods[0]?.maxProbabilityPct ?? 0}%
            </p>
          </div>
        </Card>

        {/* 48h Total */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              {t.rainTotal48h}
            </span>
            <div className="rounded-lg bg-pine/10 p-2 text-pine">
              <Droplets className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {outlook.periods[1]?.hasData ? `${outlook.periods[1].totalMm}` : "0"}
              </span>
              <span className="text-sm font-semibold text-ink-600">mm</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {t.chanceOfRain}: {outlook.periods[1]?.maxProbabilityPct ?? 0}%
            </p>
          </div>
        </Card>

        {/* 72h Total */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Next 72h Accumulation
            </span>
            <div className="rounded-lg bg-pine/10 p-2 text-pine">
              <Droplets className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-ink-950 tabular-nums">
                {outlook.periods[2]?.hasData ? `${outlook.periods[2].totalMm}` : "0"}
              </span>
              <span className="text-sm font-semibold text-ink-600">mm</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Peak probability: {outlook.periods[2]?.maxProbabilityPct ?? 0}%
            </p>
          </div>
        </Card>
      </div>

      {/* Planning Messages & Wet Spell Windows */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Rainfall Guidance & Impact */}
        <Card>
          <CardHeader
            title="Precipitation Guidance & Impact"
            subtitle="Advisories calculated from rain thresholds and continuous wet spells"
            icon={<ShieldCheck className="h-4 w-4 text-pine" />}
          />
          <div className="p-4 sm:p-5 space-y-3">
            {outlook.messages.map((m, i) => (
              <div key={i} className={`rounded-xl border p-3 text-xs leading-relaxed ${TONE_CHIP[m.tone]}`}>
                {m.text}
              </div>
            ))}

            {outlook.messages.length === 0 && (
              <p className="text-xs text-ink-500">
                No significant rainfall threats or wet spells flagged in the immediate forecast horizon.
              </p>
            )}
          </div>
        </Card>

        {/* Wet Spells in Next 24 Hours */}
        <Card>
          <CardHeader
            title="Identified Wet Spells (Next 24h)"
            subtitle="Contiguous hours of anticipated rainfall"
            icon={<Clock className="h-4 w-4 text-weather-rain" />}
          />
          <div className="p-4 sm:p-5 space-y-3">
            {p24.rainPeriods.length > 0 ? (
              <ul className="space-y-2">
                {p24.rainPeriods.map((rp, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-ink-900">
                        {formatRange(rp.start, rp.end, prefs.timeFormat)}
                      </span>
                      <p className="text-[11px] text-ink-500">Duration: {rp.hours} hours</p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-weather-rain tabular-nums">
                        ~{Math.round(rp.totalMm * 10) / 10} mm
                      </span>
                      {rp.maxProbabilityPct != null && (
                        <p className="text-[11px] text-ink-500">
                          {Math.round(rp.maxProbabilityPct)}% peak likelihood
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-ink-500">
                <Umbrella className="h-6 w-6 text-ink-300 mb-1" />
                <p>No continuous wet spells expected in the next 24 hours.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Rain Charts Section */}
      <div className="space-y-5">
        {/* 48-Hour Rain Probability Chart */}
        {next48.length > 0 && (
          <Card>
            <CardHeader
              title={t.hourlyRainProb}
              subtitle={t.chanceOfRainByHour}
              icon={<CloudRain className="h-4 w-4 text-weather-rain" />}
            />
            <div className="p-4 sm:p-5">
              <RainProbabilityChart
                data={next48.map((h) => ({
                  time: h.time,
                  prob: h.precipitationProbabilityPct,
                  mm: h.precipitationMm,
                }))}
                timeFormat={prefs.timeFormat}
              />
            </div>
          </Card>
        )}

        {/* Daily Rainfall Forecast Chart */}
        <Card>
          <CardHeader
            title={t.dailyRainOutlook}
            subtitle={t.dailyRainSubtitle}
            icon={<CalendarDays className="h-4 w-4 text-pine" />}
          />
          <div className="p-4 sm:p-5">
            <RainfallChart
              data={outlook.daily.map((d) => ({
                label: d.label,
                mm: d.precipSumMm,
                prob: d.probabilityMaxPct,
              }))}
              timeFormat={prefs.timeFormat}
            />
          </div>
        </Card>
      </div>

      {/* Official Agromet / District Advisory (if present) */}
      {dataset.advisories && dataset.advisories.length > 0 && (
        <Card>
          <CardHeader
            title={t.officialBulletin}
            subtitle={t.viewOfficialAdvisory}
            icon={<FileText className="h-4 w-4 text-pine" />}
          />
          <div className="p-4 sm:p-5 space-y-3">
            {dataset.advisories.map((a) => (
              <div key={a.id} className="rounded-lg border border-line bg-surface p-3 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-ink-900">{a.title}</h4>
                  <span className="text-[10px] text-ink-500">{a.issueDate}</span>
                </div>
                <p className="mt-1 text-ink-600 leading-relaxed">{a.summary}</p>
                {a.sourceUrl && (
                  <a
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-pine hover:underline"
                  >
                    {t.viewOfficialAdvisory}
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
