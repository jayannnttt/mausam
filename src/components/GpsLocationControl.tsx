/**
 * GpsLocationControl — "Use my current location" button + fix summary.
 *
 * Behaviour (acceptance criteria from the spec):
 * - Requests permission ONLY on an explicit click (never on page load).
 * - Uses `enableHighAccuracy`, a 12 s timeout and a 5-minute cache.
 * - Shows coordinates + accuracy radius (metres) + fix age + resolved place.
 * - Handles denial, timeout, unavailable GPS and insecure (non-HTTPS) contexts
 *   with actionable messages; manual search stays available in all cases.
 * - Offers a refresh action without re-prompting unless permission allows it.
 */

import { useCallback, useEffect, useState } from "react";
import { Crosshair, Loader2, MapPin, RefreshCw, ShieldAlert } from "lucide-react";
import type { GeoLocation } from "../types/weather";
import {
  GpsError,
  getGpsPermissionState,
  isGeolocationSupported,
  isSecureContextOk,
  readCachedFix,
  requestGpsFix,
  type GpsFix,
} from "../services/gpsLocation";
import { deviceLocation, reverseGeocode } from "../services/reverseGeocoding";
import { describeError } from "../services/httpClient";
import { usePreferences } from "../state/preferencesContext";

export interface GpsSelection {
  location: GeoLocation;
  fix: GpsFix;
  /** Reverse-geocoding provider name, or null when resolution failed. */
  placeProvider: string | null;
}

function formatAge(timestamp: string): string {
  const minutes = Math.round((Date.now() - Date.parse(timestamp)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return "just now";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function GpsLocationControl({
  onPick,
  compact = false,
}: {
  onPick: (selection: GpsSelection) => void;
  compact?: boolean;
}) {
  const { t } = usePreferences();
  const [busy, setBusy] = useState<false | "locating" | "resolving">(false);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [permission, setPermission] = useState<PermissionState | "unsupported">("unsupported");

  useEffect(() => {
    setFix(readCachedFix());
    let cancelled = false;
    getGpsPermissionState().then((state) => {
      if (!cancelled) setPermission(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const supported = isGeolocationSupported();
  const secure = isSecureContextOk();

  const locate = useCallback(async () => {
    setError(null);
    setBusy("locating");
    try {
      const fresh = await requestGpsFix();
      setFix(fresh);
      setBusy("resolving");
      const place = await reverseGeocode(fresh.latitude, fresh.longitude);
      const location = deviceLocation(fresh, place);
      onPick({ location, fix: fresh, placeProvider: place?.provider ?? null });
      getGpsPermissionState().then(setPermission);
    } catch (e) {
      if (e instanceof GpsError) setError(e.message);
      else setError(`Could not determine your location: ${describeError(e)}`);
      getGpsPermissionState().then(setPermission);
    } finally {
      setBusy(false);
    }
  }, [onPick]);

  if (!supported) {
    return (
      <div className="rounded-lg border border-line bg-line-subtle/50 p-3 text-xs text-ink-600">
        GPS is unavailable: this browser exposes no Geolocation API. City search and manual
        coordinates remain available below.
      </div>
    );
  }

  if (!secure) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-weather-sunBorder bg-weather-sunSurface p-3 text-xs text-ink-800">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-weather-sun" aria-hidden="true" />
        <span>
          GPS requires a secure page (HTTPS) — this page is not secure and not localhost, so the
          browser will block the request. Search for a city or enter coordinates below; deploy
          with HTTPS to enable GPS.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <button
        type="button"
        className="btn btn-primary w-full text-xs"
        onClick={locate}
        disabled={busy !== false}
        aria-busy={busy !== false}
      >
        {busy === "locating" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Getting GPS fix…
          </>
        ) : busy === "resolving" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Resolving place name…
          </>
        ) : (
          <>
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            {fix ? (t.refreshMyCurrentLocation || "Refresh my current location") : (t.useMyCurrentLocation || "Use my current location")}
          </>
        )}
      </button>

      {fix && (
        <div className="mt-2 flex items-start justify-between gap-2 text-[11px] leading-relaxed text-ink-600">
          <span>
            <MapPin className="mr-1 inline h-3 w-3 text-pine" aria-hidden="true" />
            <span className="font-medium text-ink-900 tabular-nums">
              {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}
            </span>{" "}
            · ±{fix.accuracyMeters} m accuracy · {formatAge(fix.timestamp)}
          </span>
        </div>
      )}

      {permission === "denied" && (
        <p className="mt-2 text-[11px] leading-relaxed text-weather-alert">
          Location permission is currently denied for this site. Re-enable it in your browser&apos;s
          site settings, then press the button again — or use city search below.
        </p>
      )}
      {permission === "prompt" && !fix && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          Your browser will ask for location permission when you press the button. We never ask
          without your action.
        </p>
      )}

      {error && (
        <p className="mt-2 text-[11px] leading-relaxed text-weather-alert" role="alert">
          {error}
        </p>
      )}

      {!compact && (
        <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
          The exact coordinates are used for weather, rainfall prediction and verification (no
          snapping to a city centre). Your location is stored on this device only as your selected
          location and is sent only to the weather/ML providers that produce data for that point.
        </p>
      )}
    </div>
  );
}
