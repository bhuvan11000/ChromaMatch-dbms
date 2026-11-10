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
    <dl className={cn("space-y-2", className)} aria-label="Difference from target">
      {CHANNELS.map((channel) => {
        const value = Math.max(0, diff[channel.key]);
        const rawWidth = Math.min(100, (value / channel.max) * 100);
        // Keep tiny-but-real misses visible; the numeric value remains the truth.
        const width = value === 0 ? 0 : Math.max(4, rawWidth);

        return (
          <div
            key={channel.key}
            title={channel.label}
            className="rounded-[0.5rem] border-2 border-border bg-muted/45 px-2.5 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                {channel.shortLabel}
              </dt>
              <dd className="font-mono text-xs font-bold whitespace-nowrap text-foreground tabular-nums">
                {formatDiff(value)}
                <span className="ml-0.5 font-medium text-muted-foreground">{channel.unit}</span>
              </dd>
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 h-2 overflow-hidden rounded-[0.15rem] border border-border/50 bg-card"
            >
              <div className={cn("h-full", channel.barClassName)} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </dl>
  );
}
