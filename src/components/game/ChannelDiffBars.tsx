import { cn } from "@/lib/cn";

export interface ChannelDiff {
  h: number;
  s: number;
  v: number;
}

interface ChannelSpec {
  key: keyof ChannelDiff;
  label: string;
  shortLabel: string;
  max: number;
  unit: string;
  barClassName: string;
}

const CHANNELS: readonly ChannelSpec[] = [
  {
    key: "h",
    label: "Hue",
    shortLabel: "Hue",
    max: 180,
    unit: "°",
    barClassName: "bg-accent-cyan",
  },
  {
    key: "s",
    label: "Saturation",
    shortLabel: "Sat",
    max: 100,
    unit: " pts",
    barClassName: "bg-accent-gold",
  },
  {
    key: "v",
    label: "Value",
    shortLabel: "Val",
    max: 100,
    unit: " pts",
    barClassName: "bg-accent-violet",
  },
];

function formatDiff(value: number): string {
  return value.toFixed(1);
}

export interface ChannelDiffBarsProps {
  diff: ChannelDiff;
  className?: string;
}

/**
 * Per-channel difference rows for the result screen.
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
          <div
            key={channel.key}
            title={channel.label}
            className="rounded-[0.75rem] border border-border bg-muted/55 px-2.5 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                {channel.shortLabel}
              </dt>
              <dd className="font-display text-sm font-bold whitespace-nowrap text-foreground tabular-nums">
                Δ{formatDiff(value)}
                <span className="ml-0.5 text-[9px] font-medium text-muted-foreground">
                  {channel.unit}
                </span>
              </dd>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
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
