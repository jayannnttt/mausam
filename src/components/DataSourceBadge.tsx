/**
 * DataSourceBadge — the single component that tells the user whether the data
 * on screen is LIVE, DEMO or UNAVAILABLE, plus per-provider attribution.
 */

import { Database, Radio, WifiOff } from "lucide-react";
import type { DataMode } from "../types/weather";

const STYLES: Record<DataMode, { label: string; className: string; icon: typeof Radio }> = {
  LIVE: {
    label: "LIVE",
    className: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    icon: Radio,
  },
  DEMO: {
    label: "DEMO",
    className: "border-amber-450/60 bg-amber-450/15 text-amber-300",
    icon: Database,
  },
  UNAVAILABLE: {
    label: "NO DATA",
    className: "border-red-500/50 bg-red-500/10 text-red-300",
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

export function DemoBanner({ reason }: { reason?: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-amber-450/50 bg-amber-450/10 px-3 py-2 text-xs text-amber-200"
      role="status"
    >
      <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-bold">DEMO DATA.</strong> These values are synthetic and are NOT
        actual weather conditions{reason ? ` — ${reason}` : ""}.
      </span>
    </div>
  );
}

/** Footer-style attribution line for a provider. */
export function ProviderLine({
  name,
  detail,
  url,
}: {
  name: string;
  detail?: string;
  url?: string;
}) {
  return (
    <p className="text-[11px] leading-relaxed text-slate-500">
      Source:{" "}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 underline decoration-navy-600 underline-offset-2 hover:text-sky-350"
        >
          {name}
        </a>
      ) : (
        <span className="text-slate-400">{name}</span>
      )}
      {detail ? ` — ${detail}` : ""}
    </p>
  );
}
