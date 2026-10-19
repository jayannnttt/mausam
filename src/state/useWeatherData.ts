/** Data-loading hook: fetches + refreshes the dataset for the selected location. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoLocation, WeatherDataset } from "../types/weather";
import { loadDataset } from "../services/dataOrchestrator";

export interface WeatherDataState {
  dataset: WeatherDataset | null;
  loading: boolean;
  /** Only set when the orchestrator itself threw (should be rare). */
  error: string | null;
  reload: () => void;
  lastLoadedKey: string | null;
}

export function useWeatherData(
  location: GeoLocation,
  dataMode: "auto" | "live" | "demo",
): WeatherDataState {
  const [dataset, setDataset] = useState<WeatherDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const lastLoadedKeyRef = useRef<string | null>(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDataset(location, { preferDemo: dataMode === "demo" })
      .then((ds) => {
        if (cancelled) return;
        setDataset(ds);
        lastLoadedKeyRef.current = `${location.id}:${dataMode}`;
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load weather data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // dataMode "live" and "auto" both fetch live first; orchestrator handles fallback.
  }, [location, dataMode, nonce]);

  return {
    dataset,
    loading,
    error,
    reload,
    lastLoadedKey: lastLoadedKeyRef.current,
  };
}
