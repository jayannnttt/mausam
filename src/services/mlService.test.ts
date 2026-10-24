/**
 * ML service client tests: URL construction, status → error-kind mapping and
 * the honest "backend unreachable" messaging.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ML_API_BASE,
  MlApiError,
  describeMlError,
  fetchHealth,
  predictRainfall,
} from "./mlService";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ML_API_BASE", () => {
  it("strips trailing slashes", () => {
    expect(ML_API_BASE).not.toMatch(/\/$/);
    expect(ML_API_BASE.length).toBeGreaterThan(0);
  });
});

describe("request URL building", () => {
  it("predict sends coordinates and days", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ days: [] }));
    await predictRainfall({ latitude: 13.08, longitude: 80.27, days: 3 });
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/predict");
    // Coordinates are serialised to fixed precision — compare numerically so
    // the assertion does not depend on float formatting.
    expect(Number(parsed.searchParams.get("latitude"))).toBeCloseTo(13.08, 5);
    expect(Number(parsed.searchParams.get("longitude"))).toBeCloseTo(80.27, 5);
    expect(parsed.searchParams.get("days")).toBe("3");
    expect(init.headers.Accept).toBe("application/json");
  });

  it("health hits the prefixed route", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));
    await fetchHealth();
    expect(fetchMock.mock.calls[0][0]).toBe(`${ML_API_BASE}/api/v1/health`);
  });

  it("forwards caller cancellation to the fetch signal", async () => {
    let sent: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init: RequestInit) => {
      sent = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });
    const ac = new AbortController();
    const pending = fetchHealth(ac.signal);
    await new Promise((r) => setTimeout(r, 0));
    // The client wraps the caller's signal with its own timeout controller,
    // so identity differs — assert the wiring while the request is in flight.
    expect(sent).toBeInstanceOf(AbortSignal);
    expect(sent?.aborted).toBe(false);
    ac.abort();
    expect(sent?.aborted).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(MlApiError);
  });
});

describe("error mapping", () => {
  it("503 → model_missing with train hint", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "No trained model artifacts found on the server." }, 503),
    );
    await expect(fetchHealth()).rejects.toBeInstanceOf(MlApiError);
    try {
      await fetchHealth();
    } catch (e) {
      expect((e as MlApiError).kind).toBe("model_missing");
      const msg = describeMlError(e);
      expect(msg).toContain("python -m ml.train");
      expect(msg).toContain("No trained model");
    }
  });

  it("502 → upstream", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Upstream weather provider error" }, 502));
    try {
      await fetchHealth();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MlApiError).kind).toBe("upstream");
      expect(describeMlError(e)).toContain("weather data provider");
    }
  });

  it("422 → bad_request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "end must not be before start" }, 422));
    try {
      await fetchHealth();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MlApiError).kind).toBe("bad_request");
      expect(describeMlError(e)).toContain("end must not be before start");
    }
  });

  it("500 → generic http kind", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "boom" }, 500));
    try {
      await fetchHealth();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MlApiError).kind).toBe("http");
    }
  });

  it("network failure → unreachable with actionable start-up guidance", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    try {
      await fetchHealth();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MlApiError).kind).toBe("unreachable");
      const msg = describeMlError(e);
      expect(msg).toContain(ML_API_BASE);
      expect(msg).toContain("uvicorn app.main:app");
    }
  });

  it("timeout → timeout kind", async () => {
    fetchMock.mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });
    try {
      await fetchHealth();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MlApiError).kind).toBe("timeout");
      expect(describeMlError(e)).toContain("did not respond in time");
    }
    // fetchHealth's internal timeout is 8s — exceed the default test timeout.
  }, 20_000);

  it("non-string detail (validation array) is stringified, not dropped", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: [{ msg: "field required", loc: ["query", "latitude"] }] }, 422),
    );
    try {
      await fetchHealth();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as MlApiError).message).toContain("field required");
    }
  });
});

describe("describeMlError fallbacks", () => {
  it("plain Error passes its message through", () => {
    expect(describeMlError(new Error("plain"))).toBe("plain");
  });

  it("non-Error values get a generic message", () => {
    expect(describeMlError(42)).toContain("Unexpected error");
  });
});
