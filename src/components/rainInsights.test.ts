/**
 * Rainfall-intelligence panel helper tests — chart/table data construction,
 * rolling error windows, skill headline honesty and date-range selection.
 */

import { describe, expect, it } from "vitest";
import type {
  DayPrediction,
  ModelMetricsResponse,
  SeriesRow,
  VerificationResult,
} from "../services/mlService";
import {
  buildBreakdownRows,
  buildComparisonRows,
  buildLeadRows,
  buildPredictionChartData,
  buildVerificationChartData,
  fmtMm,
  fmtPct,
  fmtSigned,
  rollingMean,
  shortDay,
  skillHeadline,
  verificationWindow,
} from "./rainInsights";

// --------------------------------------------------------------------------- #
// Formatting
// --------------------------------------------------------------------------- #

describe("formatters", () => {
  it("fmtMm handles null/undefined/NaN", () => {
    expect(fmtMm(null)).toBe("—");
    expect(fmtMm(undefined)).toBe("—");
    expect(fmtMm(NaN)).toBe("—");
    expect(fmtMm(12.34)).toBe("12.3 mm");
  });

  it("fmtPct converts fractions", () => {
    expect(fmtPct(0.856)).toBe("86%");
    expect(fmtPct(0.856, 1)).toBe("85.6%");
    expect(fmtPct(null)).toBe("—");
  });

  it("fmtSigned keeps the sign explicit", () => {
    expect(fmtSigned(1.5)).toBe("+1.50");
    expect(fmtSigned(-1.5)).toBe("-1.50");
    expect(fmtSigned(0)).toBe("0.00");
    expect(fmtSigned(null)).toBe("—");
  });

  it("shortDay parses an ISO date", () => {
    expect(shortDay("2026-10-21")).not.toBe("2026-10-21");
    expect(shortDay("garbage")).toBe("garbage");
  });
});

// --------------------------------------------------------------------------- #
// Prediction chart
// --------------------------------------------------------------------------- #

function day(patch: Partial<DayPrediction> = {}): DayPrediction {
  return {
    date: "2026-10-21",
    lead_days: 1,
    weekday: "Wed",
    model_available: true,
    probability_rain: 0.8,
    predicted_rain: true,
    amount_mm: 12.5,
    amount_interval_mm: [8, 17],
    nwp_forecast_mm: 20,
    climatology_mm: 7,
    climatology_prob: 0.3,
    ...patch,
  } as DayPrediction;
}

describe("buildPredictionChartData", () => {
  it("maps available model outputs including the interval", () => {
    const rows = buildPredictionChartData([day()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].mlMm).toBe(12.5);
    expect(rows[0].prob).toBe(0.8);
    expect(rows[0].intervalLo).toBe(8);
    expect(rows[0].intervalHi).toBe(17);
    expect(rows[0].nwpMm).toBe(20);
    expect(rows[0].climMm).toBe(7);
  });

  it("never renders ML values for an unavailable model (no fabrication)", () => {
    const rows = buildPredictionChartData([
      day({ model_available: false, amount_mm: 5, probability_rain: 0.4 } as Partial<DayPrediction>),
    ]);
    expect(rows[0].mlMm).toBeNull();
    expect(rows[0].prob).toBeNull();
    // NWP + climatology are real data and still shown.
    expect(rows[0].nwpMm).toBe(20);
    expect(rows[0].climMm).toBe(7);
  });
});

// --------------------------------------------------------------------------- #
// Verification chart
// --------------------------------------------------------------------------- #

function seriesRow(date: string, obs: number, nwp: number, ml: number | null): SeriesRow {
  return {
    date,
    observed_mm: obs,
    nwp_mm: nwp,
    ml_mm: ml,
    ml_prob: ml === null ? null : 0.6,
    clim_mm: 5,
    clim_prob: 0.3,
    season: "monsoon_jjas",
  };
}

describe("rollingMean", () => {
  it("is null until the window is filled", () => {
    expect(rollingMean([1, 2, 3], 3)).toEqual([null, null, 2]);
  });

  it("slides correctly after the window", () => {
    expect(rollingMean([3, 3, 6, 0], 3)).toEqual([null, null, 4, 3]);
  });

  it("handles window=1", () => {
    expect(rollingMean([1, 2], 1)).toEqual([1, 2]);
  });
});

