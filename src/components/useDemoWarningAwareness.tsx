/** Small hook: renders provider notes and DEMO data notices consistently. */

import { AlertTriangle, Info } from "lucide-react";
import type { WeatherDataset } from "../types/weather";

export function useDemoWarningAwareness(dataset: WeatherDataset) {
  const hasDemoWarnings = dataset.warnings.some((w) => w.isDemo);
  const demoMode = dataset.mode === "DEMO";
  if (!hasDemoWarnings && !demoMode && dataset.notes.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {dataset.mode === "UNAVAILABLE" && dataset.modeReason && (
        <p className="flex items-start gap-1.5 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {dataset.modeReason}
        </p>
      )}
      {hasDemoWarnings && !demoMode && (
        <p className="flex items-start gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          One or more warnings on this screen are DEMO examples, not official bulletins.
        </p>
      )}
      {dataset.notes.map((n, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {n}
        </p>
      ))}
    </div>
  );
}
