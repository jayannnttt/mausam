/**
 * Shared recharts wrappers, themed for the Mausam Sense palette.
 * Charts are real and interactive (tooltips), never decorative SVG.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatHour } from "../utils/format";
import type { TimeFormat } from "./chartTypes";

const AXIS = { fill: "#68747A", fontSize: 10 };
const GRID = "#DEE2DD";

function ChartTooltip({
  active,
  payload,
  label,
  timeFormat,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string;
  timeFormat: TimeFormat;
  formatter?: (name: string, value: number | string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-semibold text-ink-900">
        {label && label.includes("T") ? formatHour(label, timeFormat) : label}
      </p>
      {payload.map((p, i) => (
        <p key={i} className="text-ink-600">
          <span
            className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: p.color }}
            aria-hidden="true"
          />
          {p.name}: {formatter ? formatter(p.name ?? "", p.value ?? "") : p.value}
        </p>
      ))}
    </div>
  );
}

/** Vertical bars per hour with a shaded "recommended window" band. */
export function ScoreTimeline({
  data,
  timeFormat,
  highlightRange,
}: {
  data: { time: string; score: number | null }[];
  timeFormat: TimeFormat;
  highlightRange?: { from: string; to: string };
}) {
  const chartData = data.map((d) => ({
    time: d.time,
    label: formatHour(d.time, timeFormat),
    score: d.score,
  }));
  return (
    <div className="h-40 w-full" role="img" aria-label="Hourly indicative outdoor score chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          {highlightRange && (
            <ReferenceArea
              x1={formatHour(highlightRange.from, timeFormat)}
              x2={formatHour(highlightRange.to, timeFormat)}
              fill="#35665F"
              fillOpacity={0.08}
              stroke="#35665F"
              strokeOpacity={0.3}
            />
          )}
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis domain={[0, 100]} tick={AXIS} width={34} />
          <Tooltip
            cursor={{ fill: "rgba(53,102,95,0.06)" }}
            content={<ChartTooltip timeFormat={timeFormat} formatter={(n, v) => `${v} / 100 (${n})`} />}
          />
          <Bar dataKey="score" name="Indicative score" radius={[3, 3, 0, 0]}>
            {chartData.map((d) => (
              <Cell
                key={d.time}
                fill={
                  d.score == null
                    ? "#DEE2DD"
                    : d.score >= 75
                      ? "#35665F"
                      : d.score >= 55
                        ? "#4277AA"
                        : d.score >= 35
                          ? "#D9A441"
                          : "#B9493D"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** PM2.5 line chart with an optional shaded reference band. */
export function PollutionChart({
  data,
  timeFormat,
  strictThreshold,
}: {
  data: { time: string; pm25: number | null; pm10?: number | null }[];
  timeFormat: TimeFormat;
  strictThreshold?: number;
}) {
  const chartData = data.map((d) => ({
    label: formatHour(d.time, timeFormat),
    time: d.time,
    pm25: d.pm25,
    pm10: d.pm10 ?? undefined,
  }));
  return (
    <div className="h-40 w-full" role="img" aria-label="Hourly PM2.5 and PM10 chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={AXIS} width={34} />
          <Tooltip content={<ChartTooltip timeFormat={timeFormat} formatter={(n, v) => `${v} µg/m³ (${n})`} />} />
          <Line
            type="monotone"
            dataKey="pm10"
            name="PM10"
            stroke="#64748b"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 3"
          />
          <Line
            type="monotone"
            dataKey="pm25"
            name="PM2.5"
            stroke="#D9A441"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {strictThreshold != null && (
        <p className="text-[10px] text-ink-400">
          Heightened-awareness reference line: {strictThreshold} µg/m³ (a Mausam Sense preference
          threshold, not an official limit)
        </p>
      )}
    </div>
  );
}

/** Temperature (actual + feels-like) and humidity in one chart. */
export function TempHumidityChart({
  data,
  timeFormat,
  tempUnit,
}: {
  data: {
    time: string;
    tempC: number | null;
    feelsC: number | null;
    humidity: number | null;
  }[];
  timeFormat: TimeFormat;
  tempUnit: "C" | "F";
}) {
  const conv = (c: number | null) =>
    c == null ? null : tempUnit === "C" ? Math.round(c * 10) / 10 : Math.round((c * 1.8 + 32) * 10) / 10;
  const chartData = data.map((d) => ({
    label: formatHour(d.time, timeFormat),
    time: d.time,
    temp: conv(d.tempC),
    feels: conv(d.feelsC),
    humidity: d.humidity,
  }));
  return (
    <div className="h-40 w-full" role="img" aria-label="Temperature and humidity chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis yAxisId="t" tick={AXIS} width={34} />
          <YAxis yAxisId="h" orientation="right" domain={[0, 100]} tick={AXIS} width={30} />
          <Tooltip content={<ChartTooltip timeFormat={timeFormat} />} />
          <Line
            yAxisId="t"
            type="monotone"
            dataKey="temp"
            name={`Temp (${tempUnit === "C" ? "°C" : "°F"})`}
            stroke="#4277AA"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="t"
            type="monotone"
            dataKey="feels"
            name={`Feels-like (${tempUnit === "C" ? "°C" : "°F"})`}
            stroke="#D9A441"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
          <Line
            yAxisId="h"
            type="monotone"
            dataKey="humidity"
            name="Humidity (%)"
            stroke="#68747A"
            strokeWidth={1}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daily rainfall bars + max probability line (farming). */
export function RainfallChart({
  data,
  timeFormat,
}: {
  data: {
    label: string;
    mm: number | null;
    prob: number | null;
  }[];
  timeFormat: TimeFormat;
}) {
  const chartData = data.map((d) => ({
    label: d.label,
    mm: d.mm,
    prob: d.prob,
  }));
  return (
    <div className="h-44 w-full" role="img" aria-label="Daily rainfall forecast chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} />
          <YAxis yAxisId="mm" tick={AXIS} width={34} />
          <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tick={AXIS} width={30} />
          <Tooltip content={<ChartTooltip timeFormat={timeFormat} />} />
          <Bar
            yAxisId="mm"
            dataKey="mm"
            name="Rain (mm)"
            fill="#4277AA"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="p"
            type="monotone"
            dataKey="prob"
            name="Max probability (%)"
            stroke="#35665F"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Hourly rain probability bars (farming, next 48 h). */
export function RainProbabilityChart({
  data,
  timeFormat,
}: {
  data: { time: string; prob: number | null; mm: number | null }[];
  timeFormat: TimeFormat;
}) {
  const chartData = data.map((d) => ({
    label: formatHour(d.time, timeFormat),
    time: d.time,
    prob: d.prob,
    mm: d.mm,
  }));
  return (
    <div className="h-40 w-full" role="img" aria-label="Hourly rain probability chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis domain={[0, 100]} tick={AXIS} width={34} />
          <Tooltip
            cursor={{ fill: "rgba(66,119,170,0.06)" }}
            content={<ChartTooltip timeFormat={timeFormat} formatter={(n, v) => (n === "Rain probability" ? `${v}%` : `${v} mm`)} />}
          />
          <Bar
            dataKey="prob"
            name="Rain probability"
            fill="#4277AA"
            radius={[3, 3, 0, 0]}
            fillOpacity={0.85}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
