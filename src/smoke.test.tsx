/**
 * Smoke tests: render the real component tree to string to catch runtime
 * errors in the app shell, onboarding and dashboard layouts.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import App from "./App";
import { PreferencesProvider } from "./state/preferencesContext";
import { DEMO_LOCATIONS } from "./services/demoDataService";
import type { Preferences } from "./types/weather";

// Minimal localStorage stub for the node test environment.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
});

function setPrefs(patch: Partial<Preferences>) {
  const base: Preferences = {
    version: 1,
    locations: [DEMO_LOCATIONS[0]],
    selectedLocationId: DEMO_LOCATIONS[0].id,
    interests: ["outdoor", "comfort"],
    heightenedAqAwareness: false,
    temperatureUnit: "C",
    windUnit: "kmh",
    timeFormat: "12h",
    dataMode: "demo",
    onboarded: true,
    ...patch,
  };
  store.set("mausam-sense:prefs:v1", JSON.stringify(base));
}

const render = () =>
  renderToString(
    <PreferencesProvider>
      <App />
    </PreferencesProvider>,
  );

describe("app smoke render", () => {
  it("renders language onboarding with official Indian languages for first-time visitors", () => {
    store.clear();
    const html = render();
    expect(html).toContain("Weather that understands your day");
    expect(html).toContain("Choose Your Language");
    expect(html).toContain("हिन्दी");
    expect(html).toContain("தமிழ்");
    expect(html).toContain("বাংলা");
  });

  it("renders the dashboard shell when onboarded", () => {
    setPrefs({ onboarded: true });
    const html = render();
    expect(html).toContain("Mausam Sense");
    expect(html).toContain("Refresh");
  });

  it("renders without a selected location crashing the header", () => {
    setPrefs({ onboarded: true, selectedLocationId: null, locations: [] });
    const html = render();
    expect(html).toContain("Mausam Sense");
  });
});
