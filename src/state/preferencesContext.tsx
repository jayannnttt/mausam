/**
 * Preferences state: persisted to localStorage, no account, no server.
 * Key design: preferences survive refresh; changing them never mutates
 * underlying weather observations — only ordering, units and emphasis.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GeoLocation, InterestKey, Preferences } from "../types/weather";
import { DEMO_LOCATIONS } from "../services/demoDataService";

const STORAGE_KEY = "mausam-sense:prefs:v1";

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  locations: [DEMO_LOCATIONS[0]],
  selectedLocationId: DEMO_LOCATIONS[0].id,
  interests: ["outdoor", "comfort"],
  heightenedAqAwareness: false,
  temperatureUnit: "C",
  windUnit: "kmh",
  timeFormat: "12h",
  dataMode: "auto",
  onboarded: false,
};

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    if (parsed.version !== 1) return DEFAULT_PREFERENCES;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      locations: parsed.locations?.length ? parsed.locations : DEFAULT_PREFERENCES.locations,
      interests: parsed.interests?.length ? parsed.interests : DEFAULT_PREFERENCES.interests,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function save(prefs: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable (private mode) — the app still works in-session.
  }
}

interface PreferencesContextValue {
  prefs: Preferences;
  selectedLocation: GeoLocation;
  setSelectedLocation: (loc: GeoLocation) => void;
  toggleInterest: (key: InterestKey) => void;
  update: (patch: Partial<Preferences>) => void;
  resetOnboarding: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());

  useEffect(() => {
    save(prefs);
  }, [prefs]);

  const setSelectedLocation = useCallback((loc: GeoLocation) => {
    setPrefs((p) => {
      const existing = p.locations.find((l) => l.id === loc.id);
      const locations = existing
        ? p.locations
        : [loc, ...p.locations].slice(0, 8);
      return { ...p, locations, selectedLocationId: loc.id };
    });
  }, []);

  const toggleInterest = useCallback((key: InterestKey) => {
    setPrefs((p) => {
      const has = p.interests.includes(key);
      const interests = has
        ? p.interests.filter((i) => i !== key)
        : [...p.interests, key];
      return { ...p, interests: interests.length ? interests : p.interests };
    });
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((p) => ({ ...p, ...patch }));
  }, []);

  const resetOnboarding = useCallback(() => {
    setPrefs((p) => ({ ...p, onboarded: false }));
  }, []);

  const selectedLocation = useMemo(() => {
    return (
      prefs.locations.find((l) => l.id === prefs.selectedLocationId) ??
      prefs.locations[0] ??
      DEFAULT_PREFERENCES.locations[0]
    );
  }, [prefs.locations, prefs.selectedLocationId]);

  const value = useMemo(
    () => ({
      prefs,
      selectedLocation,
      setSelectedLocation,
      toggleInterest,
      update,
      resetOnboarding,
    }),
    [prefs, selectedLocation, setSelectedLocation, toggleInterest, update, resetOnboarding],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
