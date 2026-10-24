/**
 * ProfilePreferences — settings dialog: interests, units, data mode,
 * heightened awareness. Everything persists locally immediately.
 */

import { INTERESTS } from "../types/weather";
import type { InterestKey } from "../types/weather";
import { usePreferences } from "../state/preferencesContext";
import { Modal } from "./ui/primitives";
import { RotateCcw, Trash2 } from "lucide-react";

export function ProfilePreferences({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, toggleInterest, update, resetOnboarding, t } = usePreferences();

  return (
    <Modal open={open} onClose={onClose} title={t.settingsTitle}>
      <div className="space-y-5">
        <section>
          <h3 className="label-caps">{t.interests}</h3>
          <ul className="mt-2 space-y-1.5">
            {INTERESTS.map((i) => {
              const on = prefs.interests.includes(i.key);
              return (
                <li key={i.key}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 transition-colors hover:border-line-strong">
                    <span>
                      <span className="block text-sm font-medium text-ink-900">{i.label}</span>
                      <span className="block text-xs text-ink-500">{i.blurb}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleInterest(i.key as InterestKey)}
                      className="h-4 w-4 shrink-0 accent-pine-600"
                      aria-label={i.label}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="label-caps">{t.settings}</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Select
              label={t.tempUnit}
              value={prefs.temperatureUnit}
              options={[
                ["C", "°C"],
                ["F", "°F"],
              ]}
              onChange={(v) => update({ temperatureUnit: v as "C" | "F" })}
            />
            <Select
              label={t.windUnit}
              value={prefs.windUnit}
              options={[
                ["kmh", "km/h"],
                ["mph", "mph"],
              ]}
              onChange={(v) => update({ windUnit: v as "kmh" | "mph" })}
            />
            <Select
              label={t.timeFormat}
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
          <h3 className="label-caps">{t.airQualityAwareness}</h3>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong">
            <input
              type="checkbox"
              checked={prefs.heightenedAqAwareness}
              onChange={() => update({ heightenedAqAwareness: !prefs.heightenedAqAwareness })}
              className="mt-0.5 h-4 w-4 accent-pine-600"
            />
            <span>
              <span className="block text-sm font-medium text-ink-900">{t.airQualityAwareness}</span>
              <span className="block text-xs text-ink-500">
                {t.airQualityAwarenessDesc}
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

        <p className="text-[11px] text-ink-400">
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
      <span className="text-xs font-medium text-ink-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-900 focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
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
