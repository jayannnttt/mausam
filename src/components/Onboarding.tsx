/**
 * Onboarding — Step 0: 22 Official Indian Languages → Step 1: Location (GPS / Manual)
 * → Step 2: Interests → Step 3: Units & Preferences.
 * Completing it drops the user directly onto the localized personalized dashboard.
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
  Globe,
  MapPin,
} from "lucide-react";
import type { GeoLocation, InterestKey, Preferences } from "../types/weather";
import { INTERESTS } from "../types/weather";
import { usePreferences } from "../state/preferencesContext";
import {
  LocationSearchResults,
  ManualLocationForm,
  DemoCityButtons,
} from "./LocationSelector";
import { GpsLocationControl } from "./GpsLocationControl";
import { LanguageGrid } from "./LanguageSelectorModal";
import { DEMO_LOCATIONS } from "../services/demoDataService";
import { INDIAN_LANGUAGES } from "../i18n/languages";

const INTEREST_ICONS: Record<InterestKey, typeof Activity> = {
  outdoor: Activity,
  farming: Sprout,
  comfort: ThermometerSun,
  commuting: TrainFront,
};

export function Onboarding() {
  const { prefs, language, setLanguage, persona, setPersona, t, setSelectedLocation, update } = usePreferences();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");

  const pickLocation = (loc: GeoLocation, autoFinish = false) => {
    setSelectedLocation(loc);
    if (autoFinish) {
      update({ onboarded: true });
    } else {
      setStep(2);
    }
  };

  const currentLangObj = INDIAN_LANGUAGES.find((l) => l.code === language) ?? INDIAN_LANGUAGES[0];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <p className="label-caps text-pine-600">{t.appTitle}</p>
          <span className="flex items-center gap-1.5 rounded-full border border-pine-600/30 bg-pine-600/10 px-2.5 py-0.5 text-xs font-semibold text-pine-700">
            <Globe className="h-3.5 w-3.5" />
            {currentLangObj.nativeName}
          </span>
        </div>
        <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-ink-900">
          {t.appSubtitle}
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          A quick setup — no account needed. Your choices stay on this device.
        </p>
      </header>

      {/* Progress indicators: 3 steps (Language -> Location -> Persona) */}
      <div className="mb-6 flex items-center gap-2" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= step ? "bg-pine-600" : "bg-line"
            }`}
          />
        ))}
      </div>

      {/* Step 0: All 22 Official Indian Languages */}
      {step === 0 && (
        <section className="card card-pad border border-line bg-surface shadow-sm">
          <div className="mb-4 flex items-center gap-2.5 border-b border-line pb-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-pine-600/30 bg-pine-600/10 text-pine-700">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-900">{t.selectLanguage}</h2>
              <p className="text-xs text-ink-500">{t.selectLanguageSub}</p>
            </div>
          </div>

          <LanguageGrid
            selectedCode={language}
            onSelect={(code) => {
              setLanguage(code);
              // Smooth transition to location step after picking language
              setTimeout(() => {
                setStep(1);
              }, 120);
            }}
          />

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <span className="text-xs text-ink-500">
              Selected: <strong className="text-pine-700">{currentLangObj.nativeName}</strong> ({currentLangObj.name})
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(1)}
            >
              {t.continue} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Step 1: Location Prompt - Fetch Location (GPS) or Enter Manually */}
      {step === 1 && (
        <section className="card card-pad border border-line bg-surface shadow-sm">
          <div className="mb-4 flex items-center gap-2.5 border-b border-line pb-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-pine-600/30 bg-pine-600/10 text-pine-700">
              <MapPin className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-900">{t.whereToLook}</h2>
              <p className="text-xs text-ink-500">{t.whereToLookSub}</p>
            </div>
          </div>

          {/* Primary Action 1: Fetch Location via GPS */}
          <div className="rounded-xl border border-pine-600/30 bg-pine-600/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-pine-700">
              Automatic Detection
            </p>
            <p className="mt-1 text-xs text-ink-600">
              Fetch weather directly for your immediate surroundings using device location.
            </p>
            <div className="mt-3">
              <GpsLocationControl onPick={({ location }) => pickLocation(location)} />
            </div>
          </div>

          {/* Primary Action 2: Enter Manually / Search */}
          <div className="mt-4">
            <label className="block">
              <span className="label-caps">{t.enterManually}</span>
              <div className="relative mt-1">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchCityPlaceholder}
                  className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder-ink-400 focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
                  aria-label="Search for a city"
                />
              </div>
            </label>
            <LocationSearchResults query={query} onPick={(loc) => pickLocation(loc)} />
            <DemoCityButtons onPick={(loc) => pickLocation(loc)} />
            <ManualLocationForm onPick={(loc) => pickLocation(loc)} />
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
            <button
              type="button"
              className="btn"
              onClick={() => setStep(0)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {t.back}
            </button>
            <button
              type="button"
              className="text-xs text-ink-500 underline decoration-line underline-offset-2 hover:text-pine-700"
              onClick={() => {
                setSelectedLocation(DEMO_LOCATIONS[0]);
                setStep(2);
              }}
            >
              {t.skipDefault}
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            Tip: you can search any city, town, or village in India, or use automatic GPS detection.
          </p>
        </section>
      )}

      {/* Step 2: Persona Selection: Farmer vs Daily Commuter */}
      {step === 2 && (
        <section className="card card-pad border border-line bg-surface shadow-sm">
          <div className="mb-4 border-b border-line pb-3">
            <h2 className="text-lg font-bold text-ink-900">{t.whoAreYou}</h2>
            <p className="mt-1 text-sm text-ink-500">
              {t.whoAreYouSub}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Persona 1: Farmer & Grower */}
            <button
              type="button"
              onClick={() => setPersona("farmer")}
              aria-pressed={persona === "farmer"}
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                persona === "farmer"
                  ? "border-pine-600 bg-pine-600/5 ring-1 ring-pine-600 shadow-sm"
                  : "border-line bg-surface hover:border-pine-500/50 hover:bg-paper-light"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pine-600/10 text-pine-700 border border-pine-600/20">
                    <Sprout className="h-6 w-6" />
                  </span>
                  {persona === "farmer" ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pine-600 text-white font-bold">
                      <Check className="h-4 w-4 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] text-ink-500">Select</span>
                  )}
                </div>
                <h3 className="mt-3 text-base font-bold text-ink-900 group-hover:text-pine-700">
                  {t.farmerPersona}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                  {t.farmerPersonaDesc}
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-pine-600/20 bg-pine-600/5 p-2.5 text-[11px] text-pine-800">
                <span className="font-bold text-pine-900">Includes:</span> Crop Rain Outlook · Spray Windows · Soil Advisories + PM2.5 Air Quality & Lung Health
              </div>
            </button>

            {/* Persona 2: Daily Commuter & Resident */}
            <button
              type="button"
              onClick={() => setPersona("commuter")}
              aria-pressed={persona === "commuter"}
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                persona === "commuter"
                  ? "border-weather-rain bg-weather-rain/5 ring-1 ring-weather-rain shadow-sm"
                  : "border-line bg-surface hover:border-weather-rain/50 hover:bg-paper-light"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-weather-rain/10 text-weather-rain border border-weather-rain/20">
                    <TrainFront className="h-6 w-6" />
                  </span>
                  {persona === "commuter" ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-weather-rain text-white font-bold">
                      <Check className="h-4 w-4 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] text-ink-500">Select</span>
                  )}
                </div>
                <h3 className="mt-3 text-base font-bold text-ink-900 group-hover:text-weather-rain">
                  {t.commuterPersona}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                  {t.commuterPersonaDesc}
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-weather-rain/20 bg-weather-rain/5 p-2.5 text-[11px] text-weather-rain">
                <span className="font-bold text-ink-900">Includes:</span> Road Visibility · Rain Timing · Heat Comfort + PM2.5 Lung & Air Quality (No Farm Clutter)
              </div>
            </button>
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" className="btn" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {t.back}
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => update({ onboarded: true })}
            >
              {t.openDashboard} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Preferences & Units */}
      {step === 3 && (
        <section className="card card-pad border border-line bg-surface shadow-sm">
          <h2 className="text-base font-bold text-ink-900">A few preferences</h2>
          <p className="mt-1 text-sm text-ink-500">
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
            <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3.5">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                  <Eye className="h-4 w-4 text-pine-600" aria-hidden="true" />
                  Heightened air-quality awareness
                </p>
                <p className="mt-1 text-xs text-ink-500">
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
                  prefs.heightenedAqAwareness ? "bg-pine-600" : "bg-line-strong"
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
            <button type="button" className="btn" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {t.back}
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => update({ onboarded: true })}
            >
              {t.openDashboard} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
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
      <div className="mt-1.5 flex rounded-lg border border-line bg-paper-light p-0.5" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value === o.value ? "bg-surface text-ink-900 shadow-sm border border-line" : "text-ink-500 hover:text-ink-900"
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
