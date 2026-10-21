/**
 * PersonalizedDashboard — Core application shell with 3-lines menu navigation
 * and dedicated dashboards for:
 * - Basic Dashboard (Home: temperature, high/low, 24h forecast)
 * - Rain Report (Rainfall totals, wet spells, probability & accumulation charts)
 * - Wind Report (Surface speed, gusts, Beaufort scale, 24h circulation trend)
 * - Air Quality (PM2.5, PM10, CAMS model, outdoor activity planner)
 * - Mausam Prediction (SIH 2026 trained ML model, verification & graphs)
 */

import { useMemo, useState } from "react";
import {
  Menu,
  RefreshCw,
  Settings,
  Globe,
  Home,
  CloudRain,
  Wind,
  Gauge,
  Brain,
  ChevronRight,
} from "lucide-react";
import { usePreferences } from "../state/preferencesContext";
import { useWeatherData } from "../state/useWeatherData";
import { INDIAN_LANGUAGES } from "../i18n/languages";
import { LanguageSelectorModal } from "./LanguageSelectorModal";
import { ProfilePreferences } from "./ProfilePreferences";
import { LocationSelector } from "./LocationSelector";
import { NavigationDrawer, type DashboardTab } from "./NavigationDrawer";
import { HomeDashboard } from "./HomeDashboard";
import { RainReport } from "./RainReport";
import { WindReport } from "./WindReport";
import { AirQualityReport } from "./AirQualityReport";
import { RainIntelligence } from "./RainIntelligence";
import { ErrorState, SkeletonCard } from "./ui/primitives";

