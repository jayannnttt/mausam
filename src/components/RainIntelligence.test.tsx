/**
 * Rainfall-intelligence presentational components — render to string with
 * fixture payloads to catch runtime errors and verify honest labelling
 * (IMD unavailability, provenance, "no model" states).
 */

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { DayPrediction, SourcesResponse } from "../services/mlService";
import type { ComparisonRow, BreakdownRow, LeadRow, VerificationChartData } from "./rainInsights";
import {
  BreakdownTable,
  ComparisonTable,
  ErrorTrendChart,
  LeadTable,
  LocationTransparency,
  ObservedVsPredictedChart,
  PredictionChart,
  PredictionTable,
} from "./RainIntelligence";

// localStorage stub (LocationTransparency reads the GPS cache).
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

/**
 * renderToString inserts `<!-- -->` comment markers between adjacent text
 * nodes (e.g. `{toFixed(5)}, {toFixed(5)}`); strip them so `toContain`
 * assertions see the strings a user would actually read.
 */
const render = (node: React.ReactElement) => renderToString(node).replace(/<!-- -->/g, "");

function day(patch: Partial<DayPrediction> = {}): DayPrediction {
  return {
    date: "2026-10-21",
    lead_days: 1,
    weekday: "Wed",
    model_available: true,
    probability_rain: 0.82,
    predicted_rain: true,
    amount_mm: 13.9,
    amount_interval_mm: [10, 17],
    nwp_forecast_mm: 28.8,
    climatology_mm: 7.2,
    climatology_prob: 0.31,
    ...patch,
  };
}

describe("PredictionTable", () => {
  it("renders probability, amount with interval, NWP and climatology", () => {
    const html = render(<PredictionTable days={[day()]} />);
    expect(html).toContain("Rain probability");
    expect(html).toContain("82%");
    expect(html).toContain("13.9 mm");
    expect(html).toContain("28.8 mm");
    expect(html).toContain("7.2 mm");
    expect(html).toContain("10 mm–17 mm"); // interval shown
    expect(html).toContain("1d"); // lead column
  });

  it("shows 'no model' instead of fabricating values", () => {
    const html = render(
      <PredictionTable days={[day({ model_available: false, reason: "no trained lead" })]} />,
    );
    expect(html).toContain("no model");
    expect(html).not.toContain("13.9 mm"); // ML amount must not appear
    // NWP + climatology remain (real data).
    expect(html).toContain("28.8 mm");
  });
});

describe("ComparisonTable", () => {
  const rows: ComparisonRow[] = [
    {
      source: "ml",
      kind: "Mausam Sense ML model",
      available: true,
      mae: 2.36,
      rmse: 5.1,
      bias: -1.05,
      precision: 0.9,
      recall: 0.82,
      f1: 0.856,
      brier: 0.096,
      n: 1758,
    },
    {
      source: "imd",
      kind: "IMD official forecast",
      available: false,
      unavailableReason: "No IMD API key configured (IMD_API_KEY).",
      mae: null,
      rmse: null,
      bias: null,
      precision: null,
      recall: null,
      f1: null,
      brier: null,
      n: null,
    },
  ];

  it("renders metric values with bias direction", () => {
    const html = render(<ComparisonTable rows={rows} />);
    expect(html).toContain("ML model");
    expect(html).toContain("2.36");
    expect(html).toContain("-1.05");
    expect(html).toContain("90%"); // precision via fmtPct
    expect(html).toContain("0.86"); // F1 via toFixed(2)
    expect(html).toContain("Underprediction on average"); // bias title
    expect(html).toContain("1758");
  });

  it("renders the IMD unavailability reason verbatim in one cell", () => {
    const html = render(<ComparisonTable rows={rows} />);
    expect(html).toContain("No IMD API key configured (IMD_API_KEY).");
    expect(html).toContain('colSpan="8"'); // reason spans the metric columns
  });

  it("renders every source label from SOURCE_KINDS wording", () => {
    const html = render(
      <ComparisonTable
        rows={[
          { source: "nwp_raw", kind: "Global NWP forecast (Open-Meteo archive)", available: true, mae: 1, rmse: 2, bias: 0, precision: null, recall: null, f1: null, brier: null, n: 10 },
          { source: "climatology", kind: "Day-of-year climatology baseline", available: true, mae: 3, rmse: 4, bias: 0, precision: null, recall: null, f1: null, brier: null, n: 10 },
        ]}
      />,
    );
    expect(html).toContain("NWP forecast");
    expect(html).toContain("Climatology");
    expect(html).toContain("Open-Meteo archive");
  });
});

