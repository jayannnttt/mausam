/**
 * LocationSelector — city search (Open-Meteo geocoding), manual coordinate
 * entry, and quick access to saved + demo locations.
 */

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, Loader2, Plus, Navigation, Database } from "lucide-react";
import type { GeoLocation } from "../types/weather";
import { searchLocations, manualLocation } from "../services/geocodingService";
import { DEMO_LOCATIONS } from "../services/demoDataService";
import { describeError } from "../services/httpClient";

export function LocationSearchResults({
  query,
  onPick,
}: {
  query: string;
  onPick: (loc: GeoLocation) => void;
}) {
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    setError(null);
    const timer = setTimeout(() => {
      searchLocations(q)
        .then((locs) => {
          if (id !== reqId.current) return;
          setResults(locs);
        })
        .catch((e) => {
          if (id !== reqId.current) return;
          setError(describeError(e));
          setResults([]);
        })
        .finally(() => {
          if (id === reqId.current) setSearching(false);
        });
    }, 350); // debounce
    return () => clearTimeout(timer);
  }, [query]);

  if (query.trim().length < 2) return null;

  return (
    <div className="mt-2">
      {searching && (
        <p className="flex items-center gap-2 py-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…
        </p>
      )}
      {error && (
        <p className="py-2 text-sm text-amber-300">
          Search unavailable: {error}. You can still enter coordinates manually below or pick a
          demo city.
        </p>
      )}
      {!searching && !error && query.trim().length >= 2 && results.length === 0 && (
        <p className="py-2 text-sm text-slate-400">No places found. Try a different spelling.</p>
      )}
      <ul className="max-h-64 divide-y divide-navy-700/50 overflow-y-auto rounded-lg border border-navy-700/60">
        {results.map((loc) => (
          <li key={loc.id}>
            <button
              type="button"
              onClick={() => onPick(loc)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-navy-800"
            >
              <MapPin className="h-4 w-4 shrink-0 text-sky-450" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-100">
                  {loc.name}
                  {loc.admin1 ? `, ${loc.admin1}` : ""}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {loc.country}
                  {loc.population ? ` · pop. ${loc.population.toLocaleString("en-IN")}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ManualLocationForm({ onPick }: { onPick: (loc: GeoLocation) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      setErr("Enter a latitude between −90 and 90 and a longitude between −180 and 180.");
      return;
    }
    setErr(null);
    onPick(manualLocation(name || "Custom location", la, lo));
  };

  if (!open) {
    return (
      <button type="button" className="btn mt-2 w-full" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Enter coordinates manually
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-navy-700/60 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="label-caps">Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My village"
            className="mt-1 w-full rounded-lg border border-navy-600 bg-navy-850 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-caps">Latitude</span>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
            placeholder="10.79"
            className="mt-1 w-full rounded-lg border border-navy-600 bg-navy-850 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-caps">Longitude</span>
          <input
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            inputMode="decimal"
            placeholder="79.14"
            className="mt-1 w-full rounded-lg border border-navy-600 bg-navy-850 px-2.5 py-1.5 text-sm"
          />
        </label>
      </div>
      {err && <p className="mt-2 text-xs text-amber-300">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-primary flex-1" onClick={submit}>
          Use this location
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function DemoCityButtons({ onPick }: { onPick: (loc: GeoLocation) => void }) {
  return (
    <div className="mt-3">
      <p className="label-caps">Demo cities (offline fixtures)</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {DEMO_LOCATIONS.map((loc) => (
          <button
            key={loc.id}
            type="button"
            className="chip hover:border-amber-450"
            onClick={() => onPick(loc)}
            title="Load synthetic demonstration data for this city"
          >
            <Database className="h-3 w-3 text-amber-450" aria-hidden="true" />
            {loc.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compact combobox used in the dashboard header. */
export function LocationSelector({
  locations,
  selected,
  onSelect,
  onSaveNew,
}: {
  locations: GeoLocation[];
  selected: GeoLocation;
  onSelect: (loc: GeoLocation) => void;
  onSaveNew: (loc: GeoLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-navy-600 bg-navy-800 px-2.5 py-1.5 text-sm font-medium hover:border-sky-450"
      >
        <MapPin className="h-4 w-4 text-sky-450" aria-hidden="true" />
        <span className="max-w-[10rem] truncate sm:max-w-none">{selected.name}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Change location"
          className="card absolute right-0 z-40 mt-2 w-80 p-3 sm:left-0 sm:right-auto"
        >
          <label className="block">
            <span className="label-caps">Search city</span>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chennai, Nagpur, …"
                className="w-full rounded-lg border border-navy-600 bg-navy-850 py-1.5 pl-8 pr-2.5 text-sm"
              />
            </div>
          </label>
          <LocationSearchResults
            query={query}
            onPick={(loc) => {
              onSaveNew(loc);
              setOpen(false);
              setQuery("");
            }}
          />
          {locations.length > 0 && (
            <div className="mt-3">
              <p className="label-caps">Recent locations</p>
              <ul className="mt-1 space-y-1">
                {locations.slice(0, 5).map((loc) => (
                  <li key={loc.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(loc);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-navy-800 ${
                        loc.id === selected.id ? "text-sky-350" : "text-slate-200"
                      }`}
                    >
                      <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {loc.name}
                        {loc.admin1 ? `, ${loc.admin1}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DemoCityButtons
            onPick={(loc) => {
              onSaveNew(loc);
              setOpen(false);
              setQuery("");
            }}
          />
          <ManualLocationForm
            onPick={(loc) => {
              onSaveNew(loc);
              setOpen(false);
              setQuery("");
            }}
          />
        </div>
      )}
    </div>
  );
}