export function PersonalizedDashboard() {
  const {
    prefs,
    language,
    persona,
    setPersona,
    t,
    selectedLocation,
    setSelectedLocation,
    update,
  } = usePreferences();

  const { dataset, loading, error, reload } = useWeatherData(
    selectedLocation,
    prefs.dataMode
  );

  const [activeTab, setActiveTab] = useState<DashboardTab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);

  const currentLangObj = useMemo(
    () => INDIAN_LANGUAGES.find((l) => l.code === language) ?? INDIAN_LANGUAGES[0],
    [language]
  );

  const tabLabels: Record<DashboardTab, { label: string; icon: typeof Home }> = {
    home: { label: "Basic Dashboard", icon: Home },
    rain: { label: "Rain Report", icon: CloudRain },
    wind: { label: "Wind Report", icon: Wind },
    "air-quality": { label: "Air Quality", icon: Gauge },
    prediction: { label: "Mausam Prediction", icon: Brain },
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-3 pb-16 sm:px-6">
      {/* Editorial Navigation Header */}
      <header className="sticky top-0 z-30 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left Cluster: 3-Lines Hamburger Menu Button + App Wordmark */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex items-center justify-center rounded-lg border border-line bg-surface p-2 text-ink-700 hover:border-ink-400 hover:text-ink-950 transition-colors shadow-2xs"
              aria-label="Open navigation menu"
              title="Open Dashboards Menu (3 lines)"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-ink-950 uppercase">
                  Mausam Sense
                </h1>
                <span className="hidden md:inline-block text-[11px] font-editorial italic text-ink-500">
                  Meteorological Instrument
                </span>
              </div>
              {/* Active Tab indicator pill for quick glance */}
              <span className="text-[10px] font-medium text-pine flex items-center gap-1 sm:hidden">
                <span>Current:</span>
                <strong className="font-semibold">{tabLabels[activeTab].label}</strong>
              </span>
            </div>
          </div>

          {/* Center: Desktop Navigation Tabs */}
          <nav
            className="hidden lg:flex items-center rounded-xl border border-line bg-surface/70 p-1 text-xs font-medium"
            aria-label="Main Dashboards"
          >
            {(Object.keys(tabLabels) as DashboardTab[]).map((tab) => {
              const TabIcon = tabLabels[tab].icon;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
                    isActive
                      ? "bg-pine text-surface font-semibold shadow-xs"
                      : "text-ink-600 hover:text-ink-950"
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  <span>{tabLabels[tab].label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Action Cluster: Unit, Language, Location, Refresh, Settings */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Direct Celsius/Fahrenheit Unit Toggle */}
            <div
              className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5 text-xs font-medium"
              role="group"
              aria-label="Temperature unit"
            >
              <button
                type="button"
                onClick={() => update({ temperatureUnit: "C" })}
                aria-pressed={prefs.temperatureUnit === "C"}
                className={`rounded px-1.5 sm:px-2 py-1 text-xs font-semibold tabular-nums transition-colors ${
                  prefs.temperatureUnit === "C"
                    ? "bg-pine text-surface shadow-xs"
                    : "text-ink-500 hover:text-ink-900"
                }`}
                title="Celsius (°C)"
              >
                °C
              </button>
              <button
                type="button"
                onClick={() => update({ temperatureUnit: "F" })}
                aria-pressed={prefs.temperatureUnit === "F"}
                className={`rounded px-1.5 sm:px-2 py-1 text-xs font-semibold tabular-nums transition-colors ${
                  prefs.temperatureUnit === "F"
                    ? "bg-pine text-surface shadow-xs"
                    : "text-ink-500 hover:text-ink-900"
                }`}
                title="Fahrenheit (°F)"
              >
                °F
              </button>
            </div>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={() => setLanguageModalOpen(true)}
              className="btn px-2 sm:px-2.5 py-1 text-xs font-medium border-line bg-surface hover:border-ink-300"
              aria-label={t.changeLanguage}
              title={`${t.changeLanguage} (${currentLangObj.name})`}
            >
              <Globe className="h-3.5 w-3.5 shrink-0 text-pine" aria-hidden="true" />
              <span className="hidden sm:inline text-xs text-ink-800">{currentLangObj.nativeName}</span>
              <span className="sm:hidden text-xs text-ink-800 uppercase font-mono">{currentLangObj.code}</span>
            </button>

            {/* Location Selector */}
            <LocationSelector
              locations={prefs.locations}
              selected={selectedLocation}
              onSelect={setSelectedLocation}
              onSaveNew={setSelectedLocation}
            />

            {/* Refresh Button */}
            <button
              type="button"
              onClick={reload}
              className="btn px-2 sm:px-2.5 py-1"
              aria-label={t.refresh}
              title={t.refresh}
              disabled={loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-ink-700 ${loading ? "animate-spin text-pine" : ""}`}
                aria-hidden="true"
              />
              <span className="hidden md:inline text-xs">Refresh</span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn px-2 sm:px-2.5 py-1"
              aria-label={t.settings}
              title={t.settings}
            >
              <Settings className="h-3.5 w-3.5 text-ink-700" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Sub-bar: Persona Mode Toggle ("View Mode: Farmer / Commuter") */}
        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
          <div
            className="flex w-full items-center rounded-lg border border-line bg-surface p-0.5 sm:w-auto"
            role="radiogroup"
            aria-label="User persona mode"
          >
            <span className="hidden px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-500 sm:inline">
              View Mode:
            </span>
            <span className="sr-only">View Mode:</span>
            <button
              type="button"
              role="radio"
              aria-checked={persona === "farmer"}
              onClick={() => setPersona("farmer")}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-all ${
                persona === "farmer"
                  ? "bg-pine text-surface font-semibold shadow-xs"
                  : "text-ink-600 hover:text-ink-950"
              }`}
            >
              <span>🌾 {t.farmerMode}</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={persona === "commuter"}
              onClick={() => setPersona("commuter")}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-all ${
                persona === "commuter"
                  ? "bg-weather-rain text-surface font-semibold shadow-xs"
                  : "text-ink-600 hover:text-ink-950"
              }`}
            >
              <span>🚗 {t.commuterMode}</span>
            </button>
          </div>

          {/* Quick tab switcher pill on small devices */}
          <div className="lg:hidden flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex items-center gap-1 text-xs text-pine font-medium hover:underline"
            >
              <span>{tabLabels[activeTab].label}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mt-5 space-y-6">
        {error && (
          <ErrorState
            title="Unable to load meteorological data"
            description={error}
            onRetry={reload}
          />
        )}

        {loading && !dataset ? (
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          dataset && (
            <>
              {/* 1. Basic Dashboard (Home) */}
              {activeTab === "home" && (
                <HomeDashboard
                  dataset={dataset}
                  prefs={prefs}
                  onNavigate={(tab) => setActiveTab(tab)}
                />
              )}

              {/* 2. Rain Report Dashboard */}
              {activeTab === "rain" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-ink-950">Rain Report</h2>
                      <p className="text-xs text-ink-500">
                        Rainfall totals, hourly precipitation probabilities, and wet-spell timing
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="text-xs text-pine font-semibold hover:underline"
                    >
                      ← Back to Basic Dashboard
                    </button>
                  </div>
                  <RainReport dataset={dataset} prefs={prefs} />
                </div>
              )}

              {/* 3. Wind Report Dashboard */}
              {activeTab === "wind" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-ink-950">Wind Report</h2>
                      <p className="text-xs text-ink-500">
                        Surface wind velocities, peak gusts, Beaufort scale, and 24h circulation
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="text-xs text-pine font-semibold hover:underline"
                    >
                      ← Back to Basic Dashboard
                    </button>
                  </div>
                  <WindReport dataset={dataset} prefs={prefs} />
                </div>
              )}

              {/* 4. Air Quality Dashboard */}
              {activeTab === "air-quality" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-ink-950">Air Quality & Outdoor Health</h2>
                      <p className="text-xs text-ink-500">
                        Copernicus CAMS atmospheric particulates and transparent outdoor activity recommendations
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="text-xs text-pine font-semibold hover:underline"
                    >
                      ← Back to Basic Dashboard
                    </button>
                  </div>
                  <AirQualityReport dataset={dataset} prefs={prefs} />
                </div>
              )}

              {/* 5. Mausam Prediction (Trained ML Model Section) */}
              {activeTab === "prediction" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-ink-950">Mausam Prediction Platform</h2>
                      <p className="text-xs text-ink-500">
                        SIH 2026 trained machine learning model, conformal uncertainty intervals, and NWP verification
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="text-xs text-pine font-semibold hover:underline"
                    >
                      ← Back to Basic Dashboard
                    </button>
                  </div>
                  <RainIntelligence
                    location={selectedLocation}
                    dataMode={dataset?.mode ?? "UNAVAILABLE"}
                  />
                </div>
              )}
            </>
          )
        )}
      </main>

      {/* 3-Lines Navigation Drawer */}
      <NavigationDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenLanguage={() => setLanguageModalOpen(true)}
        currentLanguageName={currentLangObj.nativeName}
      />

      {/* Modals */}
      <ProfilePreferences open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LanguageSelectorModal open={languageModalOpen} onClose={() => setLanguageModalOpen(false)} />

      {/* Minimal Footer */}
      <footer className="mt-12 border-t border-line pt-6 text-[11px] leading-relaxed text-ink-500">
        <p>
          <strong className="text-ink-800 font-semibold">Mausam Sense</strong> — Precision meteorological instrument and personalization engine.
          Data streams by Open-Meteo weather and CAMS atmospheric models. Official bulletins sourced via IMD public APIs where available.
        </p>
      </footer>
    </div>
  );
}
