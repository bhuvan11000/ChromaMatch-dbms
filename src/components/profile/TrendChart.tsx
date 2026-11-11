"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StatsTrendPoint } from "@/lib/schemas/stats";

export interface TrendChartProps {
  points: StatsTrendPoint[];
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--card-foreground)",
  fontSize: 12,
} as const;

/** Average game score per UTC day over the last 30 days. */
export function TrendChart({ points }: TrendChartProps) {
  const summary = points
    .map((point) => `${point.bucketStart}: ${point.avgScore.toFixed(1)}`)
    .join(", ");

  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label={`Score trend. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              tickFormatter={(value) => String(value).slice(5)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={18}
            />
            <YAxis
              domain={[0, 30]}
              ticks={[0, 10, 20, 30]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--muted-foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--card-foreground)" }}
              formatter={(value) => [`${Number(value).toFixed(1)} / 30`, "Average"]}
            />
            <Line
              type="monotone"
              dataKey="avgScore"
              name="Average score"
              stroke="var(--primary)"
              strokeWidth={2.4}
              dot={{ r: 2.4, fill: "var(--primary)", strokeWidth: 0 }}
              activeDot={{ r: 4.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
        Average game score · last 30 UTC days
      </p>
    </div>
  );
}
