"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StatsChannelAccuracy } from "@/lib/schemas/stats";

export interface AccuracyChartProps {
  accuracy: StatsChannelAccuracy;
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--card-foreground)",
  fontSize: 12,
} as const;

/** Converts average absolute error into a comparable 0–100 closeness score. */
export function AccuracyChart({ accuracy }: AccuracyChartProps) {
  const rows = [
    {
      channel: "Hue",
      accuracy: Math.max(0, 100 - (accuracy.avgAbsDiff.h / 180) * 100),
      miss: `${accuracy.avgAbsDiff.h.toFixed(1)}°`,
      fill: "var(--accent-cyan)",
    },
    {
      channel: "Sat",
      accuracy: Math.max(0, 100 - accuracy.avgAbsDiff.s),
      miss: `${accuracy.avgAbsDiff.s.toFixed(1)} pts`,
      fill: "var(--accent-gold)",
    },
    {
      channel: "Value",
      accuracy: Math.max(0, 100 - accuracy.avgAbsDiff.v),
      miss: `${accuracy.avgAbsDiff.v.toFixed(1)} pts`,
      fill: "var(--accent-violet)",
    },
  ];
  const summary = rows.map((row) => `${row.channel}: ${row.accuracy.toFixed(0)}%`).join(", ");

  return (
    <div>
      <div className="h-52 w-full" role="img" aria-label={`Channel accuracy. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 40, bottom: 0, left: 0 }}
            barCategoryGap={18}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              unit="%"
            />
            <YAxis
              type="category"
              dataKey="channel"
              width={46}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--muted-foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--card-foreground)" }}
              cursor={{ fill: "var(--muted)", fillOpacity: 0.35 }}
              formatter={(value) => [`${Number(value).toFixed(0)}%`, "Closeness"]}
            />
            <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {rows.map((row) => (
                <Cell key={row.channel} fill={row.fill} />
              ))}
              <LabelList
                dataKey="accuracy"
                position="right"
                formatter={(value) => `${Number(value).toFixed(0)}%`}
                style={{ fill: "var(--foreground)", fontSize: 10, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        100% is a perfect match · avg miss{" "}
        {rows.map((row) => `${row.channel} ${row.miss}`).join(" · ")}
      </p>
    </div>
  );
}
