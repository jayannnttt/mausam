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
import { DemoBanner, ProviderLine } from "./DataSourceBadge";
import { ScoreTimeline, PollutionChart, TempHumidityChart } from "./charts";
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

const ACTIVITIES: { key: ActivityKey; label: string; icon: typeof Footprints }[] = [
  { key: "running", label: "Running", icon: Footprints },
  { key: "jogging", label: "Jogging", icon: Footprints },
  { key: "walking", label: "Walking", icon: PersonStanding },
  { key: "cycling", label: "Cycling", icon: Bike },
  { key: "general", label: "General", icon: Timer },
];

const TONE_FOR_SCORE = (s: number): "green" | "sky" | "amber" | "red" =>
  s >= 75 ? "green" : s >= 55 ? "sky" : s >= 35 ? "amber" : "red";

const RANK_LABELS = ["Best window", "Second option", "Third option"];

export function ActivityPlanner({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const [activity, setActivity] = useState<ActivityKey>("running");
  const [showWhy, setShowWhy] = useState(true);
  const [showAllWindows, setShowAllWindows] = useState(false);

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
    <Card ariaLabel="Best time to go outside">
      {dataset.mode === "DEMO" && (
        <div className="px-4 pt-3 sm:px-5">
          <DemoBanner />
        </div>
      )}
      <CardHeader
        title="Best time to go outside"
        subtitle={`${planning.profile.label} · next 24 hours · indicative project score, not a safety guarantee`}
        icon={<Footprints className="h-4 w-4 text-sky-450" aria-hidden="true" />}
        action={
          <span className="chip" title="Share of scored hours that had complete measurements">
            Data coverage {Math.round(planning.dataCoverage * 100)}%
          </span>
        }
      />

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {/* Activity selector */}
        <div
          className="strip-scroll flex gap-1.5 overflow-x-auto pb-1"
          role="group"
          aria-label="Choose activity"
        >
          {ACTIVITIES.map((a) => {
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
                    ? "border-sky-450 bg-sky-450/15 text-sky-350"
                    : "border-navy-600 bg-navy-850 text-slate-300 hover:border-navy-500"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {a.label}
              </button>
            );
          })}
        </div>

        {/* Current outdoor conditions snapshot */}
        <section aria-label="Outdoor conditions now">
          <p className="label-caps">Outdoor conditions now</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {band ? (
              <span
                className={`chip ${
                  band.tone <= 1
                    ? "border-emerald-500/50 text-emerald-300"
                    : band.tone === 2
                      ? "border-amber-450/50 text-amber-300"
                      : "border-red-500/50 text-red-300"
                }`}
                title={band.advice}
              >
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                PM2.5 {pm25Now != null ? Math.round(pm25Now * 10) / 10 : "—"} µg/m³ · {band.label}
              </span>
            ) : (
              <span className="chip text-slate-400">
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                PM2.5 data unavailable
              </span>
            )}
            {prefs.heightenedAqAwareness && (
              <span className="chip border-sky-450/50 text-sky-350">
                Heightened awareness thresholds active
              </span>
            )}
            {best && (
              <span className="chip border-emerald-500/50 text-emerald-300">
                Best score today: {Math.round(best.score)}/100
              </span>
            )}
          </div>
          {band && <p className="mt-1.5 text-xs text-slate-400">{band.advice}</p>}
        </section>

        {/* Recommendation */}
        {planning.insufficient ? (
          <ErrorState
            title="A confident ranking is not possible right now"
            description={planning.insufficient.reason}
          />
        ) : best ? (
          <section
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3.5"
            aria-label="Recommended window"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-caps text-emerald-300">Recommended window</p>
                <p className="mt-1 text-xl font-bold">
                  {formatRange(best.start, best.end, prefs.timeFormat)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {dataset.location.name} local time · {best.merged ? "merged from adjacent good hours" : `${ACTIVITY_PROFILES[activity].windowHours} h window`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-emerald-300">{Math.round(best.score)}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">
                  indicative /100
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
              className="mt-3 flex w-full items-center justify-between rounded-lg border border-navy-700 bg-navy-850 px-3 py-2 text-sm font-medium hover:border-navy-600"
            >
              <span className="flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-sky-450" aria-hidden="true" />
                Why this time?
              </span>
              {showWhy ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
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
                              ? "bg-emerald-400"
                              : (f.score ?? 0) >= 50
                                ? "bg-amber-450"
                                : "bg-red-400"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="text-slate-300">
                          <strong>{FACTOR_LABELS[f.key]}:</strong> {f.detail}{" "}
                          <span className="text-slate-500">
                            (score {Math.round(f.score ?? 0)}, weight {Math.round(f.weight)}%)
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
                {others.length > 0 && (
                  <p className="text-xs text-slate-400">
                    Compared with the next-best option (
                    {formatRange(others[0].start, others[0].end, prefs.timeFormat)}, score{" "}
                    {Math.round(others[0].score)}), this window ranks higher mainly on{" "}
                    {best.strengths.map((k) => FACTOR_LABELS[k].toLowerCase()).join(" and ") || "overall conditions"}
                    .
                  </p>
                )}
                {worst && worst.total != null && (
                  <p className="text-xs text-slate-400">
                    The least suitable hour in the horizon is{" "}
                    {formatHour(worst.time, prefs.timeFormat)} (score {Math.round(worst.total)}):
                    {worst.factors
                      .filter((f) => f.score != null && f.score < 45)
                      .slice(0, 2)
                      .map((f) => ` ${FACTOR_LABELS[f.key].toLowerCase()} (${f.detail})`)
                      .join(";") || " poor overall conditions"}
                    .
                  </p>
                )}
              </div>
            )}
          </section>
        ) : null}

        {/* Other windows */}
        {!planning.insufficient && others.length > 0 && (
          <section aria-label="Other available windows">
            <p className="label-caps">Other available windows</p>
            <ul className="mt-2 space-y-2">
              {(showAllWindows ? others : others.slice(0, 2)).map((w, i) => (
                <li key={w.start} className="rounded-xl border border-navy-700 bg-navy-850 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {RANK_LABELS[i + 1]}: {formatRange(w.start, w.end, prefs.timeFormat)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {w.strengths.length
                          ? `Strongest on: ${w.strengths.map((k) => FACTOR_LABELS[k].toLowerCase()).join(", ")}`
                          : "Similar profile to the best window"}
                        {w.concerns.length
                          ? ` · Watch: ${w.concerns.map((k) => FACTOR_LABELS[k].toLowerCase()).join(", ")}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{Math.round(w.score)}</p>
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
                {showAllWindows ? "Show fewer windows" : `Show ${others.length - 2} more option(s)`}
              </button>
            )}
          </section>
        )}

        {/* Charts */}
        <section aria-label="Hourly outdoor score">
          <p className="label-caps">Indicative score by hour</p>
          <ScoreTimeline
            data={scoreData}
            timeFormat={prefs.timeFormat}
            highlightRange={best ? { from: best.start, to: best.end } : undefined}
          />
          <p className="text-[10px] text-slate-500">
            Green ≥75 · Blue ≥55 · Amber ≥35 · Red &lt;35 — Mausam Sense indicative score, shaded
            band = recommended window
          </p>
        </section>

        {(dataset.hourlyAirQuality?.length ?? 0) > 0 && (
          <section aria-label="Hourly air quality">
            <p className="label-caps">Hourly air quality — PM2.5 & PM10 (µg/m³)</p>
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

        <section aria-label="Temperature and humidity">
          <p className="label-caps">Temperature & humidity — forecast</p>
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

        {/* Caveats */}
        <details className="rounded-xl border border-navy-700 bg-navy-850/60 p-3 text-xs text-slate-400">
          <summary className="cursor-pointer font-medium text-slate-300">
            How this ranking works & its limitations
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Each forecast hour is scored 0–100 from air quality, temperature (feels-like when
              available), UV, rain, wind, humidity and active official warnings. Weights:{" "}
              {Object.entries(ACTIVITY_PROFILES[activity].weights)
                .map(([k, v]) => `${FACTOR_LABELS[k as FactorKey]} ${v}`)
                .join(", ")}
              .
            </li>
            <li>
              Missing measurements are never invented — their weight is redistributed and the
              confidence badge drops (currently: {planning.confidence}).
            </li>
            <li>
              This is a transparent heuristic for planning, NOT a validated scientific model, a
              safety guarantee, or medical advice. Pollutant values are model estimates; check the
              provider label shown. Follow official health guidance and your clinician's advice if
              you are sensitive to pollution.
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
