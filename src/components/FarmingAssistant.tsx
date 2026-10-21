/**
 * FarmingAssistant — "Farm Weather Intelligence".
 *
 * Shows rainfall outlook (24/48/72 h), daily forecast cards, rain-probability
 * and rainfall charts, and — when available — official agricultural
 * advisories, clearly separated from the general weather summary.
 */

import { useMemo, useState } from "react";
import { Sprout, Droplets, CalendarDays, FileText, ExternalLink, ChevronDown, ChevronUp, Info } from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader, EmptyState } from "./ui/primitives";
import { ProviderLine } from "./DataSourceBadge";
import { buildFarmOutlook } from "../engines/farmingEngine";
import { RainfallChart, RainProbabilityChart } from "./charts";
import { dayLabel, formatRange, formatTemp, todayIso } from "../utils/format";

const TONE_CHIP: Record<string, string> = {
  alert: "border-weather-alert/40 bg-weather-alert/10 text-weather-alert",
  watch: "border-weather-sun/40 bg-weather-sun/10 text-ink-950",
  info: "border-weather-rain/40 bg-weather-rain/10 text-ink-950",
  calm: "border-pine-600/30 bg-pine-600/10 text-pine-900",
};

export function FarmingAssistant({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const outlook = useMemo(() => buildFarmOutlook(dataset), [dataset]);

  if (dataset.mode === "UNAVAILABLE" || dataset.hourly.length === 0) {
    return (
      <Card>
        <CardHeader title="Farm weather intelligence" icon={<Sprout className="h-4 w-4 text-pine-600" aria-hidden="true" />} />
        <div className="p-4 sm:p-5">
          <EmptyState
            title="No rainfall outlook available"
            description={
              dataset.modeReason ??
              "Forecast data could not be loaded, so no rainfall planning information can be shown."
            }
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

  return (
    <Card ariaLabel="Farm weather intelligence">
      <CardHeader
        title="Farm weather intelligence"
        subtitle={`${dataset.location.name}${dataset.location.admin2 ? ` · ${dataset.location.admin2}` : ""} · rainfall outlook translated from the forecast provider`}
        icon={<Sprout className="h-4 w-4 text-pine-600" aria-hidden="true" />}
      />

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {/* 24/48/72 h rainfall summary */}
        <div className="grid grid-cols-3 gap-2" aria-label="Rainfall totals">
          {outlook.periods.map((p) => (
            <div key={p.label} className="rounded-xl border border-line bg-surface p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {p.label.replace("Next ", "")}
              </p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xl font-bold tabular-nums text-weather-rain">
                <Droplets className="h-4 w-4" aria-hidden="true" />
                {p.hasData ? `${p.totalMm}` : "—"}
              </p>
              <p className="text-[10px] text-ink-400">mm expected</p>
              <p className="mt-1 text-[11px] tabular-nums text-ink-500">
                peak prob {p.hasData ? `${p.maxProbabilityPct ?? 0}%` : "—"}
              </p>
            </div>
          ))}
        </div>

        {/* Planning messages */}
        <ul className="space-y-2" aria-label="Planning summary">
          {outlook.messages.map((m, i) => (
            <li key={i} className={`rounded-xl border px-3 py-2.5 text-sm ${TONE_CHIP[m.tone]}`}>
              {m.text}
            </li>
          ))}
        </ul>

        {/* Rain windows in the next 24 h */}
        {p24.rainPeriods.length > 0 && (
          <section aria-label="Rain periods">
            <p className="label-caps">Wet spells in the next 24 hours</p>
            <ul className="mt-1.5 space-y-1.5">
              {p24.rainPeriods.map((rp, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                  <span className="font-medium text-ink-900">
                    {formatRange(rp.start, rp.end, prefs.timeFormat)}
                  </span>
                  <span className="text-xs text-ink-500">
                    ~{Math.round(rp.totalMm * 10) / 10} mm over {rp.hours} h
                    {rp.maxProbabilityPct != null
                      ? ` · peak probability ${Math.round(rp.maxProbabilityPct)}%`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Charts */}
        {next48.length > 0 && (
          <section aria-label="Rain probability next 48 hours">
            <p className="label-caps">Rain probability — next 48 hours</p>
            <RainProbabilityChart data={next48.map((h) => ({
              time: h.time,
              prob: h.precipitationProbabilityPct,
              mm: h.precipitationMm,
            }))} timeFormat={prefs.timeFormat} />
          </section>
        )}

        <section aria-label="Daily rainfall forecast">
          <p className="label-caps">Daily rainfall forecast</p>
          <RainfallChart
            data={outlook.daily.map((d) => ({
              label: d.label,
              mm: d.precipSumMm,
              prob: d.probabilityMaxPct,
            }))}
            timeFormat={prefs.timeFormat}
          />
        </section>

        {/* Daily cards (expandable) */}
        <section aria-label="Daily forecast details">
          <p className="label-caps">Daily details</p>
          <ul className="mt-2 space-y-2">
            {outlook.daily.map((d) => {
              const open = expandedDay === d.date;
              return (
                <li key={d.date} className="rounded-xl border border-line bg-surface">
                  <button
                    type="button"
                    onClick={() => setExpandedDay(open ? null : d.date)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <CalendarDays className="h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                    <span className="w-20 shrink-0 text-sm font-medium text-ink-900">
                      {dayLabel(d.date, today)}
                    </span>
                    <span className="min-w-0 flex-1 text-xs text-ink-500 tabular-nums">
                      {d.hasData
                        ? `${d.precipSumMm ?? 0} mm · prob ${d.probabilityMaxPct ?? 0}%`
                        : "Rain data unavailable"}
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      <span className="text-ink-900">{formatTemp(d.tempMaxC, prefs.temperatureUnit)}</span>{" "}
                      <span className="text-ink-400">{formatTemp(d.tempMinC, prefs.temperatureUnit)}</span>
                    </span>
                    {open ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
                    )}
                  </button>
                  {open && (
                    <div className="border-t border-line px-3 py-2.5 text-xs text-ink-700">
                      <p>
                        Rainfall total: <strong className="text-ink-900">{d.precipSumMm ?? "—"} mm</strong> with up to{" "}
                        <strong className="text-ink-900">{d.probabilityMaxPct ?? 0}%</strong> hourly rain probability.
                      </p>
                      <p className="mt-1 text-ink-500">
                        Temperature range {formatTemp(d.tempMinC, prefs.temperatureUnit)}–
                        {formatTemp(d.tempMaxC, prefs.temperatureUnit)}. These are the forecast
                        provider's values — translate them against local field conditions before
                        acting.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Advisories */}
        <section aria-label="Agricultural advisories">
          <p className="label-caps">Agricultural advisories</p>
          {outlook.hasOfficialAdvisories ? (
            <ul className="mt-2 space-y-2">
              {dataset.advisories
                .filter((a) => !a.isDemo)
                .map((a) => (
                  <li key={a.id} className="rounded-xl border border-pine-600/30 bg-pine-600/5 p-3">
                    <p className="text-sm font-semibold text-ink-900">{a.title}</p>
                    <p className="mt-1 text-xs text-ink-600">{a.summary}</p>
                    <p className="mt-1.5 text-xs text-ink-400">
                      Issued by {a.issuingOrganization} · {a.issueDate} · {a.applicableLocation}
                    </p>
                    {a.sourceUrl && (
                      <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-pine-700 hover:underline">
                        Source <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          ) : (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-paper-light p-3 text-xs text-ink-600">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
              <span>
                <strong className="text-ink-800">No verified agricultural advisory is available</strong> for
                this location. IMD's public API reference does not expose a stable
                agricultural-advisory endpoint, so none is shown here rather than inventing one. The
                summaries above are general weather-based information from the forecast provider —
                they are <em>not</em> official agricultural advice on irrigation, spraying,
                fertiliser or harvesting.
                {dataset.mode === "DEMO" && dataset.advisories.length > 0 && (
                  <>
                    {" "}
                    A <strong>DEMO</strong> advisory example is shown below to demonstrate the
                    format.
                  </>
                )}
              </span>
            </div>
          )}
          {dataset.mode === "DEMO" &&
            dataset.advisories
              .filter((a) => a.isDemo)
              .map((a) => (
                <div key={a.id} className="mt-2 rounded-xl border border-weather-sun/40 bg-weather-sun/10 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-weather-sun">
                    DEMO advisory — not real agricultural advice
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{a.title}</p>
                  <p className="mt-1 text-xs text-ink-600">{a.summary}</p>
                  <p className="mt-1.5 text-xs text-ink-400">
                    {a.issuingOrganization} · {a.issueDate} · {a.applicableLocation}
                  </p>
                </div>
              ))}
        </section>

        <p className="flex items-start gap-1.5 text-[11px] text-ink-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Mausam Sense does not improve rainfall prediction — it restates the provider's forecast in
          planning language. Always confirm with local observations before field operations.
        </p>
        {dataset.providers.weather && <ProviderLine {...dataset.providers.weather} />}
      </div>
    </Card>
  );
}
