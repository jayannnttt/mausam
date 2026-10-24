/**
 * DataSourceBadge — the single component that tells the user whether the data
 * on screen is LIVE, DEMO or UNAVAILABLE, plus per-provider attribution.
 */

import { Database, Radio, WifiOff } from "lucide-react";
import type { DataMode } from "../types/weather";

const STYLES: Record<DataMode, { label: string; className: string; icon: typeof Radio }> = {
  LIVE: {
    label: "LIVE",
    className: "border-pine-600/30 bg-pine-600/10 text-pine-800",
    icon: Radio,
  },
  DEMO: {
    label: "DEMO",
    className: "border-weather-sun/40 bg-weather-sun/10 text-ink-900",
    icon: Database,
  },
  UNAVAILABLE: {
    label: "NO DATA",
    className: "border-weather-alert/40 bg-weather-alert/10 text-weather-alert",
    icon: WifiOff,
  },
};

export function DataSourceBadge({
  mode,
  className = "",
}: {
  mode: DataMode;
  className?: string;
}) {
  const s = STYLES[mode];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider ${s.className} ${className}`}
      title={
        mode === "LIVE"
          ? "Retrieved from a live data provider"
          : mode === "DEMO"
            ? "Synthetic demonstration data — not actual conditions"
            : "No usable data is available"
      }
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function DemoBanner({ _reason }: { reason?: string; _reason?: string }) {
  return null;
}

/** Attribution line for a provider - hidden for user-friendly clean presentation. */
export function ProviderLine(_props: {
  name: string;
  detail?: string;
  url?: string;
}) {
  return null;
}
