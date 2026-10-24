/**
 * ActivityPlanner — "Best Time to Go Outside".
 *
 * Ranks the next forecast hours for the chosen activity using the transparent
 * rules-based engine, shows the recommended window, explains the reasoning,
 * and lets the user compare alternative windows. Includes real hourly charts
 * for the score, air quality, and temperature/humidity.
 */

import { useMemo, useState } from "react";
import {
  Footprints,
  Bike,
  PersonStanding,
  Timer,
  Info,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ListChecks,
  Gauge,
} from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader, Meter, ErrorState } from "./ui/primitives";
import { ProviderLine } from "./DataSourceBadge";
import { ScoreTimeline, PollutionChart, TempHumidityChart } from "./charts";
import { usePreferences } from "../state/preferencesContext";
import {
  ACTIVITY_PROFILES,
  FACTOR_LABELS,
  rankHours,
  type ActivityKey,
  type FactorKey,
  type ScoredWindow,
} from "../engines/recommendationEngine";
import { pm25Band } from "../engines/aqi";
import { formatRange, formatHour, todayIso, zonedNow } from "../utils/format";
import { isNightTime } from "../utils/wmo";

const TONE_FOR_SCORE = (s: number): "green" | "sky" | "amber" | "red" =>
  s >= 75 ? "green" : s >= 55 ? "sky" : s >= 35 ? "amber" : "red";

