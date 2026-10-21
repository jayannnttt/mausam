/**
 * Reverse geocoding — turn a GPS fix into a readable place name, district and
 * state WITHOUT replacing the precise coordinates.
 *
 * Providers (both keyless, both checked live during development):
 * 1. BigDataCloud reverse-geocode-client — designed for browser use, no key.
 * 2. OpenStreetMap Nominatim (fallback; supplies the district field that
 *    BigDataCloud often lacks, and covers BigDataCloud outages).
 *
 * If every provider fails, callers still get the raw coordinates and use a
 * descriptive label — reverse geocoding never blocks weather loading.
 */

import type { GeoLocation } from "../types/weather";
import { fetchJson } from "./httpClient";

export interface ResolvedPlace {
  name: string;
  admin1?: string;
  admin2?: string;
  country: string;
  countryCode: string;
  /** Which provider produced the name (for the transparency panel). */
  provider: string;
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  localitySubdivision?: string;
  principalSubdivision?: string;
  countryName?: string;
  countryCode?: string;
  localityInfo?: {
    administrative?: { name?: string; description?: string; adminLevel?: number }[];
  };
}

interface NominatimResponse {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    county?: string;
    state_district?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

const BDC_ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

async function fromBigDataCloud(latitude: number, longitude: number): Promise<ResolvedPlace | null> {
  try {
    const url = `${BDC_ENDPOINT}?latitude=${latitude.toFixed(6)}&longitude=${longitude.toFixed(
      6,
    )}&localityLanguage=en`;
    const data = await fetchJson<BigDataCloudResponse>(url, { retries: 1, timeoutMs: 8000 });
    const name = data.city || data.locality || data.localitySubdivision;
    if (!name && !data.principalSubdivision) return null;
    return {
      name: name || `GPS location (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
      admin1: data.principalSubdivision,
      country: data.countryName ?? "",
      countryCode: data.countryCode ?? "",
      provider: "BigDataCloud",
    };
  } catch {
    return null;
  }
}

async function fromNominatim(latitude: number, longitude: number): Promise<ResolvedPlace | null> {
  try {
    const url = `${NOMINATIM_ENDPOINT}?format=jsonv2&zoom=12&accept-language=en&lat=${latitude.toFixed(
      6,
    )}&lon=${longitude.toFixed(6)}`;
    const data = await fetchJson<NominatimResponse>(url, { retries: 1, timeoutMs: 8000 });
    const a = data.address;
    if (!a) return null;
    const name = a.city || a.town || a.village || a.suburb;
    if (!name && !a.state) return null;
    return {
      name: name || `GPS location (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`,
      admin1: a.state,
      admin2: a.state_district || a.county,
      country: a.country ?? "",
      countryCode: (a.country_code ?? "").toUpperCase(),
      provider: "OpenStreetMap Nominatim",
    };
  } catch {
    return null;
  }
}

/** Best-effort reverse geocoding. Never throws. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ResolvedPlace | null> {
  const primary = await fromBigDataCloud(latitude, longitude);
  if (primary?.admin2) return primary;

  const fallback = await fromNominatim(latitude, longitude);
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    ...primary,
    admin2: primary.admin2 ?? fallback.admin2,
    provider: `${primary.provider} + Nominatim`,
  };
}

/**
 * Build a GeoLocation from a GPS fix + optional resolved place.
 * The coordinates passed in are preserved EXACTLY — no snapping to a city
 * centre, so weather, ML inference and verification all use the same point.
 */
export function deviceLocation(
  fix: { latitude: number; longitude: number; accuracyMeters: number },
  place: ResolvedPlace | null,
): GeoLocation {
  const id = `gps-${fix.latitude.toFixed(4)},${fix.longitude.toFixed(4)}`;
  return {
    id,
    name: place?.name ?? `GPS location (${fix.latitude.toFixed(3)}, ${fix.longitude.toFixed(3)})`,
    admin1: place?.admin1,
    admin2: place?.admin2,
    country: place?.country ?? "",
    countryCode: place?.countryCode ?? "",
    latitude: fix.latitude,
    longitude: fix.longitude,
    timezone: "auto",
    source: "device",
  };
}
