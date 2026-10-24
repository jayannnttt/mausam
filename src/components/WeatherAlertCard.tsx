/**
 * WeatherAlertCard — surfaces official meteorological warnings and acute
 * data-backed hazards (severe rain, high UV, acute AQI).
 * Does NOT reserve a large empty panel when conditions are calm.
 */

import { AlertOctagon, ExternalLink, ShieldAlert, CloudRain, Sun, Gauge } from "lucide-react";
import type { Preferences, WeatherDataset, WeatherWarning } from "../types/weather";
import { Card, CardHeader } from "./ui/primitives";

const SEVERITY_BORDER: Record<WeatherWarning["severity"], string> = {
  red: "border-l-4 border-l-weather-alert border-weather-alertBorder bg-weather-alertSurface/40",
  orange: "border-l-4 border-l-weather-sun border-weather-sunBorder bg-weather-sunSurface/40",
  yellow: "border-l-4 border-l-weather-sun border-weather-sunBorder bg-weather-sunSurface/30",
  unknown: "border-l-4 border-l-line border-line bg-surface",
};

const SEVERITY_BADGE: Record<WeatherWarning["severity"], string> = {
  red: "text-weather-alert bg-weather-alertSurface border-weather-alertBorder",
  orange: "text-weather-sun bg-weather-sunSurface border-weather-sunBorder",
  yellow: "text-weather-sun bg-weather-sunSurface border-weather-sunBorder",
  unknown: "text-ink-600 bg-line-subtle border-line",
};

import { getTranslation } from "../i18n/translations";

export function WeatherAlertCard({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const t = getTranslation(prefs.language);
  // If there are official bulletins, surface them prominently
  if (dataset.warnings.length > 0) {
    return (
      <Card ariaLabel="Official weather warnings" className="border-weather-alertBorder">
        <CardHeader
          title={t.officialBulletin}
          subtitle={t.viewOfficialAdvisory}
          icon={<AlertOctagon className="h-4 w-4 text-weather-alert" aria-hidden="true" />}
        />
        <ul className="divide-y divide-line">
          {dataset.warnings.map((w) => (
            <li key={w.id} className={`p-4 sm:p-5 ${SEVERITY_BORDER[w.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY_BADGE[w.severity]}`}
                    >
                      {w.severity !== "unknown" ? `${w.severity} bulletin` : "bulletin"} · {w.type}
                    </span>
                    {w.isDemo && (
                      <span className="rounded border border-weather-sunBorder bg-weather-sunSurface px-1.5 py-0.5 text-[10px] font-semibold text-weather-sun">
                        SIMULATION BULLETIN
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-ink-950">{w.headline}</h3>
                  <p className="text-xs text-ink-700">Area: {w.affectedArea}</p>
                  <p className="text-xs text-ink-500 tabular-nums">
                    Validity: {w.effectiveFrom} → {w.effectiveTo}
                  </p>
                  {w.detail && (
                    <p className="mt-2 rounded-md border border-line bg-surface p-2.5 text-xs text-ink-800 leading-relaxed">
                      {w.detail}
                    </p>
                  )}
                  {w.sourceUrl && (
                    <a
                      href={w.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-pine hover:underline font-medium"
                    >
                      Official Source <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  // If no official warnings, inspect if acute conditions warrant a brief quiet notice
  const next3Hours = dataset.hourly.slice(0, 3);
  const severeRain = next3Hours.find(
    (h) => (h.precipitationProbabilityPct ?? 0) >= 65 || (h.precipitationMm ?? 0) >= 4.0
  );

  const uvNow = dataset.hourly[0]?.uvIndex;
  const highUv = uvNow != null && uvNow >= 8;

  const nowAq = dataset.hourlyAirQuality?.[0]?.pm25;
  const severeAq = nowAq != null && nowAq >= 65;

  if (severeRain) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-weather-rainBorder bg-weather-rainSurface p-3.5 text-xs text-ink-800 shadow-xs">
        <CloudRain className="h-4 w-4 shrink-0 text-weather-rain mt-0.5" aria-hidden="true" />
        <div>
          <span className="font-semibold text-ink-950">Impending Precipitation Bulletin:</span>{" "}
          Heavy rain likely within the next 3 hours ({Math.round(severeRain.precipitationProbabilityPct ?? 70)}% probability, up to {severeRain.precipitationMm ?? 4} mm).
        </div>
      </div>
    );
  }

  if (highUv) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-weather-sunBorder bg-weather-sunSurface p-3.5 text-xs text-ink-800 shadow-xs">
        <Sun className="h-4 w-4 shrink-0 text-weather-sun mt-0.5" aria-hidden="true" />
        <div>
          <span className="font-semibold text-ink-950">Solar Radiation Notice:</span>{" "}
          UV Index is currently elevated at {Math.round(uvNow * 10) / 10} (Very High). Seek shade during peak midday hours.
        </div>
      </div>
    );
  }

  if (severeAq) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-weather-alertBorder bg-weather-alertSurface p-3.5 text-xs text-ink-800 shadow-xs">
        <Gauge className="h-4 w-4 shrink-0 text-weather-alert mt-0.5" aria-hidden="true" />
        <div>
          <span className="font-semibold text-ink-950">Air Quality Advisory:</span>{" "}
          Ambient PM2.5 level is elevated at {Math.round(nowAq)} µg/m³. Individuals with respiratory sensitivity should moderate prolonged exertion.
        </div>
      </div>
    );
  }

  // When conditions are calm and normal, omit empty card to preserve clean editorial hierarchy
  return null;
}
