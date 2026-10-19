/**
 * WeatherAlertCard — official warnings are always surfaced prominently and
 * are never hidden by user preferences. DEMO warnings carry a loud banner.
 */

import { AlertOctagon, ExternalLink, ShieldAlert } from "lucide-react";
import type { Preferences, WeatherDataset, WeatherWarning } from "../types/weather";
import { Card, CardHeader } from "./ui/primitives";
import { DataSourceBadge } from "./DataSourceBadge";

const SEVERITY_STYLES: Record<WeatherWarning["severity"], string> = {
  red: "border-red-500/60 bg-red-500/10",
  orange: "border-orange-500/60 bg-orange-500/10",
  yellow: "border-amber-450/60 bg-amber-450/10",
  unknown: "border-navy-600 bg-navy-850",
};

const SEVERITY_TEXT: Record<WeatherWarning["severity"], string> = {
  red: "text-red-300",
  orange: "text-orange-300",
  yellow: "text-amber-300",
  unknown: "text-slate-300",
};

export function WeatherAlertCard({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  if (dataset.warnings.length === 0) {
    // Compact "no alerts" strip — honest about source availability.
    const warningsSourceKnown = Boolean(dataset.providers.warnings);
    return (
      <Card className="card-pad flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-200">
            {dataset.mode === "UNAVAILABLE"
              ? "Weather alerts unavailable"
              : warningsSourceKnown
                ? "No active official warnings"
                : "Official warnings not checked"}
          </p>
          <p className="text-xs text-slate-400">
            {dataset.mode === "UNAVAILABLE"
              ? "No data source is reachable, so alerts cannot be shown."
              : warningsSourceKnown
                ? "The official source reports no warnings for this location right now."
                : "IMD's warning API requires an issued key (HTTP 401 without it), so official warnings could not be retrieved for this location. Nothing is shown here rather than inventing alerts."}
          </p>
        </div>
        <DataSourceBadge mode={dataset.mode === "UNAVAILABLE" ? "UNAVAILABLE" : "LIVE"} className="hidden sm:inline-flex" />
      </Card>
    );
  }

  return (
    <Card ariaLabel="Weather alerts">
      <CardHeader
        title="Weather alerts"
        subtitle="Official-style warnings — always shown regardless of your interests"
        icon={<AlertOctagon className="h-4 w-4 text-amber-450" aria-hidden="true" />}
      />
      <ul className="divide-y divide-navy-700/60">
        {dataset.warnings.map((w) => (
          <li key={w.id} className={`border-l-4 px-4 py-3 sm:px-5 ${SEVERITY_STYLES[w.severity]}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${SEVERITY_TEXT[w.severity]}`}
                  >
                    {w.severity !== "unknown" ? `${w.severity} warning` : "warning"} · {w.type}
                  </span>
                  {w.isDemo && (
                    <span className="rounded border border-amber-450 bg-amber-450/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-200">
                      DEMO — NOT AN OFFICIAL BULLETIN
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-100">{w.headline}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Area: {w.affectedArea}
                </p>
                <p className="text-xs text-slate-400">
                  Valid: {w.effectiveFrom} → {w.effectiveTo}
                </p>
                <p className="text-xs text-slate-400">Issued by: {w.issuingAuthority}</p>
                {w.detail && (
                  <p className="mt-1.5 rounded-lg bg-navy-950/60 p-2 text-xs text-slate-300">
                    {w.detail}
                  </p>
                )}
                {w.sourceUrl && (
                  <a
                    href={w.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-sky-350 hover:underline"
                  >
                    View source <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-4 py-2.5 sm:px-5">
        <p className="text-[11px] text-slate-500">
          {dataset.providers.warnings
            ? `Warnings source: ${dataset.providers.warnings.name}`
            : "Warnings shown here were generated in DEMO mode and are labelled as such."}{" "}
          {prefs.heightenedAqAwareness
            ? "Heightened air-quality awareness is on, but official alerts are never filtered by preferences."
            : ""}
        </p>
      </div>
    </Card>
  );
}
