/**
 * CommuteCard — compact travel-oriented insights from the same forecast data.
 */

import { TrainFront, CloudRain, Eye, ThermometerSun, Megaphone, CheckCircle2 } from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader } from "./ui/primitives";
import { DemoBanner } from "./DataSourceBadge";
import { buildCommuteOutlook } from "../engines/commuteEngine";
import { formatHour, formatVisibility } from "../utils/format";
import { useMemo } from "react";

const TONE: Record<string, string> = {
  alert: "border-red-500/50 bg-red-500/10 text-red-200",
  watch: "border-amber-450/50 bg-amber-450/10 text-amber-200",
  info: "border-navy-600 bg-navy-850 text-slate-300",
};

export function CommuteCard({
  dataset,
  prefs,
}: {
  dataset: WeatherDataset;
  prefs: Preferences;
}) {
  const outlook = useMemo(() => buildCommuteOutlook(dataset), [dataset]);

  if (dataset.mode === "UNAVAILABLE") {
    return (
      <Card>
        <CardHeader title="Commuting outlook" icon={<TrainFront className="h-4 w-4 text-sky-450" aria-hidden="true" />} />
        <div className="px-4 py-4 text-sm text-slate-400 sm:px-5">
          No forecast data is available, so commute conditions cannot be assessed.
        </div>
      </Card>
    );
  }

  return (
    <Card ariaLabel="Commuting outlook">
      {dataset.mode === "DEMO" && (
        <div className="px-4 pt-3 sm:px-5">
          <DemoBanner />
        </div>
      )}
      <CardHeader
        title="Commuting outlook"
        subtitle="Rain, storms, visibility and heat on the road"
        icon={<TrainFront className="h-4 w-4 text-sky-450" aria-hidden="true" />}
      />
      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap gap-2">
          <span className="chip">
            <CloudRain className="h-3.5 w-3.5 text-sky-450" aria-hidden="true" />
            {outlook.nextRainHour
              ? `Rain from ${formatHour(outlook.nextRainHour, prefs.timeFormat)}`
              : "No rain in the next hours"}
          </span>
          {outlook.worstVisibilityKm != null && (
            <span className="chip">
              <Eye className="h-3.5 w-3.5 text-sky-450" aria-hidden="true" />
              Worst visibility {formatVisibility(outlook.worstVisibilityKm * 1000)}
            </span>
          )}
        </div>
        <ul className="space-y-2">
          {outlook.insights.map((ins) => (
            <li key={ins.id} className={`rounded-xl border px-3 py-2.5 ${TONE[ins.tone]}`}>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                {ins.tone === "info" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : ins.tone === "alert" ? (
                  <Megaphone className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                ) : (
                  <ThermometerSun className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                )}
                {ins.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-300">{ins.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