describe("BreakdownTable", () => {
  it("renders group rows and skips empties", () => {
    const rows: BreakdownRow[] = [
      { group: "monsoon_jjas", n: 92, mlMae: 5.5, nwpMae: 6.1, mlF1: 0.84, nwpF1: null, mlBias: -1.2 },
    ];
    const html = render(<BreakdownTable title="By season" rows={rows} />);
    expect(html).toContain("By season");
    expect(html).toContain("monsoon jjas"); // underscores → spaces
    expect(html).toContain("5.50");
    expect(html).toContain("6.10");
    expect(html).toContain("-1.20");
    expect(render(<BreakdownTable title="empty" rows={[]} />)).toBe("");
  });
});

describe("LeadTable", () => {
  it("renders per-lead metrics with skill colouring text", () => {
    const rows: LeadRow[] = [
      { lead: 1, mlMae: 2.364, nwpMae: 2.556, climMae: 3.794, skillVsNwp: 0.075, mlF1: 0.856, nwpF1: 0.85, mlBrier: 0.096, climBrier: 0.13, coverage: 0.9 },
      { lead: 7, mlMae: 3.176, nwpMae: 3.292, climMae: 3.794, skillVsNwp: 0.035, mlF1: 0.805, nwpF1: 0.779, mlBrier: 0.127, climBrier: 0.13, coverage: 0.89 },
    ];
    const html = render(<LeadTable rows={rows} />);
    expect(html).toContain("7.5%"); // skill vs NWP
    expect(html).toContain("2.36");
    expect(html).toContain("90%"); // coverage via fmtPct
    expect(render(<LeadTable rows={[]} />)).toBe("");
  });
});

describe("charts", () => {
  const chartRows: VerificationChartData[] = [
    { label: "Wed 1", date: "2026-07-01", observed: 10, nwp: 8, ml: 12, clim: 5, nwpAe: 2, mlAe: 2, nwpRolling: null, mlRolling: null },
    { label: "Thu 2", date: "2026-07-02", observed: 0, nwp: 2, ml: 1, clim: 5, nwpAe: 2, mlAe: 1, nwpRolling: 2, mlRolling: 1.5 },
  ];

  it("renders without crashing (recharts SSR)", () => {
    expect(() =>
      render(
        <>
          <PredictionChart
            data={[
              { label: "a", date: "2026-10-21", lead: 1, mlMm: 10, nwpMm: 12, climMm: 5, prob: 0.5 },
            ]}
          />
          <ObservedVsPredictedChart data={chartRows} />
          <ErrorTrendChart data={chartRows} />
        </>,
      ),
    ).not.toThrow();
  });
});

describe("LocationTransparency", () => {
  const location = {
    id: "gps_13.083_80.271",
    name: "Chennai, Tamil Nadu",
    latitude: 13.0827,
    longitude: 80.2707,
    source: "device" as const,
    admin1: "Tamil Nadu",
    admin2: "Chennai",
  };

  it("shows exact coordinates and the device source", () => {
    const html = render(
      <LocationTransparency location={location as never} predict={null} sources={null} health={null} />,
    );
    expect(html).toContain("13.08270, 80.27070");
    expect(html).toContain("Device GPS");
    expect(html).toContain("Chennai");
    expect(html).toContain("~25 km grid"); // default resolution disclosure
  });

  it("labels demo fixtures distinctly", () => {
    const html = render(
      <LocationTransparency
        location={{ ...location, source: "demo-fixture" } as never}
        predict={null}
        sources={null}
        health={null}
      />,
    );
    expect(html).toContain("Demo fixture");
    expect(html).not.toContain("Device GPS");
  });

  it("discloses IMD key state honestly", () => {
    const sources = {
      service: "x",
      retrieved_at: "now",
      sources: [
        {
          key: "imd",
          name: "India Meteorological Department (IMD) public API",
          detail: "No key configured — IMD comparisons reported unavailable.",
          url: "https://api.imd.gov.in/",
          status: "unavailable" as const,
        },
      ],
      disclosures: [],
    } as unknown as SourcesResponse;

    const html = render(
      <LocationTransparency
        location={location as never}
        predict={null}
        sources={sources}
        health={{ status: "ok", service: "mausam-sense-ml", version: "1.0.0", model_ready: true, imd_configured: false, checked_at: "now" } as never}
      />,
    );
    expect(html).toContain("No API key — reported unavailable, never invented");
    expect(html).toContain("IMD comparisons reported unavailable.");
  });
});
