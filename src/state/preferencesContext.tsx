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
import type { GeoLocation, InterestKey, Preferences, UserPersona } from "../types/weather";
import { DEMO_LOCATIONS } from "../services/demoDataService";
import { getTranslation, type TranslationDict } from "../i18n/translations";

const STORAGE_KEY = "mausam-sense:prefs:v1";

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  locations: [DEMO_LOCATIONS[0]],
  selectedLocationId: DEMO_LOCATIONS[0].id,
  interests: ["commuting", "outdoor", "comfort"],
  heightenedAqAwareness: false,
  temperatureUnit: "C",
  windUnit: "kmh",
  timeFormat: "12h",
  dataMode: "auto",
  onboarded: false,
  language: "en",
  userPersona: "commuter",
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
      language: parsed.language ?? DEFAULT_PREFERENCES.language,
      userPersona: parsed.userPersona ?? (parsed.interests?.includes("farming") ? "farmer" : "commuter"),
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
  language: string;
  setLanguage: (lang: string) => void;
  persona: UserPersona;
  setPersona: (p: UserPersona) => void;
  t: TranslationDict;
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

  const setLanguage = useCallback((lang: string) => {
    setPrefs((p) => ({ ...p, language: lang }));
  }, []);

  const setPersona = useCallback((persona: UserPersona) => {
    setPrefs((p) => {
      const interests: InterestKey[] =
        persona === "farmer"
          ? ["farming", "outdoor", "comfort"]
          : ["commuting", "outdoor", "comfort"];
      return { ...p, userPersona: persona, interests };
    });
  }, []);

  const resetOnboarding = useCallback(() => {
    setPrefs((p) => ({ ...p, onboarded: false }));
  }, []);

  const language = prefs.language || "en";
  const persona: UserPersona =
    prefs.userPersona || (prefs.interests.includes("farming") ? "farmer" : "commuter");
  const t = useMemo(() => getTranslation(language), [language]);

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
      language,
      setLanguage,
      persona,
      setPersona,
      t,
      selectedLocation,
      setSelectedLocation,
      toggleInterest,
      update,
      resetOnboarding,
    }),
    [
      prefs,
      language,
      setLanguage,
      persona,
      setPersona,
      t,
      selectedLocation,
      setSelectedLocation,
      toggleInterest,
      update,
      resetOnboarding,
    ],
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
