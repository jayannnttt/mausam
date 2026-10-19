/**
 * PersonalizedDashboard — assembles all modules, ordered by the user's
 * interests. Official alerts are pinned high regardless of preferences.
 */

import { useMemo, useState } from "react";
import { RefreshCw, Settings, SlidersHorizontal } from "lucide-react";
import type {
  InterestKey,
  Preferences,
  WeatherDataset,
} from "../types/weather";
import { INTERESTS } from "../types/weather";
import { usePreferences } from "../state/preferencesContext";
import { useWeatherData } from "../state/useWeatherData";
import { DEMO_LOCATIONS } from "../services/demoDataService";
import { CurrentWeatherCard } from "./CurrentWeatherCard";
import { WeatherAlertCard } from "./WeatherAlertCard";
import { ActivityPlanner } from "./ActivityPlanner";
import { FarmingAssistant } from "./FarmingAssistant";
import { WeatherFeelCard } from "./WeatherFeelCard";
import { CommuteCard } from "./CommuteCard";
import { ProfilePreferences } from "./ProfilePreferences";
import { LocationSelector } from "./LocationSelector";
import { DataSourceBadge, DemoBanner, ProviderLine } from "./DataSourceBadge";
import { ErrorState, SkeletonCard } from "./ui/primitives";

/** Module keys in default display priority. */
const MODULE_ORDER: InterestKey[] = ["outdoor", "farming", "comfort", "commuting"];

export function PersonalizedDashboard() {
  const { prefs, selectedLocation, setSelectedLocation, toggleInterest, update } =
    usePreferences();
  const { dataset, loading, error, reload } = useWeatherData(selectedLocation, prefs.dataMode);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const orderedModules = useMemo(() => {
    const priority = (k: InterestKey) => {
      const idx = prefs.interests.indexOf(k);
      return idx === -1 ? MODULE_ORDER.length : idx;
    };
    return [...MODULE_ORDER].sort((a, b) => priority(a) - priority(b));
  }, [prefs.interests]);

  const switchToDemo = () => {
    update({ dataMode: "demo" });
    const fixture = DEMO_LOCATIONS.find((d) => d.id === selectedLocation.id);
    if (!fixture) setSelectedLocation(DEMO_LOCATIONS[0]);
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-3 pb-16 sm:px-4">
      {/* Header */}
      <header className="sticky top-0 z-30 -mx-3 border-b border-navy-800 bg-navy-950/90 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-450/40 bg-sky-450/10">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-sky-350"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </span>
            <div>
              <h1 className="text-sm font-bold leading-tight">Mausam Sense</h1>
              <p className="text-[11px] leading-tight text-slate-400">
                Weather that understands your day
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Data-mode quick toggle */}
            <div
              className="hidden rounded-lg border border-navy-700 bg-navy-900 p-0.5 sm:flex"
              role="group"
              aria-label="Data mode"
            >
              {(
                [
                  ["auto", "Auto"],
                  ["live", "Live"],
                  ["demo", "Demo"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update({ dataMode: v })}
                  aria-pressed={prefs.dataMode === v}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    prefs.dataMode === v
                      ? v === "demo"
                        ? "bg-amber-450/20 text-amber-300"
                        : "bg-navy-700 text-sky-350"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <LocationSelector
              locations={prefs.locations}
              selected={selectedLocation}
              onSelect={setSelectedLocation}
              onSaveNew={setSelectedLocation}
            />

            <button
              type="button"
              onClick={reload}
              className="btn"
              aria-label="Refresh weather data"
              title="Refresh data"
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn"
              aria-label="Open settings"
              title="Settings & personalization"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* Interest chips — quick personalization */}
        <div className="strip-scroll mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="shrink-0 text-[11px] text-slate-500">Interests:</span>
          {INTERESTS.map((i) => {
            const on = prefs.interests.includes(i.key);
            return (
              <button
                key={i.key}
                type="button"
                onClick={() => toggleInterest(i.key)}
                aria-pressed={on}
                title={i.label}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  on
                    ? "border-sky-450/60 bg-sky-450/15 text-sky-350"
                    : "border-navy-700 bg-navy-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {i.label.split(" & ")[0]}
              </button>
            );
          })}
          {dataset && (
            <span className="ml-auto shrink-0">
              <DataSourceBadge mode={dataset.mode} />
            </span>
          )}
        </div>
      </header>

      <main className="mt-4 space-y-4">
        {error && (
          <ErrorState
            title="Something went wrong loading weather data"
            description={error}
            onRetry={reload}
          />
        )}

        {loading && !dataset ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <div className="space-y-4 lg:col-span-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ) : (
          dataset && (
            <div className="grid gap-4 lg:grid-cols-5">
              {/* Left column: current conditions + official alerts (pinned) */}
              <div className="space-y-4 lg:col-span-2">
                {dataset.mode === "UNAVAILABLE" ? (
                  <div className="space-y-4">
                    <ErrorState
                      title="No usable weather data"
                      description={
                        dataset.modeReason ??
                        "No data provider could serve this location."
                      }
                      onRetry={reload}
                    />
                    <div className="rounded-2xl border border-amber-450/40 bg-amber-450/10 p-4 text-sm text-amber-200">
                      <p className="font-semibold">Try demonstration mode instead?</p>
                      <p className="mt-1 text-xs text-amber-200/80">
                        Demo mode shows clearly-labelled synthetic data for Chennai, Bengaluru and
                        Thanjavur — useful offline or when a provider is unreachable.
                      </p>
                      <button
                        type="button"
                        className="btn mt-3 border-amber-450 bg-amber-450/20 text-amber-100"
                        onClick={switchToDemo}
                      >
                        Switch to demo data
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <CurrentWeatherCard dataset={dataset} prefs={prefs} />
                    <WeatherAlertCard dataset={dataset} prefs={prefs} />
                    {dataset.mode === "DEMO" && dataset.modeReason && (
                      <DemoBanner reason={dataset.modeReason} />
                    )}
                    {dataset.providers.warnings && (
                      <ProviderLine {...dataset.providers.warnings} />
                    )}
                  </>
                )}
              </div>

              {/* Right column: interest-ordered modules */}
              <div className="space-y-4 lg:col-span-3">
                {dataset.mode !== "UNAVAILABLE" &&
                  orderedModules.map((key) => {
                    switch (key) {
                      case "outdoor":
                        return (
                          <ActivityPlanner key={key} dataset={dataset} prefs={prefs} />
                        );
                      case "farming":
                        return (
                          <FarmingAssistant key={key} dataset={dataset} prefs={prefs} />
                        );
                      case "comfort":
                        return <WeatherFeelCard key={key} dataset={dataset} prefs={prefs} />;
                      case "commuting":
                        return <CommuteCard key={key} dataset={dataset} prefs={prefs} />;
                    }
                  })}
              </div>
            </div>
          )
        )}
      </main>

      <ProfilePreferences open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <footer className="mt-10 border-t border-navy-800 pt-4 text-[11px] leading-relaxed text-slate-500">
        <p>
          <strong>Mausam Sense</strong> — an independent hackathon prototype for personalizing
          weather information. Not affiliated with, endorsed by, or sourced from official IMD
          products beyond IMD's public API where explicitly labelled. Weather and air-quality data
          by Open-Meteo; pollutant values are CAMS model estimates. Always follow official warnings
          and health guidance.
        </p>
      </footer>
    </div>
  );
}