describe("buildVerificationChartData", () => {
  const rows = [
    seriesRow("2026-07-01", 10, 8, 12),
    seriesRow("2026-07-02", 0, 2, 1),
    seriesRow("2026-07-03", 5, 4, null), // ML missing this day
  ];

  it("computes per-day absolute errors", () => {
    const out = buildVerificationChartData(rows);
    expect(out[0].nwpAe).toBe(2); // |8-10|
    expect(out[0].mlAe).toBe(2); // |12-10|
    expect(out[1].mlAe).toBe(1);
  });

  it("null ML days produce null ML error and rolling", () => {
    const out = buildVerificationChartData(rows);
    expect(out[2].ml).toBeNull();
    expect(out[2].mlAe).toBeNull();
    expect(out[2].mlRolling).toBeNull();
    // NWP rolling is deliberately suppressed where ML is missing so both lines
    // share the same x-positions in the chart.
    expect(out[2].nwpRolling).toBeNull();
  });

  it("tail limits rows to the most recent days", () => {
    expect(buildVerificationChartData(rows, { tail: 2 })).toHaveLength(2);
    expect(buildVerificationChartData(rows, { tail: 2 })[0].date).toBe("2026-07-02");
  });
});

// --------------------------------------------------------------------------- #
// Comparison table
// --------------------------------------------------------------------------- #

function verification(patch: Partial<VerificationResult> = {}): VerificationResult {
  return {
    lead_days: 3,
    window: {
      start: "2026-01-01",
      end: "2026-03-31",
      role: "test",
      independent_test: true,
      train_end: "2025-06-30",
      val_end: "2025-12-31",
      note: "independent",
    },
    scores: {
      ml: {
        available: true,
        n: 100,
        amount: { mae: 2, rmse: 4, bias: -1 } as never,
        occurrence: { precision: 0.8, recall: 0.7, f1: 0.75, brier: 0.1 } as never,
      },
      nwp_raw: { available: true, n: 100, amount: { mae: 2.5 } as never, occurrence: {} as never },
      climatology: { available: true, n: 100 } as never,
      imd: { available: false, reason: "No IMD API key configured (IMD_API_KEY)." } as never,
    },
    skill: { mae_skill_vs_nwp: 0.2 },
    series: [],
    generated_at: "2026-10-20T00:00:00Z",
    ...patch,
  };
}

describe("buildComparisonRows", () => {
  it("returns one row per source with real values", () => {
    const rows = buildComparisonRows(verification());
    expect(rows.map((r) => r.source)).toEqual(["ml", "nwp_raw", "climatology", "imd"]);
    const ml = rows[0];
    expect(ml.available).toBe(true);
    expect(ml.mae).toBe(2);
    expect(ml.f1).toBe(0.75);
    expect(ml.brier).toBe(0.1);
  });

  it("keeps the IMD unavailability reason verbatim (never invented)", () => {
    const imd = buildComparisonRows(verification()).find((r) => r.source === "imd")!;
    expect(imd.available).toBe(false);
    expect(imd.mae).toBeNull();
    expect(imd.unavailableReason).toContain("No IMD API key configured (IMD_API_KEY).");
  });

  it("handles a missing block without throwing", () => {
    const rows = buildComparisonRows(verification({ scores: {} }));
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.available === false)).toBe(true);
  });
});

