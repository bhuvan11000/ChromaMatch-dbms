import { cn } from "@/lib/cn";

export interface RevealCountdownProps {
  remainingMs: number;
  totalMs: number;
  /** Defaults to "Reveal window"; timed rooms pass "Guess window". */
  label?: string;
  className?: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Flat achromatic countdown bar for the game stage.
 *
 * The timer itself lives in the game-machine effect layer; this component only
 * renders the remaining window. The stage must stay free of colour and motion
 * other than this bar (docs/UI_THEME.md).
 */
export function RevealCountdown({
  remainingMs,
  totalMs,
  label = "Reveal window",
  className,
}: RevealCountdownProps) {
  const progress = clampPercent((remainingMs / Math.max(1, totalMs)) * 100);
  const seconds = Math.max(0, remainingMs) / 1000;
  const wholeSeconds = Math.ceil(seconds);

  return (
    <div className={cn("mt-3", className)} data-testid="game-stage-countdown">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] tracking-[0.14em] text-stage-muted uppercase">
        <span>{label}</span>
        <span aria-hidden="true" className="text-sm font-bold text-stage-fg tabular-nums">
          {seconds.toFixed(1)}s
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full border border-stage-border bg-stage-surface"
      >
        <div
          className="h-full rounded-full bg-stage-fg transition-[width] duration-100 ease-linear motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="sr-only" role="timer" aria-live="polite">
        {wholeSeconds} {wholeSeconds === 1 ? "second" : "seconds"} remaining
      </span>
    </div>
  );
}