export function ActivityPlanner({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const { t } = usePreferences();
  const [activity, setActivity] = useState<ActivityKey>("running");
  const [showWhy, setShowWhy] = useState(true);
  const [showAllWindows, setShowAllWindows] = useState(false);

  const activitiesList: { key: ActivityKey; label: string; icon: typeof Footprints }[] = [
    { key: "running", label: t.actRunning, icon: Footprints },
    { key: "jogging", label: t.actJogging, icon: Footprints },
    { key: "walking", label: t.actWalking, icon: PersonStanding },
    { key: "cycling", label: t.actCycling, icon: Bike },
    { key: "general", label: t.actGeneral, icon: Timer },
  ];

  const rankLabels = [t.bestWindow, t.secondOption, t.thirdOption];

  const getBandLabel = (tone: number) => {
    if (tone === 0) return t.aqGood;
    if (tone === 1) return t.aqFair;
    if (tone === 2) return t.aqModerate;
    if (tone === 3) return t.aqPoor;
    return t.aqVeryPoor;
  };

  const getBandAdvice = (tone: number) => {
    if (tone === 0) return t.aqAdviceGood;
    if (tone === 1) return t.aqAdviceFair;
    if (tone === 2) return t.aqAdviceModerate;
    if (tone === 3) return t.aqAdvicePoor;
    return t.aqAdviceVeryPoor;
  };

  const factorLabels: Record<FactorKey, string> = {
    airQuality: t.factorAirQuality,
    heat: t.factorTemperature,
    uv: t.factorUv,
    rain: t.factorRain,
    wind: t.factorWind,
    humidity: t.factorHumidity,
    warning: t.factorWarning,
  };

  const nowHour = zonedNow(dataset.timezone).hour;
  const today = todayIso(dataset.timezone);

  const planning = useMemo(() => {
    if (dataset.mode === "UNAVAILABLE" || dataset.hourly.length === 0) return null;

    // Planning horizon: from the current hour for the next 24 hours.
    const nowKey =
      dataset.current?.time.slice(0, 13) ??
      `${today}T${String(nowHour).padStart(2, "0")}`;
    const upcoming = dataset.hourly
      .filter((h) => h.time.slice(0, 13) >= nowKey)
      .slice(0, 24);

    const aqMap = new Map(
      (dataset.hourlyAirQuality ?? []).map((a) => [a.time, a]),
    );

    // Map active official warnings onto the hours they cover.
    const warningsByHour: Record<string, "red" | "orange" | "yellow"> = {};
    const warningsAvailable =
      dataset.mode === "LIVE"
        ? Boolean(dataset.providers.warnings)
        : dataset.mode === "DEMO"
          ? true // demo fixtures may include clearly-labelled demo warnings
          : false;
    for (const w of dataset.warnings) {
      if (w.severity === "unknown") continue;
      for (const h of upcoming) {
        // Warnings use "yyyy-MM-dd HH:mm" or ISO strings; match by hour window.
        const hourStart = new Date(`${h.time.slice(0, 13)}:00:00Z`).getTime();
        const from = parseLooseTime(w.effectiveFrom, today);
        const to = parseLooseTime(w.effectiveTo, today);
        if (from != null && to != null && hourStart >= from && hourStart < to) {
          warningsByHour[h.time] = w.severity;
        }
      }
    }

    return rankHours(upcoming, aqMap, activity, {
      heightenedAqAwareness: prefs.heightenedAqAwareness,
      warningsByHour,
      warningsAvailable,
    });
  }, [dataset, activity, prefs.heightenedAqAwareness, nowHour, today]);

  if (!planning) {
    return (
      <Card>
        <CardHeader title="Best time to go outside" icon={<Footprints className="h-4 w-4 text-sky-450" aria-hidden="true" />} />
        <div className="p-4 sm:p-5">
          <ErrorState
            title="No forecast data available"
            description={
              dataset.modeReason ??
              "Hourly forecast data could not be loaded, so outdoor windows cannot be ranked."
            }
          />
        </div>
      </Card>
    );
  }

  const best = planning.windows[0] ?? null;
  const others = planning.windows.slice(1);
  const scoreData = planning.hourScores.map((h) => ({ time: h.time, score: h.total }));

  // Worst hour among the planning horizon, for "what to avoid" guidance.
  const worst = [...planning.hourScores]
    .filter((h) => h.total != null)
    .sort((a, b) => (a.total ?? 0) - (b.total ?? 0))[0];

  const aqNow = dataset.hourlyAirQuality?.find(
    (a) => a.time.slice(0, 13) === (dataset.current?.time.slice(0, 13) ?? ""),
  );
  const pm25Now = aqNow?.pm25 ?? null;
  const band = pm25Now != null ? pm25Band(pm25Now, prefs.heightenedAqAwareness) : null;

  return (
    <Card ariaLabel={t.activityPlannerTitle}>
      <CardHeader
        title={t.activityPlannerTitle}
        subtitle={t.activityPlannerSub}
        icon={<Footprints className="h-4 w-4 text-pine-600" aria-hidden="true" />}
        action={
          <span className="chip" title={t.dataCoverage}>
            {t.dataCoverage} {Math.round(planning.dataCoverage * 100)}%
          </span>
        }
      />

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {/* Activity selector */}
        <div
          className="strip-scroll flex gap-1.5 overflow-x-auto pb-1"
          role="group"
          aria-label={t.activityPlannerTitle}
        >
          {activitiesList.map((a) => {
            const Icon = a.icon;
            const active = a.key === activity;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setActivity(a.key)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-pine-600 bg-pine-600/10 text-pine-700 font-semibold"
                    : "border-line bg-surface text-ink-600 hover:border-line-strong"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {a.label}
              </button>
            );
          })}
        </div>

        {/* Current outdoor conditions snapshot */}
        <section aria-label={t.outdoorConditionsNow}>
          <p className="label-caps">{t.outdoorConditionsNow}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {band ? (
              <span
                className={`chip ${
                  band.tone <= 1
                    ? "border-pine-600/40 text-pine-800"
                    : band.tone === 2
                      ? "border-weather-sun/40 text-ink-900"
                      : "border-weather-alert/40 text-weather-alert"
                }`}
                title={getBandAdvice(band.tone)}
              >
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                PM2.5 {pm25Now != null ? Math.round(pm25Now * 10) / 10 : "—"} µg/m³ · {getBandLabel(band.tone)}
              </span>
            ) : (
              <span className="chip text-ink-400">
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                PM2.5 —
              </span>
            )}
            {prefs.heightenedAqAwareness && (
              <span className="chip border-pine-600/40 text-pine-700">
                {t.heightenedAwarenessActive}
              </span>
            )}
            {best && (
              <span className="chip border-pine-600/40 text-pine-800">
                {t.bestScoreToday}: {Math.round(best.score)}/100
              </span>
            )}
          </div>
          {band && <p className="mt-1.5 text-xs text-ink-500">{getBandAdvice(band.tone)}</p>}
        </section>

        {/* Recommendation */}
        {planning.insufficient ? (
          <ErrorState
            title="A confident ranking is not possible right now"
            description={planning.insufficient.reason}
          />
        ) : best ? (
          <section
            className="rounded-xl border border-pine-600/30 bg-pine-600/5 p-4"
            aria-label={t.recommendedWindow}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-caps text-pine-700">{t.recommendedWindow}</p>
                <p className="mt-1 text-xl font-bold text-ink-900">
                  {formatRange(best.start, best.end, prefs.timeFormat)}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {dataset.location.name} · {best.merged ? t.mergedGoodHours : `${ACTIVITY_PROFILES[activity].windowHours} ${t.hoursWindow}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-pine-700">{Math.round(best.score)}</p>
                <p className="text-[10px] uppercase tracking-wider text-ink-400">
                  {t.scoreLabel} /100
                </p>
                <div className="mt-1 w-24">
                  <Meter value={best.score} tone={TONE_FOR_SCORE(best.score)} label="Window score" />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowWhy((s) => !s)}
              aria-expanded={showWhy}
              className="mt-3 flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-800 hover:border-line-strong"
            >
              <span className="flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-pine-600" aria-hidden="true" />
                {t.whyThisTime}
              </span>
              {showWhy ? (
                <ChevronUp className="h-4 w-4 text-ink-500" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 text-ink-500" aria-hidden="true" />
              )}
            </button>

            {showWhy && (
              <div className="mt-2 space-y-2">
                <ul className="space-y-1.5">
                  {best.hours[0]?.factors
                    .filter((f) => f.score != null && f.weight > 6)
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 4)
                    .map((f) => (
                      <li key={f.key} className="flex items-start gap-2 text-xs">
                        <span
                          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                            (f.score ?? 0) >= 75
                              ? "bg-pine-600"
                              : (f.score ?? 0) >= 50
                                ? "bg-weather-sun"
                                : "bg-weather-alert"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="text-ink-700">
                          <strong className="text-ink-900">{factorLabels[f.key]}:</strong> {f.detail}{" "}
                          <span className="text-ink-400 tabular-nums">
                            ({t.scoreLabel} {Math.round(f.score ?? 0)}, {t.weightLabel} {Math.round(f.weight)}%)
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
                {others.length > 0 && (
                  <p className="text-xs text-ink-500">
                    {t.secondOption}: {formatRange(others[0].start, others[0].end, prefs.timeFormat)} ({t.scoreLabel} {Math.round(others[0].score)}/100).
                  </p>
                )}
              </div>
            )}
          </section>
        ) : null}

        {/* Other windows */}
        {!planning.insufficient && others.length > 0 && (
          <section aria-label={t.otherAvailableWindows}>
            <p className="label-caps">{t.otherAvailableWindows}</p>
            <ul className="mt-2 space-y-2">
              {(showAllWindows ? others : others.slice(0, 2)).map((w, i) => (
                <li key={w.start} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {rankLabels[i + 1] ?? rankLabels[2]}: {formatRange(w.start, w.end, prefs.timeFormat)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {t.scoreLabel}: {Math.round(w.score)}/100
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums text-ink-900">{Math.round(w.score)}</p>
                      <div className="w-20">
                        <Meter value={w.score} tone={TONE_FOR_SCORE(w.score)} label={`Score for ${w.start}`} />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {others.length > 2 && (
              <button
                type="button"
                className="btn mt-2 w-full"
                onClick={() => setShowAllWindows((s) => !s)}
              >
                {showAllWindows ? t.showFewerOptions : `${t.showMoreOptions} (${others.length - 2})`}
              </button>
            )}
          </section>
        )}

        {/* Charts */}
        <section aria-label={t.scoreByHourTitle}>
          <p className="label-caps">{t.scoreByHourTitle}</p>
          <ScoreTimeline
            data={scoreData}
            timeFormat={prefs.timeFormat}
            highlightRange={best ? { from: best.start, to: best.end } : undefined}
          />
        </section>

        {(dataset.hourlyAirQuality?.length ?? 0) > 0 && (
          <section aria-label={t.pmTimelineTitle}>
            <p className="label-caps">{t.pmTimelineTitle} — PM2.5 & PM10 (µg/m³)</p>
            <PollutionChart
              data={planning.hourScores
                .map((h) => dataset.hourlyAirQuality?.find((a) => a.time === h.time))
                .filter((a): a is NonNullable<typeof a> => Boolean(a))
                .map((a) => ({ time: a.time, pm25: a.pm25, pm10: a.pm10 }))}
              timeFormat={prefs.timeFormat}
              strictThreshold={prefs.heightenedAqAwareness ? 10 : undefined}
            />
          </section>
        )}

        <section aria-label={t.tempHumidityTitle}>
          <p className="label-caps">{t.tempHumidityTitle}</p>
          <TempHumidityChart
            data={planning.hourScores.map((h) => {
              const hw = dataset.hourly.find((x) => x.time === h.time);
              return {
                time: h.time,
                tempC: hw?.temperatureC ?? null,
                feelsC: hw?.apparentTemperatureC ?? null,
                humidity: hw?.humidityPct ?? null,
              };
            })}
            timeFormat={prefs.timeFormat}
            tempUnit={prefs.temperatureUnit}
          />
        </section>

        {/* Caveats / Limitations */}
        <details className="rounded-xl border border-line bg-surface/50 p-3 text-xs text-ink-600">
          <summary className="cursor-pointer font-medium text-ink-800">
            {t.rankingMethodology}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              {t.activityPlannerSub}.
            </li>
          </ul>
        </details>

        {planning.notes.map((n, i) => (
          <p key={i} className="flex items-start gap-1.5 text-xs text-amber-200/90">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {n}
          </p>
        ))}
        {planning.confidence === "low" && (
          <p className="flex items-start gap-1.5 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Low data coverage — treat this ranking as indicative only.
          </p>
        )}

        {dataset.providers.airQuality && <ProviderLine {...dataset.providers.airQuality} />}
      </div>
    </Card>
  );
}

/** Parse "2026-10-19 14:00" or ISO strings into epoch ms; null when unknown. */
function parseLooseTime(s: string, todayIsoDate: string): number | null {
  const isoish = s.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(isoish)) {
    const t = new Date(`${isoish.slice(0, 16)}:00Z`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{2}:\d{2}$/.test(s.trim())) {
    const t = new Date(`${todayIsoDate}T${s.trim()}:00Z`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}