describe("buildBreakdownRows", () => {
  it("maps season blocks to table rows", () => {
    const rows = buildBreakdownRows({
      monsoon_jjas: {
        available: true,
        n: 90,
        amount: { mae: 3, bias: -0.5 } as never,
        nwp_amount: { mae: 4 } as never,
        occurrence: { f1: 0.8 } as never,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].group).toBe("monsoon_jjas");
    expect(rows[0].mlMae).toBe(3);
    expect(rows[0].nwpMae).toBe(4);
    expect(rows[0].mlF1).toBe(0.8);
    expect(rows[0].mlBias).toBe(-0.5);
  });

  it("returns [] when undefined", () => {
    expect(buildBreakdownRows(undefined)).toEqual([]);
  });
});

// --------------------------------------------------------------------------- #
// Lead table (metrics endpoint)
// --------------------------------------------------------------------------- #

describe("buildLeadRows", () => {
  it("computes skill vs NWP and sorts by lead", () => {
    const metrics = {
      generated_at: "x",
      notes: [],
      summary_by_lead: {
        "7": { ml_mae: 3.0, nwp_mae: 4.0, climatology_mae: 5, ml_f1: 0.8, nwp_f1: 0.7, climatology_f1: 0.6, ml_brier: 0.1, climatology_brier: 0.2 },
        "1": { ml_mae: 2.0, nwp_mae: 2.5, climatology_mae: 4, ml_f1: 0.9, nwp_f1: 0.85, climatology_f1: 0.7, ml_brier: 0.05, climatology_brier: 0.15, ml_interval_coverage: 0.9 },
      },
      per_lead: {},
    } as unknown as ModelMetricsResponse;

    const rows = buildLeadRows(metrics);
    expect(rows.map((r) => r.lead)).toEqual([1, 7]);
    expect(rows[0].skillVsNwp).toBeCloseTo(1 - 2.0 / 2.5);
    expect(rows[0].coverage).toBe(0.9);
    expect(rows[1].coverage).toBeNull();
  });

  it("skill is null when NWP MAE is zero (no division by zero)", () => {
    const metrics = {
      generated_at: "x",
      notes: [],
      summary_by_lead: {
        "1": { ml_mae: 1, nwp_mae: 0, climatology_mae: 1, ml_f1: 1, nwp_f1: 1, climatology_f1: 1, ml_brier: 0, climatology_brier: 0 },
      },
      per_lead: {},
    } as unknown as ModelMetricsResponse;
    expect(buildLeadRows(metrics)[0].skillVsNwp).toBeNull();
  });
});

// --------------------------------------------------------------------------- #
// Skill headline honesty
// --------------------------------------------------------------------------- #

describe("skillHeadline", () => {
  it("claims improvement only for positive skill", () => {
    const out = skillHeadline(verification({ skill: { mae_skill_vs_nwp: 0.123 } }));
    expect(out.beatsNwp).toBe(true);
    expect(out.text).toContain("12.3% lower");
    expect(out.text).toContain("identical rows");
  });

  it("explicitly says no improvement when skill is negative", () => {
    const out = skillHeadline(verification({ skill: { mae_skill_vs_nwp: -0.05 } }));
    expect(out.beatsNwp).toBe(false);
    expect(out.text).toContain("higher");
    expect(out.text).toContain("no improvement demonstrated");
  });

  it("refuses to compare when skill is missing or NaN", () => {
    expect(skillHeadline(verification({ skill: {} })).beatsNwp).toBeNull();
    expect(
      skillHeadline(verification({ skill: { mae_skill_vs_nwp: NaN } })).beatsNwp,
    ).toBeNull();
  });

  it("reports a tie as neutral", () => {
    const out = skillHeadline(verification({ skill: { mae_skill_vs_nwp: 0 } }));
    expect(out.beatsNwp).toBeNull();
    expect(out.text).toContain("identical MAE");
  });
});

// --------------------------------------------------------------------------- #
// Verification window
// --------------------------------------------------------------------------- #

describe("verificationWindow", () => {
  const today = new Date("2026-10-20T00:00:00Z");

  it("pulls the end date back by the observation lag", () => {
    const w = verificationWindow("30", undefined, undefined, today);
    expect(w.end).toBe("2026-10-17"); // 3 days back
    expect(w.clamped).toBe(false);
  });

  it("presets produce the requested span", () => {
    const w = verificationWindow("90", undefined, undefined, today);
    const days = (Date.parse(w.end) - Date.parse(w.start)) / 86_400_000 + 1;
    expect(days).toBe(90);
  });

  it("never goes before the forecast archive start", () => {
    const w = verificationWindow("3650", undefined, undefined, today);
    expect(w.start >= "2024-01-08").toBe(true);
    expect(w.clamped).toBe(true);
  });

  it("custom ranges are clamped and never inverted", () => {
    const w = verificationWindow("custom", "2024-02-01", "2026-12-31", today);
    expect(w.end).toBe("2026-10-17"); // future end clamped to obs lag
    expect(w.clamped).toBe(true);

    const inverted = verificationWindow("custom", "2026-05-01", "2026-01-01", today);
    expect(inverted.start <= inverted.end).toBe(true);
    expect(inverted.clamped).toBe(true);
  });

  it("rejects custom starts before the archive", () => {
    const w = verificationWindow("custom", "2020-01-01", "2026-01-01", today);
    expect(w.start).toBe("2024-01-08");
    expect(w.clamped).toBe(true);
  });
});
