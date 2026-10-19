/**
 * IMD (India Meteorological Department) adapter.
 *
 * VERIFIED BEHAVIOUR (checked from this environment before implementation):
 * - Documented endpoints live under https://api.imd.gov.in/api/v1/…
 *   (districtwarning, cityforecast, districtrainfall, … — see IMD's public
 *   API reference page).
 * - Every endpoint returns HTTP 401 {"error":"API key missing"} without an
 *   issued key; keys are distributed by IMD upon request. There is no free,
 *   keyless public feed.
 *
 * Therefore this adapter:
 * - returns "unavailable" with an explicit reason when no key is configured
 *   (the default), so the UI can show an honest state instead of inventing
 *   official-looking warnings;
 * - actually calls IMD when VITE_IMD_API_KEY is set, plus an optional
 *   VITE_IMD_DISTRICT_ID, and parses the response defensively;
 * - never fabricates a warning under any circumstances.
 */

import type { GeoLocation, WeatherWarning } from "../types/weather";
import { fetchJson, describeError } from "./httpClient";

const IMD_BASE = "https://api.imd.gov.in/api/v1";

const IMD_API_KEY = import.meta.env.VITE_IMD_API_KEY as string | undefined;
const IMD_DISTRICT_ID = import.meta.env.VITE_IMD_DISTRICT_ID as string | undefined;

export interface IMDResult<T> {
  available: boolean;
  data?: T;
  reason?: string;
}

export function imdKeyConfigured(): boolean {
  return Boolean(IMD_API_KEY);
}

interface IMDWarningRaw {
  id?: string | number;
  district?: string;
  area?: string;
  warning_type?: string;
  type?: string;
  headline?: string;
  title?: string;
  msg?: string;
  message?: string;
  severity?: string;
  level?: string;
  valid_from?: string;
  validfrom?: string;
  from?: string;
  valid_to?: string;
  validto?: string;
  to?: string;
  issued?: string;
}

function normaliseSeverity(raw: IMDWarningRaw): WeatherWarning["severity"] {
  const s = `${raw.severity ?? raw.level ?? ""}`.toLowerCase();
  if (s.includes("red")) return "red";
  if (s.includes("orange")) return "orange";
  if (s.includes("yellow")) return "yellow";
  return "unknown";
}

/**
 * Fetch official district warnings. Requires an issued IMD API key and a
 * district id (IMD identifies districts by numeric id, not name).
 */
export async function fetchOfficialWarnings(
  loc: GeoLocation,
): Promise<IMDResult<WeatherWarning[]>> {
  if (!IMD_API_KEY) {
    return {
      available: false,
      reason:
        "Official IMD warnings require an issued API key (endpoints return HTTP 401 without one). No key is configured, so no official warnings are shown — none are invented.",
    };
  }
  if (!IMD_DISTRICT_ID) {
    return {
      available: false,
      reason:
        "An IMD API key is configured but no district id (VITE_IMD_DISTRICT_ID) is set for this location, so official warnings cannot be requested.",
    };
  }
  try {
    const url = `${IMD_BASE}/districtwarning?id=${encodeURIComponent(IMD_DISTRICT_ID)}`;
    const raw = await fetchJson<IMDWarningRaw[] | { data?: IMDWarningRaw[] }>(url, {
      headers: { "x-api-key": IMD_API_KEY },
      retries: 1,
    });
    const list = Array.isArray(raw) ? raw : (raw.data ?? []);
    const warnings: WeatherWarning[] = list.map((w, i) => ({
      id: `imd-${w.id ?? i}`,
      type: w.warning_type ?? w.type ?? "Weather warning",
      headline: w.headline ?? w.title ?? w.warning_type ?? "IMD warning",
      severity: normaliseSeverity(w),
      affectedArea: w.area ?? w.district ?? loc.name,
      effectiveFrom: w.valid_from ?? w.validfrom ?? w.from ?? "—",
      effectiveTo: w.valid_to ?? w.validto ?? w.to ?? "—",
      issuingAuthority: "India Meteorological Department (IMD)",
      sourceUrl: "https://mausam.imd.gov.in/",
      detail: w.msg ?? w.message,
      isDemo: false,
    }));
    return { available: true, data: warnings };
  } catch (e) {
    return { available: false, reason: `IMD request failed: ${describeError(e)}` };
  }
}

/**
 * Agricultural advisories. IMD's public API does not expose a stable,
 * documented agricultural-advisory endpoint in the reference we could verify,
 * and krishi advisories are published through separate portals. This adapter
 * reports that honestly rather than inventing advisories.
 */
export async function fetchAgriculturalAdvisories(
  loc: GeoLocation,
): Promise<IMDResult<never[]>> {
  void loc;
  return {
    available: false,
    reason:
      "No verified agricultural-advisory endpoint was found in IMD's public API reference. General weather summaries are shown separately from official agricultural advice.",
  };
}
