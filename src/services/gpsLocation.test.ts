/**
 * GPS location tests: typed error mapping, privacy rules (never requested
 * without a user gesture — enforced by only exposing `requestGpsFix`), and
 * the secure-context / unsupported guards.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GpsError,
  clearCachedFix,
  isGeolocationSupported,
  readCachedFix,
  requestGpsFix,
  writeCachedFix,
} from "./gpsLocation";

type GeolocateSuccess = (pos: unknown) => void;
type GeolocateFailure = (err: unknown) => void;

interface GeolocateOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

function installGeolocation(
  impl: (
    success: GeolocateSuccess,
    failure: GeolocateFailure,
    options: GeolocateOptions,
  ) => void,
) {
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition: impl },
    permissions: { query: async () => ({ state: "prompt" }) },
  });
}

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  vi.stubGlobal("window", {
    isSecureContext: true,
    location: { hostname: "example.test" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("support guards", () => {
  it("rejects when the Geolocation API is absent", async () => {
    vi.stubGlobal("navigator", {});
    expect(isGeolocationSupported()).toBe(false);
    await expect(requestGpsFix()).rejects.toBeInstanceOf(GpsError);
    await requestGpsFix().catch((e: GpsError) => expect(e.code).toBe("UNSUPPORTED"));
  });

  it("rejects on insecure contexts (non-localhost)", async () => {
    vi.stubGlobal("window", {
      isSecureContext: false,
      location: { hostname: "example.test" },
    });
    installGeolocation(() => {
      throw new Error("must never be called on insecure context");
    });
    await requestGpsFix().catch((e: GpsError) => {
      expect(e.code).toBe("INSECURE_CONTEXT");
      expect(e.message).toContain("HTTPS");
    });
  });

  it("allows localhost even when window.isSecureContext is unavailable", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    installGeolocation((success) =>
      success({
        coords: { latitude: 13.1, longitude: 80.3, accuracy: 12.4 },
        timestamp: Date.now(),
      }),
    );
    const fix = await requestGpsFix();
    expect(fix.latitude).toBeCloseTo(13.1);
    expect(fix.source).toBe("device");
  });
});

describe("successful fixes", () => {
  it("rounds accuracy and ISO-formats the timestamp", async () => {
    const now = Date.now();
    installGeolocation((success) =>
      success({ coords: { latitude: 1, longitude: 2, accuracy: 8.6 }, timestamp: now }),
    );
    const fix = await requestGpsFix({ timeoutMs: 5000, maximumAgeMs: 0 });
    expect(fix.accuracyMeters).toBe(9); // rounded
    expect(fix.timestamp).toBe(new Date(now).toISOString());
    expect(readCachedFix()).not.toBeNull();
  });

  it("requests high accuracy with our timeout", async () => {
    let seen: GeolocateOptions | null = null;
    installGeolocation((success, _failure, options) => {
      seen = options;
      success({ coords: { latitude: 0, longitude: 0, accuracy: 5 }, timestamp: Date.now() });
    });
    await requestGpsFix({ timeoutMs: 7000, maximumAgeMs: 1000 });
    expect(seen).not.toBeNull();
    expect(seen!.enableHighAccuracy).toBe(true);
    expect(seen!.timeout).toBe(7000);
    expect(seen!.maximumAge).toBe(1000);
  });

  it("handles missing accuracy gracefully (falls back to 0)", async () => {
    installGeolocation((success) =>
      success({ coords: { latitude: 5, longitude: 6 }, timestamp: Date.now() }),
    );
    const fix = await requestGpsFix();
    expect(fix.accuracyMeters).toBe(0);
  });
});

describe("error mapping", () => {
  const cases: Array<[number, string, RegExp]> = [
    [1, "PERMISSION_DENIED", /permission was denied/i],
    [2, "POSITION_UNAVAILABLE", /could not determine a position/i],
    [3, "TIMEOUT", /timed out/i],
  ];

  for (const [code, expected, pattern] of cases) {
    it(`maps geolocation code ${code} → ${expected}`, async () => {
      installGeolocation((_success, failure) => failure({ code, message: "x" }));
      await requestGpsFix().catch((e: GpsError) => {
        expect(e).toBeInstanceOf(GpsError);
        expect(e.code).toBe(expected);
        expect(e.message).toMatch(pattern);
        // Every error message must offer the manual fallback.
        expect(e.message).toMatch(/search for a city/i);
      });
    });
  }

  it("maps unknown errors with their message", async () => {
    installGeolocation((_success, failure) => failure({ code: 99, message: "weird" }));
    await requestGpsFix().catch((e: GpsError) => {
      expect(e.code).toBe("UNKNOWN");
      expect(e.message).toBe("weird");
    });
  });
});

describe("cache", () => {
  it("round-trips a fix with age", () => {
    writeCachedFix({
      latitude: 13,
      longitude: 80,
      accuracyMeters: 10,
      timestamp: new Date(Date.now() - 120_000).toISOString(),
      source: "device",
    });
    const cached = readCachedFix();
    expect(cached).not.toBeNull();
    expect(cached!.ageMinutes).toBeGreaterThanOrEqual(1);
    expect(cached!.latitude).toBe(13);
  });

  it("ignores corrupt cache entries", () => {
    store.set("mausam-sense:gps:last-fix:v1", "{not json");
    expect(readCachedFix()).toBeNull();
    store.set("mausam-sense:gps:last-fix:v1", JSON.stringify({ latitude: "x" }));
    expect(readCachedFix()).toBeNull();
  });

  it("clearCachedFix removes the entry", () => {
    writeCachedFix({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 3,
      timestamp: new Date().toISOString(),
      source: "device",
    });
    clearCachedFix();
    expect(readCachedFix()).toBeNull();
  });
});
