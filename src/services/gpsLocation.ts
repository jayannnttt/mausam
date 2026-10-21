/**
 * GPS location services — browser Geolocation API wrapper.
 *
 * Privacy & UX rules enforced here:
 * - Permission is NEVER requested automatically; only on an explicit user
 *   action (a "Use my current location" button).
 * - High-accuracy mode with sensible timeout and a short client-side cache so
 *   repeated UI reads do not re-trigger the hardware.
 * - Every failure mode (denied / unavailable / timeout / insecure context /
 *   unsupported) is mapped to a typed error with actionable messaging.
 * - Coordinates are stored locally only as the user's *selected location*
 *   (same localStorage entry as any other saved location) and are not sent
 *   anywhere except to the weather/ML providers that produce the forecast for
 *   that point — exactly like a manually chosen city.
 */

export interface GpsFix {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy radius in metres (95% confidence, per spec). */
  accuracyMeters: number;
  /** ISO timestamp of the fix. */
  timestamp: string;
  source: "device";
}

export type GpsErrorCode =
  | "UNSUPPORTED"
  | "INSECURE_CONTEXT"
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN";

export class GpsError extends Error {
  constructor(
    public code: GpsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GpsError";
  }
}

export interface GpsOptions {
  /** Allow slow fixes — rural devices can take a while. */
  timeoutMs?: number;
  /** Accept a cached fix at most this old (ms) before hitting hardware. */
  maximumAgeMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAXIMUM_AGE_MS = 5 * 60_000;
const CACHE_KEY = "mausam-sense:gps:last-fix:v1";

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/**
 * Geolocation is blocked on insecure origins (except localhost).
 * https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
 */
export function isSecureContextOk(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof window.isSecureContext === "boolean") {
    if (window.isSecureContext) return true;
    const host = window.location?.hostname ?? "";
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }
  return true;
}

/** Current permission state when the Permissions API is available. */
export async function getGpsPermissionState(): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unsupported";
  }
}

function mapPositionError(err: GeolocationPositionError | { code?: number; message?: string }): GpsError {
  switch (err.code) {
    case 1: // PERMISSION_DENIED
      return new GpsError(
        "PERMISSION_DENIED",
        "Location permission was denied. You can allow it in your browser's site settings, or search for a city / enter coordinates instead.",
      );
    case 2: // POSITION_UNAVAILABLE
      return new GpsError(
        "POSITION_UNAVAILABLE",
        "Your device could not determine a position (GPS disabled or no satellite/network fix). Search for a city or enter coordinates instead.",
      );
    case 3: // TIMEOUT
      return new GpsError(
        "TIMEOUT",
        "Location request timed out. Move outdoors for a stronger GPS signal and try again, or search for a city.",
      );
    default:
      return new GpsError(
        "UNKNOWN",
        (err as { message?: string }).message ?? "Could not determine your location.",
      );
  }
}

/** Request a one-shot GPS fix. Call ONLY from a user gesture. */
export function requestGpsFix(options: GpsOptions = {}): Promise<GpsFix> {
  if (!isGeolocationSupported()) {
    return Promise.reject(
      new GpsError(
        "UNSUPPORTED",
        "This browser does not expose the Geolocation API. Search for a city or enter coordinates instead.",
      ),
    );
  }
  if (!isSecureContextOk()) {
    return Promise.reject(
      new GpsError(
        "INSECURE_CONTEXT",
        "Browsers only allow GPS on secure (HTTPS) pages — this page is not secure and is not localhost. Deploy with HTTPS (or run on localhost) to use GPS; city search still works.",
      ),
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumAge = options.maximumAgeMs ?? DEFAULT_MAXIMUM_AGE_MS;

  return new Promise<GpsFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const fix: GpsFix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters:
            typeof position.coords.accuracy === "number" && Number.isFinite(position.coords.accuracy)
              ? Math.round(position.coords.accuracy)
              : 0,
          timestamp: new Date(position.timestamp).toISOString(),
          source: "device",
        };
        writeCachedFix(fix);
        resolve(fix);
      },
      (error) => reject(mapPositionError(error)),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge,
      },
    );
  });
}

/** Last successful fix (if any), with its age in minutes. */
export function readCachedFix(): (GpsFix & { ageMinutes: number }) | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const fix = JSON.parse(raw) as GpsFix;
    if (typeof fix.latitude !== "number" || typeof fix.longitude !== "number") return null;
    const ageMs = Date.now() - Date.parse(fix.timestamp);
    return { ...fix, ageMinutes: Math.max(0, Math.round(ageMs / 60_000)) };
  } catch {
    return null;
  }
}

export function writeCachedFix(fix: GpsFix): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(fix));
  } catch {
    /* storage full/blocked — cache is optional */
  }
}

export function clearCachedFix(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
