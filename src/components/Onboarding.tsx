/**
 * Onboarding — 3 steps: location → interests → units & sensitivity.
 * Completing it drops the user directly onto the personalized dashboard.
 * Everything is saved locally; no account, no server.
 */

import { useState } from "react";
import {
  Activity,
  Sprout,
  ThermometerSun,
  TrainFront,
  Wind,
  ChevronRight,
  ChevronLeft,
  Check,
  Eye,
} from "lucide-react";
import type { GeoLocation, InterestKey, Preferences } from "../types/weather";
import { INTERESTS } from "../types/weather";
import { usePreferences } from "../state/preferencesContext";
import {
  LocationSearchResults,
  ManualLocationForm,
  DemoCityButtons,
} from "./LocationSelector";
import { DEMO_LOCATIONS } from "../services/demoDataService";

const INTEREST_ICONS: Record<InterestKey, typeof Activity> = {
  outdoor: Activity,
  farming: Sprout,
  comfort: ThermometerSun,
  commuting: TrainFront,
};

export function Onboarding() {
  const { prefs, setSelectedLocation, update } = usePreferences();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");

  const pickLocation = (loc: GeoLocation) => {
    setSelectedLocation(loc);
    setStep(1);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
      <header className="mb-6">
        <p className="label-caps text-sky-450">Mausam Sense</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Weather that understands your day
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          A quick setup — no account needed. Your choices stay on this device.
        </p>
      </header>

      {/* Progress dots */}
      <div className="mb-6 flex items-center gap-2" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-sky-450" : "bg-navy-800"}`}
          />
        ))}
      </div>

      {step === 0 && (
        <section className="card card-pad">
          <h2 className="text-base font-semibold">Where should we look?</h2>
          <p className="mt-1 text-sm text-slate-400">
            Search for your city, or enter coordinates for a village or farm location.
          </p>
          <label className="mt-4 block">
            <span className="label-caps">City or town</span>
            <div className="relative mt-1">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing, e.g. Chennai"
                className="w-full rounded-lg border border-navy-600 bg-navy-850 px-3 py-2 text-sm"
                aria-label="Search for a city"
              />
            </div>
          </label>
          <LocationSearchResults query={query} onPick={pickLocation} />
          <DemoCityButtons onPick={pickLocation} />
          <ManualLocationForm onPick={pickLocation} />
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-navy-700/60 pt-3">
            <button
              type="button"
              className="text-xs text-slate-400 underline decoration-navy-600 underline-offset-2 hover:text-sky-350"
              onClick={() => {
                setSelectedLocation(DEMO_LOCATIONS[0]);
                setStep(1);
              }}
            >
              Skip — start with Chennai
            </button>
            <span className="text-[11px] text-slate-500">No account needed</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Tip: for the farming demo, try Thanjavur or Bengaluru (demo fixtures included).
          </p>
        </section>
      )}

      {step === 1 && (
        <section className="card card-pad">
          <h2 className="text-base font-semibold">What matters to you?</h2>
          <p className="mt-1 text-sm text-slate-400">
            Pick one or more — your dashboard reorders around your interests.
          </p>
          <ul className="mt-4 space-y-2">
            {INTERESTS.map((interest) => {
              const Icon = INTEREST_ICONS[interest.key];
              const selected = prefs.interests.includes(interest.key);
              return (
                <li key={interest.key}>
                  <button
                    type="button"
                    onClick={() => toggle(interest.key)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                      selected
                        ? "border-sky-450 bg-sky-450/10"
                        : "border-navy-700 bg-navy-850 hover:border-navy-600"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 ${selected ? "text-sky-450" : "text-slate-400"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{interest.label}</span>
                      <span className="block text-xs text-slate-400">{interest.blurb}</span>
                    </span>
                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-sky-450" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn" onClick={() => setStep(0)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => setStep(2)}
            >
              Continue <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card card-pad">
          <h2 className="text-base font-semibold">A few preferences</h2>
          <p className="mt-1 text-sm text-slate-400">
            Adjust how information is shown. You can change these later in Settings.
          </p>

          <div className="mt-4 space-y-4">
            <Segmented
              label="Temperature"
              value={prefs.temperatureUnit}
              options={[
                { value: "C", label: "Celsius (°C)" },
                { value: "F", label: "Fahrenheit (°F)" },
              ]}
              onChange={(v) => update({ temperatureUnit: v as "C" | "F" })}
            />
            <Segmented
              label="Time format"
              value={prefs.timeFormat}
              options={[
                { value: "12h", label: "12-hour" },
                { value: "24h", label: "24-hour" },
              ]}
              onChange={(v) => update({ timeFormat: v as "12h" | "24h" })}
            />
            <div className="flex items-start justify-between gap-3 rounded-xl border border-navy-700 bg-navy-850 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Eye className="h-4 w-4 text-sky-450" aria-hidden="true" />
                  Heightened air-quality awareness
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Tighter thresholds for pollution in activity suggestions. No medical details
                  needed — this is just a preference.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.heightenedAqAwareness}
                aria-label="Heightened air-quality awareness"
                onClick={() => update({ heightenedAqAwareness: !prefs.heightenedAqAwareness })}
                className={`mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                  prefs.heightenedAqAwareness ? "bg-sky-450" : "bg-navy-600"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                    prefs.heightenedAqAwareness ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" className="btn" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => update({ onboarded: true })}
            >
              Open my dashboard <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <Wind className="h-3.5 w-3.5" aria-hidden="true" />
            Independent hackathon prototype. Not affiliated with IMD or any government agency.
          </p>
        </section>
      )}
    </div>
  );

  function toggle(key: InterestKey) {
    const has = prefs.interests.includes(key);
    const next = has
      ? prefs.interests.filter((i) => i !== key)
      : [...prefs.interests, key];
    update({ interests: next.length ? next : prefs.interests });
  }
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div className="mt-1.5 flex rounded-lg border border-navy-600 bg-navy-850 p-0.5" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value === o.value ? "bg-navy-700 text-sky-350" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { Preferences };
