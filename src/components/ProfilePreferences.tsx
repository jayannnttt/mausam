/**
 * ProfilePreferences — settings dialog: interests, units, data mode,
 * heightened awareness. Everything persists locally immediately.
 */

import { INTERESTS } from "../types/weather";
import type { InterestKey } from "../types/weather";
import { usePreferences } from "../state/preferencesContext";
import { Modal } from "./ui/primitives";
import { RotateCcw, Database, Radio, Trash2 } from "lucide-react";

export function ProfilePreferences({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, toggleInterest, update, resetOnboarding } = usePreferences();

  return (
    <Modal open={open} onClose={onClose} title="Settings & preferences">
      <div className="space-y-5">
        <section>
          <h3 className="label-caps">Interests (reorders your dashboard)</h3>
          <ul className="mt-2 space-y-1.5">
            {INTERESTS.map((i) => {
              const on = prefs.interests.includes(i.key);
              return (
                <li key={i.key}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-navy-700 bg-navy-850 px-3 py-2">
                    <span>
                      <span className="block text-sm font-medium">{i.label}</span>
                      <span className="block text-xs text-slate-400">{i.blurb}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleInterest(i.key as InterestKey)}
                      className="h-4 w-4 shrink-0 accent-sky-450"
                      aria-label={i.label}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="label-caps">Data mode</h3>
          <div className="mt-2 space-y-1.5">
            {(
              [
                { value: "auto", label: "Auto — live first, demo fallback", icon: Radio },
                { value: "live", label: "Live only — Open-Meteo providers", icon: Radio },
                { value: "demo", label: "Demo — synthetic fixtures (offline)", icon: Database },
              ] as const
            ).map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-navy-700 bg-navy-850 px-3 py-2"
              >
                <input
                  type="radio"
                  name="dataMode"
                  checked={prefs.dataMode === o.value}
                  onChange={() => update({ dataMode: o.value })}
                  className="h-4 w-4 accent-sky-450"
                />
                <o.icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="text-sm">{o.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Demo mode works fully offline and is always labelled DEMO. Fixtures: Chennai,
            Bengaluru, Thanjavur.
          </p>
        </section>

        <section>
          <h3 className="label-caps">Units & format</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Select
              label="Temperature"
              value={prefs.temperatureUnit}
              options={[
                ["C", "°C"],
                ["F", "°F"],
              ]}
              onChange={(v) => update({ temperatureUnit: v as "C" | "F" })}
            />
            <Select
              label="Wind"
              value={prefs.windUnit}
              options={[
                ["kmh", "km/h"],
                ["mph", "mph"],
              ]}
              onChange={(v) => update({ windUnit: v as "kmh" | "mph" })}
            />
            <Select
              label="Time"
              value={prefs.timeFormat}
              options={[
                ["12h", "12-hour"],
                ["24h", "24-hour"],
              ]}
              onChange={(v) => update({ timeFormat: v as "12h" | "24h" })}
            />
          </div>
        </section>

        <section>
          <h3 className="label-caps">Air-quality awareness</h3>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-navy-700 bg-navy-850 px-3 py-2.5">
            <input
              type="checkbox"
              checked={prefs.heightenedAqAwareness}
              onChange={() => update({ heightenedAqAwareness: !prefs.heightenedAqAwareness })}
              className="mt-0.5 h-4 w-4 accent-sky-450"
            />
            <span>
              <span className="block text-sm font-medium">Heightened air-quality awareness</span>
              <span className="block text-xs text-slate-400">
                Tighter PM2.5 thresholds in activity suggestions. This is a preference, not a
                medical profile — Mausam Sense never asks for diagnoses.
              </span>
            </span>
          </label>
        </section>

        <section className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetOnboarding();
              onClose();
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Replay onboarding
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              localStorage.clear();
              location.reload();
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear saved data
          </button>
        </section>

        <p className="text-[11px] text-slate-500">
          Mausam Sense is an independent hackathon prototype. It is not affiliated with or endorsed
          by the India Meteorological Department or any government agency.
        </p>
      </div>
    </Modal>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="mt-1 w-full rounded-lg border border-navy-600 bg-navy-850 px-2 py-1.5 text-sm"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
