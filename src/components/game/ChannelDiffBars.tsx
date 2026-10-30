import { cn } from "@/lib/cn";

export interface ChannelDiff {
  h: number;
  s: number;
  v: number;
}

interface ChannelSpec {
  key: keyof ChannelDiff;
  label: string;
  max: number;
  unit: string;
  barClassName: string;
}

const CHANNELS: readonly ChannelSpec[] = [
  { key: "h", label: "Hue", max: 180, unit: "°", barClassName: "bg-accent-cyan" },
  { key: "s", label: "Saturation", max: 100, unit: " pts", barClassName: "bg-accent-gold" },
  { key: "v", label: "Value", max: 100, unit: " pts", barClassName: "bg-accent-violet" },
];

function formatDiff(value: number): string {
  return value.toFixed(1);
}

export interface ChannelDiffBarsProps {
  diff: ChannelDiff;
  className?: string;
}

/**
 * Per-channel difference bars for the result screen.
 *
 * Values and bars always come with a visible label and a numeric readout, so
 * the result never depends on colour or bar length alone.
 */
export function ChannelDiffBars({ diff, className }: ChannelDiffBarsProps) {
  return (
    <dl className={cn("space-y-2.5", className)} aria-label="Difference from target">
      {CHANNELS.map((channel) => {
        const value = Math.max(0, diff[channel.key]);
        const width = Math.min(100, (value / channel.max) * 100);

        return (
          <div key={channel.key}>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs font-semibold text-foreground">{channel.label}</dt>
              <dd className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
                {formatDiff(value)}
                {channel.unit}
              </dd>
            </div>
            <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", channel.barClassName)}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </dl>
  );
}
