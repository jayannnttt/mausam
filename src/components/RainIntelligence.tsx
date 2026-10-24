/**
 * RainIntelligence — the SIH 2026 section: ML rainfall prediction +
 * forecast verification against observed rainfall.
 *
 * Design rules honoured here:
 * - Every number comes from the ML backend (real model artifacts, real
 *   archives). Nothing is estimated client-side; unavailable data shows an
 *   explicit state with the reason.
 * - Sources are visually separated and labelled: ML model / global NWP
 *   forecast / climatology / IMD official forecast / reanalysis observation.
 * - "Improvement" claims are only rendered when the backend's identical-row
 *   evaluation demonstrates them for the selected window.
 * - Location transparency: coordinates, GPS accuracy, resolved place, grid
 *   resolution, provider and timestamps.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CalendarRange,
  CheckCircle2,
  Database,
  Info,
  MapPin,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DataMode, GeoLocation } from "../types/weather";
import {
  describeMlError,
  fetchHealth,
  fetchModelMetrics,
  fetchSources,
  fetchTrainingLocations,
  fetchVerification,
  predictRainfall,
  ML_API_BASE,
  type DayPrediction,
  type MlHealth,
  type ModelMetricsResponse,
  type PredictResponse,
  type SeriesRow,
  type SourcesResponse,
  type VerificationResult,
} from "../services/mlService";
import { readCachedFix } from "../services/gpsLocation";
import { Card, CardHeader, EmptyState, ErrorState, SkeletonCard } from "./ui/primitives";
import {
  buildBreakdownRows,
  buildComparisonRows,
  buildLeadRows,
  buildPredictionChartData,
  buildVerificationChartData,
  fmtIsoDateTime,
  fmtMm,
  fmtPct,
  fmtSigned,
  skillHeadline,
  verificationWindow,
  type BreakdownRow,
  type ComparisonRow,
  type LeadRow,
  type RangePreset,
} from "./rainInsights";

const AXIS = { fill: "#68747A", fontSize: 10 };
const GRID = "#DEE2DD";
const C_ML = "#35665F";
const C_NWP = "#D9A441";
const C_OBS = "#18252B";
const C_CLIM = "#68747A";
const C_PROB = "#4277AA";

const DEFAULT_TRAINING_IDS = [
  "chennai",
  "mumbai",
  "delhi",
  "nagpur",
  "bengaluru",
  "kolkata",
];

type BackendState = "checking" | "ready" | "model_missing" | "unreachable";

// --------------------------------------------------------------------------- #
// Presentational pieces (exported for unit tests)
// --------------------------------------------------------------------------- #

export function PredictionTable({ days }: { days: DayPrediction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-400">
            <th className="py-2 pr-2 font-semibold">Day</th>
            <th className="py-2 pr-2 font-semibold">Lead</th>
            <th className="py-2 pr-2 font-semibold">Rain probability</th>
            <th className="py-2 pr-2 font-semibold">ML rainfall</th>
            <th className="py-2 pr-2 font-semibold">NWP forecast</th>
            <th className="py-2 pr-2 font-semibold">Climatology</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} className="border-b border-line/60 align-top">
              <td className="py-2 pr-2 font-medium text-ink-900">
                {d.weekday ? `${d.weekday} ` : ""}
                {d.date.slice(5)}
              </td>
              <td className="py-2 pr-2 text-ink-500 tabular-nums">{d.lead_days}d</td>
              <td className="py-2 pr-2">
                {d.model_available && d.probability_rain !== undefined ? (
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full border border-line bg-paper-light">
                      <span
                        className={`block h-full rounded-full ${
                          d.predicted_rain ? "bg-pine-600" : "bg-weather-rain"
                        }`}
                        style={{ width: `${Math.max(2, Math.round(d.probability_rain * 100))}%` }}
                      />
                    </span>
                    <span className="tabular-nums text-ink-700">
                      {fmtPct(d.probability_rain)}
                    </span>
                  </span>
                ) : (
                  <span className="text-ink-400" title={d.reason}>
                    —
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 tabular-nums text-ink-900 font-medium">
                {d.model_available ? (
                  <>
                    {fmtMm(d.amount_mm)}
                    {d.amount_interval_mm && (
                      <span className="ml-1 text-[10px] text-ink-400">
                        ({fmtMm(d.amount_interval_mm[0], 0)}–{fmtMm(d.amount_interval_mm[1], 0)})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-ink-400" title={d.reason}>
                    no model
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 tabular-nums text-weather-sun font-medium">{fmtMm(d.nwp_forecast_mm)}</td>
              <td className="py-2 pr-2 tabular-nums text-ink-500">{fmtMm(d.climatology_mm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-400">
            <th className="py-2 pr-2 font-semibold">Source</th>
            <th className="py-2 pr-2 font-semibold">MAE</th>
            <th className="py-2 pr-2 font-semibold">RMSE</th>
            <th className="py-2 pr-2 font-semibold">Bias</th>
            <th className="py-2 pr-2 font-semibold">Precision</th>
            <th className="py-2 pr-2 font-semibold">Recall</th>
            <th className="py-2 pr-2 font-semibold">F1</th>
            <th className="py-2 pr-2 font-semibold">Brier</th>
            <th className="py-2 pr-2 font-semibold">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-b border-line/60">
              <td className="py-2 pr-2">
                <span className="block font-medium text-ink-900">
                  {r.source === "ml" ? "ML model" : r.source === "nwp_raw" ? "NWP forecast" : r.source === "imd" ? "IMD" : "Climatology"}
                </span>
                <span className="block text-[10px] leading-tight text-ink-400">{r.kind}</span>
              </td>
              {r.available ? (
                <>
                  <td className="py-2 pr-2 tabular-nums text-slate-200">{r.mae?.toFixed(2)}</td>
                  <td className="py-2 pr-2 tabular-nums text-slate-300">{r.rmse?.toFixed(2)}</td>
                  <td
                    className={`py-2 pr-2 tabular-nums ${
                      r.bias === null
                        ? "text-slate-400"
                        : r.bias > 0.05
                          ? "text-amber-300"
                          : r.bias < -0.05
                            ? "text-sky-350"
                            : "text-emerald-300"
                    }`}
                    title={
                      r.bias === null
                        ? undefined
                        : r.bias > 0.05
                          ? "Overprediction on average"
                          : r.bias < -0.05
                            ? "Underprediction on average"
                            : "Unbiased on this window"
                    }
                  >
                    {fmtSigned(r.bias)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-slate-300">{fmtPct(r.precision)}</td>
                  <td className="py-2 pr-2 tabular-nums text-slate-300">{fmtPct(r.recall)}</td>
                  <td className="py-2 pr-2 tabular-nums text-slate-300">{r.f1?.toFixed(2)}</td>
                  <td className="py-2 pr-2 tabular-nums text-slate-300">{r.brier?.toFixed(3)}</td>
                  <td className="py-2 pr-2 tabular-nums text-slate-500">{r.n ?? "—"}</td>
                </>
              ) : (
                <td colSpan={8} className="py-2 pr-2 text-[11px] leading-snug text-amber-300/90">
                  {r.unavailableReason}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="label-caps">{title}</p>
      <table className="mt-1.5 w-full text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-400">
            <th className="py-1.5 pr-2 font-semibold">Group</th>
            <th className="py-1.5 pr-2 font-semibold">Days</th>
            <th className="py-1.5 pr-2 font-semibold">ML MAE</th>
            <th className="py-1.5 pr-2 font-semibold">NWP MAE</th>
            <th className="py-1.5 pr-2 font-semibold">ML bias</th>
            <th className="py-1.5 pr-2 font-semibold">ML F1</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.group} className="border-b border-line/60">
              <td className="py-1.5 pr-2 capitalize text-ink-900">{r.group.replace(/_/g, " ")}</td>
              <td className="py-1.5 pr-2 tabular-nums text-ink-400">{r.n ?? "—"}</td>
              <td className="py-1.5 pr-2 tabular-nums text-ink-900">
                {r.mlMae?.toFixed(2) ?? "—"}
              </td>
              <td className="py-1.5 pr-2 tabular-nums text-weather-sun font-medium">
                {r.nwpMae?.toFixed(2) ?? "—"}
              </td>
              <td className="py-1.5 pr-2 tabular-nums text-ink-600">{fmtSigned(r.mlBias)}</td>
              <td className="py-1.5 pr-2 tabular-nums text-ink-600">
                {r.mlF1?.toFixed(2) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeadTable({ rows }: { rows: LeadRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-400">
            <th className="py-2 pr-2 font-semibold">Lead</th>
            <th className="py-2 pr-2 font-semibold">ML MAE</th>
            <th className="py-2 pr-2 font-semibold">NWP MAE</th>
            <th className="py-2 pr-2 font-semibold">Clim MAE</th>
            <th className="py-2 pr-2 font-semibold">MAE skill vs NWP</th>
            <th className="py-2 pr-2 font-semibold">ML F1</th>
            <th className="py-2 pr-2 font-semibold">NWP F1</th>
            <th className="py-2 pr-2 font-semibold">Interval coverage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lead} className="border-b border-line/60">
              <td className="py-2 pr-2 font-medium text-slate-200">{r.lead} day{r.lead > 1 ? "s" : ""}</td>
              <td className="py-2 pr-2 tabular-nums text-slate-200">{r.mlMae?.toFixed(2) ?? "—"}</td>
              <td className="py-2 pr-2 tabular-nums text-amber-300/90">{r.nwpMae?.toFixed(2) ?? "—"}</td>
              <td className="py-2 pr-2 tabular-nums text-slate-400">{r.climMae?.toFixed(2) ?? "—"}</td>
              <td
                className={`py-2 pr-2 tabular-nums ${
                  r.skillVsNwp === null
                    ? "text-slate-500"
                    : r.skillVsNwp > 0
                      ? "text-emerald-300"
                      : "text-red-300"
                }`}
                title="1 − ML_MAE / NWP_MAE on the held-out test window (positive = ML better)"
              >
                {r.skillVsNwp === null ? "—" : `${(r.skillVsNwp * 100).toFixed(1)}%`}
              </td>
              <td className="py-2 pr-2 tabular-nums text-slate-300">{r.mlF1?.toFixed(2) ?? "—"}</td>
              <td className="py-2 pr-2 tabular-nums text-slate-400">{r.nwpF1?.toFixed(2) ?? "—"}</td>
              <td className="py-2 pr-2 tabular-nums text-slate-400">{fmtPct(r.coverage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------------------- #
// Charts
// --------------------------------------------------------------------------- #

function ChartTip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-navy-600 bg-navy-950/95 px-2.5 py-1.5 text-xs shadow-lg">
      <p className="font-semibold text-slate-200">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-slate-300">
          <span
            className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: p.color }}
            aria-hidden="true"
          />
          {p.name}: {p.value}
          {unit ?? ""}
        </p>
      ))}
    </div>
  );
}

export function PredictionChart({
  data,
}: {
  data: ReturnType<typeof buildPredictionChartData>;
}) {
  return (
    <div className="h-48 w-full" role="img" aria-label="ML vs NWP predicted rainfall chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={12} />
          <YAxis yAxisId="mm" tick={AXIS} width={34} />
          <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tick={AXIS} width={30} />
          <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(56,189,248,0.05)" }} />
          <Bar yAxisId="mm" dataKey="mlMm" name="ML rainfall (mm)" fill={C_ML} radius={[3, 3, 0, 0]} />
          <Bar yAxisId="mm" dataKey="nwpMm" name="NWP forecast (mm)" fill={C_NWP} radius={[3, 3, 0, 0]} fillOpacity={0.75} />
          <Line
            yAxisId="mm"
            type="monotone"
            dataKey="climMm"
            name="Climatology (mm)"
            stroke={C_CLIM}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
          <Line
            yAxisId="p"
            type="monotone"
            dataKey={(row: { prob: number | null }) => (row.prob === null ? null : row.prob * 100)}
            name="ML rain probability (%)"
            stroke={C_PROB}
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ObservedVsPredictedChart({
  data,
}: {
  data: ReturnType<typeof buildVerificationChartData>;
}) {
  return (
    <div className="h-48 w-full" role="img" aria-label="Observed vs predicted daily rainfall chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={AXIS} width={34} />
          <Tooltip content={<ChartTip unit=" mm" />} cursor={{ stroke: GRID }} />
          <Bar dataKey="observed" name="Observed (reanalysis)" fill={C_OBS} fillOpacity={0.35} radius={[2, 2, 0, 0]} />
          <Line type="monotone" dataKey="ml" name="ML prediction" stroke={C_ML} strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="nwp" name="NWP forecast" stroke={C_NWP} strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="clim" name="Climatology" stroke={C_CLIM} strokeWidth={1} strokeDasharray="3 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ErrorTrendChart({
  data,
}: {
  data: ReturnType<typeof buildVerificationChartData>;
}) {
  return (
    <div className="h-44 w-full" role="img" aria-label="Forecast error trend chart (7-day rolling MAE)">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={AXIS} width={34} />
          <Tooltip content={<ChartTip unit=" mm" />} cursor={{ stroke: GRID }} />
          <Line
            type="monotone"
            dataKey="nwpRolling"
            name="NWP 7-day rolling MAE"
            stroke={C_NWP}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="mlRolling"
            name="ML 7-day rolling MAE"
            stroke={C_ML}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------------------------------------------------------- #
// Transparency panel
// --------------------------------------------------------------------------- #

export function LocationTransparency({
  location,
  predict,
  sources,
  health,
}: {
  location: GeoLocation;
  predict: PredictResponse | null;
  sources: SourcesResponse | null;
  health: MlHealth | null;
}) {
  const gpsFix = location.source === "device" ? readCachedFix() : null;
  const gpsMatches =
    gpsFix &&
    Math.abs(gpsFix.latitude - location.latitude) < 1e-4 &&
    Math.abs(gpsFix.longitude - location.longitude) < 1e-4;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <dl className="space-y-1 rounded-xl border border-navy-700/60 p-3 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Coordinates</dt>
          <dd className="text-right font-medium tabular-nums text-slate-200">
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Resolved place</dt>
          <dd className="text-right text-slate-200">
            {location.name}
            {location.admin2 ? `, ${location.admin2}` : ""}
            {location.admin1 ? `, ${location.admin1}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Location source</dt>
          <dd className="text-right text-slate-200">
            {location.source === "device"
              ? "Device GPS"
              : location.source === "manual"
                ? "Manual coordinates"
                : location.source === "demo-fixture"
                  ? "Demo fixture"
                  : "Geocoding search"}
          </dd>
        </div>
        {gpsMatches && gpsFix && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">GPS accuracy</dt>
            <dd className="text-right text-slate-200">
              ±{gpsFix.accuracyMeters} m · fix {fmtIsoDateTime(gpsFix.timestamp)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Grid elevation</dt>
          <dd className="text-right tabular-nums text-slate-200">
            {predict?.location.elevation_m != null ? `${predict.location.elevation_m} m` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Resolution</dt>
          <dd className="text-right text-slate-300">
            {predict?.location.grid_resolution ?? "~25 km grid (grid-cell values, not point data)"}
          </dd>
        </div>
      </dl>

      <dl className="space-y-1 rounded-xl border border-navy-700/60 p-3 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Prediction issued</dt>
          <dd className="text-right text-slate-200">{fmtIsoDateTime(predict?.issued_at)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Forecast horizon</dt>
          <dd className="text-right text-slate-200">
            {predict ? `${predict.horizon_days} days (local dates from ${predict.local_date})` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Model trained</dt>
          <dd className="text-right text-slate-200">{fmtIsoDateTime(health?.trained_at)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Data status</dt>
          <dd className="text-right">
            <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              LIVE FETCH
            </span>{" "}
            <span className="text-slate-400">(server-cached archives)</span>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">IMD official feed</dt>
          <dd className="text-right text-slate-300">
            {health?.imd_configured
              ? "API key configured — IMD comparisons enabled"
              : "No API key — reported unavailable, never invented"}
          </dd>
        </div>
      </dl>

      {sources && (
        <div className="sm:col-span-2">
          <p className="label-caps">Data sources</p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-400">
            {sources.sources.map((s) => (
              <li key={s.key} className="flex items-start gap-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    s.status === "live" || s.status === "ready" || s.status === "configured"
                      ? "bg-emerald-500"
                      : s.status === "unavailable"
                        ? "bg-amber-450"
                        : "bg-slate-500"
                  }`}
                  aria-hidden="true"
                />
                <span>
                  <strong className="font-semibold text-slate-300">{s.name}</strong> — {s.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- #
// Main panel
// --------------------------------------------------------------------------- #

export function RainIntelligence({
  location,
  dataMode,
}: {
  location: GeoLocation;
  dataMode: DataMode;
}) {
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [health, setHealth] = useState<MlHealth | null>(null);
  const [predict, setPredict] = useState<PredictResponse | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [metrics, setMetrics] = useState<ModelMetricsResponse | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [trainingIds, setTrainingIds] = useState<string[]>(DEFAULT_TRAINING_IDS);

  const [lead, setLead] = useState(1);
  const [scope, setScope] = useState<"here" | "cities">("here");
  const [preset, setPreset] = useState<RangePreset>("90");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [verifyNonce, setVerifyNonce] = useState(0);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const window = useMemo(
    () => verificationWindow(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  // ---- backend health + prediction for the selected location ---- //
  useEffect(() => {
    const ac = new AbortController();
    setBackendState("checking");
    setBackendError(null);
    setPredict(null);
    setPredictError(null);

    fetchHealth(ac.signal)
      .then((h) => {
        if (ac.signal.aborted) return;
        setHealth(h);
        setBackendState(h.model_ready ? "ready" : "model_missing");
        if (!h.model_ready) return;
        setPredictLoading(true);
        predictRainfall(
          { latitude: location.latitude, longitude: location.longitude, days: 7, name: location.name },
          ac.signal,
        )
          .then((res) => {
            if (!ac.signal.aborted) setPredict(res);
          })
          .catch((e) => {
            if (!ac.signal.aborted) setPredictError(describeMlError(e));
          })
          .finally(() => {
            if (!ac.signal.aborted) setPredictLoading(false);
          });
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setBackendState("unreachable");
        setBackendError(describeMlError(e));
      });

    fetchSources(ac.signal)
      .then((s) => !ac.signal.aborted && setSources(s))
      .catch(() => undefined);
    fetchModelMetrics(ac.signal)
      .then((m) => {
        if (!ac.signal.aborted) setMetrics(m);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setMetricsError(describeMlError(e));
      });
    fetchTrainingLocations(ac.signal)
      .then((r) => {
        if (!ac.signal.aborted && r.training_locations?.length) {
          setTrainingIds(r.training_locations.map((l) => l.id));
        }
      })
      .catch(() => undefined);

    return () => ac.abort();
  }, [location.id, location.latitude, location.longitude]);

  // ---- verification run ---- //
  const runVerification = useCallback(() => setVerifyNonce((n) => n + 1), []);

  useEffect(() => {
    if (backendState !== "ready") return;
    const ac = new AbortController();
    setVerifyLoading(true);
    setVerifyError(null);

    const params =
      scope === "cities"
        ? { locations: trainingIds.join(","), lead, start: window.start, end: window.end }
        : {
            latitude: location.latitude,
            longitude: location.longitude,
            lead,
            start: window.start,
            end: window.end,
          };

    fetchVerification(params, ac.signal)
      .then((res) => {
        if (!ac.signal.aborted) setVerification(res);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setVerifyError(describeMlError(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setVerifyLoading(false);
      });

    return () => ac.abort();
  }, [
    backendState,
    location.latitude,
    location.longitude,
    lead,
    scope,
    window.start,
    window.end,
    trainingIds,
    verifyNonce,
  ]);

  const predictionChart = useMemo(
    () => (predict ? buildPredictionChartData(predict.days) : []),
    [predict],
  );
  const verifyChart = useMemo(
    () => (verification ? buildVerificationChartData(verification.series, { tail: 60 }) : []),
    [verification],
  );
  const comparisonRows = useMemo(
    () => (verification ? buildComparisonRows(verification) : []),
    [verification],
  );
  const seasonRows = useMemo(
    () => buildBreakdownRows(verification?.by_season),
    [verification],
  );
  const monthRows = useMemo(() => buildBreakdownRows(verification?.by_month), [verification]);
  const leadRows = useMemo(() => (metrics ? buildLeadRows(metrics) : []), [metrics]);
  const headline = useMemo(
    () => (verification ? skillHeadline(verification) : null),
    [verification],
  );

  return (
    <Card ariaLabel="Rainfall intelligence and forecast verification">
      <CardHeader
        title="Rainfall Intelligence & IMD Forecast Verification"
        subtitle="SIH 2026 · SIH26076 (Mausam) — machine-learning rainfall prediction, evaluated against observed rainfall on identical test rows"
        icon={<Brain className="h-4 w-4 text-sky-450" aria-hidden="true" />}
        action={
          <button
            type="button"
            className="btn"
            onClick={() => {
              runVerification();
            }}
            disabled={verifyLoading || backendState !== "ready"}
            title="Re-run verification"
          >
            <RefreshCw className={`h-4 w-4 ${verifyLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="hidden sm:inline">Re-run</span>
          </button>
        }
      />

      <div className="space-y-5 px-4 py-4 sm:px-5">

        {/* ---------------- backend state ---------------- */}
        {backendState === "checking" && <SkeletonCard />}

        {backendState === "unreachable" && (
          <ErrorState
            title="ML backend not reachable"
            description={
              backendError ??
              "The rainfall prediction service could not be reached. It runs separately from this static site."
            }
            onRetry={runVerification}
          />
        )}

        {backendState === "model_missing" && (
          <EmptyState
            title="Model not trained on this server"
            description={
              health?.error ??
              "The API is running but has no trained artifacts. Train once offline: cd backend && python -m ml.train, then reload."
            }
          />
        )}

        {/* ---------------- prediction ---------------- */}
        {backendState === "ready" && (
          <section aria-label="Rainfall prediction">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <BarChart3 className="h-4 w-4 text-pine-600" aria-hidden="true" />
                Predicted rainfall — next {predict?.horizon_days ?? 7} days
              </h3>
              <span className="text-[11px] text-ink-400">
                ML model vs global NWP forecast vs climatology · issued{" "}
                {fmtIsoDateTime(predict?.issued_at)}
              </span>
            </div>

            {predictLoading && !predict && <SkeletonCard />}
            {predictError && (
              <ErrorState
                title="Prediction unavailable"
                description={predictError}
                onRetry={runVerification}
              />
            )}
            {predict && (
              <div className="space-y-3">
                <PredictionChart data={predictionChart} />
                <PredictionTable days={predict.days} />
                <p className="text-[11px] leading-relaxed text-ink-500">
                  ML rainfall = model estimate for the local day, with an 80% prediction interval
                  (split-conformal). NWP forecast = the numerical weather prediction run being used
                  as the model&apos;s input — it is <strong>not</strong> an IMD product. IMD&apos;s
                  own forecast is compared in the verification section when an IMD API key is
                  configured. Climatology = 2015–2023 day-of-year average for this coordinate.
                </p>
                {predict.notes?.length > 0 && (
                  <ul className="space-y-1 text-[11px] text-weather-sun">
                    {predict.notes.map((n) => (
                      <li key={n}>• {n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* ---------------- verification ---------------- */}
        {backendState === "ready" && (
          <section aria-label="Forecast verification" className="border-t border-line pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <CalendarRange className="h-4 w-4 text-pine-600" aria-hidden="true" />
                Verification window
              </h3>

              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor="vi-lead">
                  Forecast lead time
                </label>
                <select
                  id="vi-lead"
                  value={lead}
                  onChange={(e) => setLead(Number(e.target.value))}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink-900 focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {d}-day lead
                    </option>
                  ))}
                </select>

                <label className="sr-only" htmlFor="vi-scope">
                  Location scope
                </label>
                <select
                  id="vi-scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "here" | "cities")}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink-900 focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
                >
                  <option value="here">This location (GPS/coords)</option>
                  <option value="cities">All training cities (pooled)</option>
                </select>

                <label className="sr-only" htmlFor="vi-range">
                  Date range
                </label>
                <select
                  id="vi-range"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as RangePreset)}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-ink-900 focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
                >
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="180">Last 180 days</option>
                  <option value="custom">Custom…</option>
                </select>

                {preset === "custom" && (
                  <>
                    <input
                      type="date"
                      value={customStart}
                      min="2024-01-08"
                      onChange={(e) => setCustomStart(e.target.value)}
                      aria-label="Verification start date"
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-900 focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
                    />
                    <input
                      type="date"
                      value={customEnd}
                      max="2024-05-18"
                      onChange={(e) => setCustomEnd(e.target.value)}
                      aria-label="Verification end date"
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-900 focus:border-pine-600 focus:outline-none focus:ring-1 focus:ring-pine-600"
                    />
                  </>
                )}
              </div>
            </div>

            <p className="mb-3 text-[11px] text-slate-500">
              Window {window.start} → {window.end} · forecast archive starts 2024-01-01 ·
              observation reference lags ~3 days{window.clamped ? " (clamped to valid dates)" : ""}
            </p>

            {verifyLoading && !verification && <SkeletonCard />}
            {verifyError && (
              <ErrorState title="Verification failed" description={verifyError} onRetry={runVerification} />
            )}

            {!verifyLoading && !verifyError && !verification && (
              <EmptyState
                title="No verification results yet"
                description="Run the verification to compare the ML model, the NWP forecast and the climatology baseline against observed rainfall for this window."
                action={
                  <button type="button" className="btn btn-primary" onClick={runVerification}>
                    Run verification
                  </button>
                }
              />
            )}

            {verification && (
              <div className="space-y-4">
                {/* window honesty */}
                <div
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${
                    verification.window.independent_test
                      ? "border-pine-600/40 bg-pine-600/10 text-pine-900"
                      : "border-weather-sun/40 bg-weather-sun/10 text-ink-900"
                  }`}
                >
                  {verification.window.independent_test ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine-600" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-weather-sun" aria-hidden="true" />
                  )}
                  <span>
                    {verification.window.note} Window role: <strong>{verification.window.role}</strong>
                    {" · "}aligned days: {String(verification.alignment?.aligned_dates ?? "—")} ·
                    split boundaries: train ≤ {verification.window.train_end}, val ≤{" "}
                    {verification.window.val_end}.
                  </span>
                </div>

                {verification.aggregation && (
                  <p className="rounded-lg border border-line bg-paper-light px-3 py-2 text-[11px] text-ink-600">
                    {verification.aggregation}
                  </p>
                )}

                {headline && (
                  <div
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      headline.beatsNwp === true
                        ? "border-pine-600/40 bg-pine-600/10 text-pine-900"
                        : headline.beatsNwp === false
                          ? "border-weather-alert/40 bg-weather-alert/10 text-weather-alert"
                          : "border-line bg-surface text-ink-800"
                    }`}
                  >
                    {headline.beatsNwp === true ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pine-600" aria-hidden="true" />
                    ) : headline.beatsNwp === false ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-weather-alert" aria-hidden="true" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-pine-600" aria-hidden="true" />
                    )}
                    <span>{headline.text}</span>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="label-caps">Observed vs predicted (daily rainfall)</p>
                    <ObservedVsPredictedChart data={verifyChart} />
                  </div>
                  <div>
                    <p className="label-caps">Error trend (7-day rolling MAE)</p>
                    <ErrorTrendChart data={verifyChart} />
                  </div>
                </div>

                <div>
                  <p className="label-caps">
                    Same rows, same window — source comparison (lower is better)
                  </p>
                  <div className="mt-1.5">
                    <ComparisonTable rows={comparisonRows} />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
                    Observation reference: reanalysis grid (~25 km), not a rain gauge. Bias &gt; 0
                    means systematic overprediction; bias &lt; 0 means underprediction. Rain-day
                    threshold: 1.0 mm/24 h (probability metrics use the model&apos;s calibrated
                    probability; the NWP row is classified from its own rainfall amount).
                  </p>
                </div>

                {verification.scores.imd && verification.scores.imd.available === false && (
                  <div className="flex items-start gap-2 rounded-lg border border-line bg-paper-light px-3 py-2 text-[11px] text-ink-600">
                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                    <span>
                      <strong className="font-semibold text-ink-800">Optional IMD comparison unavailable:</strong>{" "}
                      {verification.scores.imd.reason}
                      {verification.imd_note ? ` ${verification.imd_note}` : ""}
                    </span>
                  </div>
                )}
                {verification.scores.imd?.available && (
                  <div className="rounded-lg border border-line bg-surface p-3 text-[11px] text-ink-700">
                    <p className="font-semibold text-ink-900">
                      IMD official forecast — {verification.scores.imd.matched_dates} matched days
                    </p>
                    {verification.scores.imd.category && (
                      <p className="mt-1">
                        Category accuracy:{" "}
                        {fmtPct(verification.scores.imd.category.exact_accuracy)} exact ·{" "}
                        {fmtPct(verification.scores.imd.category.within_one_class_accuracy)} within
                        one IMD class (n={verification.scores.imd.category.n}).
                      </p>
                    )}
                    {verification.scores.imd.amount && (
                      <p className="mt-1">
                        Amount MAE {verification.scores.imd.amount.mae.toFixed(2)} mm · bias{" "}
                        {fmtSigned(verification.scores.imd.amount.bias)} mm.
                      </p>
                    )}
                    {verification.scores.imd.amount_reason && (
                      <p className="mt-1 text-amber-300">{verification.scores.imd.amount_reason}</p>
                    )}
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <BreakdownTable title="By season" rows={seasonRows} />
                  <BreakdownTable title="By month" rows={monthRows} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---------------- model metrics ---------------- */}
        {backendState === "ready" && (
          <section aria-label="Model evaluation metrics" className="border-t border-line pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
              <ShieldCheck className="h-4 w-4 text-pine-600" aria-hidden="true" />
              Held-out model evaluation (chronological test window)
            </h3>
            {metricsError ? (
              <p className="text-xs text-weather-sun">{metricsError}</p>
            ) : !metrics ? (
              <SkeletonCard />
            ) : (
              <div className="space-y-2">
                <LeadTable rows={leadRows} />
                <p className="text-[11px] leading-relaxed text-ink-400">
                  {metrics.disclaimer}
                </p>
                <ul className="space-y-1 text-[11px] leading-relaxed text-ink-400">
                  {metrics.notes.slice(0, 4).map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ---------------- transparency ---------------- */}
        {backendState === "ready" && (
          <section aria-label="Location and data transparency" className="border-t border-line pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
              <MapPin className="h-4 w-4 text-pine-600" aria-hidden="true" />
              Location & data transparency
            </h3>
            <LocationTransparency
              location={location}
              predict={predict}
              sources={sources}
              health={health}
            />
          </section>
        )}
      </div>
    </Card>
  );
}
