/**
 * CommuteCard — compact travel-oriented insights from the same forecast data.
 */

import { TrainFront, CloudRain, Eye, ThermometerSun, Megaphone, CheckCircle2 } from "lucide-react";
import type { Preferences, WeatherDataset } from "../types/weather";
import { Card, CardHeader } from "./ui/primitives";
import { buildCommuteOutlook } from "../engines/commuteEngine";
import { formatHour, formatVisibility } from "../utils/format";
import { useMemo } from "react";

const TONE: Record<string, string> = {
  alert: "border-weather-alert/40 bg-weather-alert/10 text-weather-alert",
  watch: "border-weather-sun/40 bg-weather-sun/10 text-ink-900",
  info: "border-line bg-surface text-ink-800",
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
        <CardHeader title="Commuting outlook" icon={<TrainFront className="h-4 w-4 text-pine-600" aria-hidden="true" />} />
        <div className="px-4 py-4 text-sm text-ink-400 sm:px-5">
          No forecast data is available, so commute conditions cannot be assessed.
        </div>
      </Card>
    );
  }

  return (
    <Card ariaLabel="Commuting outlook">
      <CardHeader
        title="Commuting outlook"
        subtitle="Rain, storms, visibility and heat on the road"
        icon={<TrainFront className="h-4 w-4 text-pine-600" aria-hidden="true" />}
      />
      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap gap-2">
          <span className="chip">
            <CloudRain className="h-3.5 w-3.5 text-weather-rain" aria-hidden="true" />
            {outlook.nextRainHour
              ? `Rain from ${formatHour(outlook.nextRainHour, prefs.timeFormat)}`
              : "No rain in the next hours"}
          </span>
          {outlook.worstVisibilityKm != null && (
            <span className="chip">
              <Eye className="h-3.5 w-3.5 text-pine-600" aria-hidden="true" />
              Worst visibility {formatVisibility(outlook.worstVisibilityKm * 1000)}
            </span>
          )}
        </div>
        <ul className="space-y-2">
          {outlook.insights.map((ins) => (
            <li key={ins.id} className={`rounded-xl border px-3 py-2.5 ${TONE[ins.tone]}`}>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                {ins.tone === "info" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-pine-600" aria-hidden="true" />
                ) : ins.tone === "alert" ? (
                  <Megaphone className="h-4 w-4 shrink-0 text-weather-alert" aria-hidden="true" />
                ) : (
                  <ThermometerSun className="h-4 w-4 shrink-0 text-weather-sun" aria-hidden="true" />
                )}
                {ins.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">{ins.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
