"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { hsvToCssColor } from "@/lib/domain/hsv";
import type { StatsHueRegion } from "@/lib/schemas/stats";

export interface HueRegionChartProps {
  regions: StatsHueRegion[];
}

const TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--card-foreground)",
  fontSize: 12,
} as const;

function regionFill(region: StatsHueRegion): string {
  const midpoint = (region.from + region.to) / 2;
  return hsvToCssColor({ h: midpoint % 360, s: 70, v: 72 });
}

/** Average round score per hue region; the bar colour repeats the region identity. */
export function HueRegionChart({ regions }: HueRegionChartProps) {
  const data = [...regions]
    .sort((a, b) => a.from - b.from)
    .map((region) => ({
      ...region,
      label: `${region.from}–${region.to}°`,
    }));
  const summary = data.map((region) => `${region.label}: ${region.avgScore.toFixed(1)}`).join(", ");

  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label={`Hue region accuracy. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              interval={0}
              angle={-30}
              textAnchor="end"
              height={48}
              tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              domain={[0, 10]}
              ticks={[0, 2.5, 5, 7.5, 10]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--muted-foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--card-foreground)" }}
              cursor={{ fill: "var(--muted)", fillOpacity: 0.35 }}
              formatter={(value) => [`${Number(value).toFixed(1)} / 10`, "Avg round score"]}
            />
            <Bar dataKey="avgScore" radius={[5, 5, 0, 0]} isAnimationActive={false}>
              {data.map((region) => (
                <Cell key={`${region.from}-${region.to}`} fill={regionFill(region)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
        Average round score by target hue
      </p>
    </div>
  );
}
