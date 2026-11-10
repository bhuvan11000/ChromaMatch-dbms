import { cn } from "@/lib/cn";

export interface RevealCountdownProps {
  remainingMs: number;
  totalMs: number;
  /** Defaults to "Reveal window"; timed rooms pass "Guess window". */
  label?: string;
  /** Short line under the label; defaults to the reveal copy. */
  hint?: string;
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
  hint = "Memorise it.",
  className,
}: RevealCountdownProps) {
  const progress = clampPercent((remainingMs / Math.max(1, totalMs)) * 100);
  const seconds = Math.max(0, remainingMs) / 1000;
  const wholeSeconds = Math.ceil(seconds);

  return (
    <div className={cn("mt-3", className)} data-testid="game-stage-countdown">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-stage-muted uppercase">
            {label}
          </p>
          <p className="mt-1 font-display text-base font-bold tracking-tight text-stage-fg">
            {hint}
          </p>
        </div>
        <p
          aria-hidden="true"
          className="shrink-0 font-mono text-4xl leading-none font-bold text-stage-fg tabular-nums"
        >
          {seconds.toFixed(1)}s
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="cm-countdown-track mt-2.5 h-3.5 w-full overflow-hidden rounded-[0.25rem] border border-stage-border bg-stage-surface"
      >
        <div
          className="h-full rounded-[0.15rem] bg-stage-fg will-change-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className="sr-only" role="timer" aria-live="polite">
        {wholeSeconds} {wholeSeconds === 1 ? "second" : "seconds"} remaining
      </span>
    </div>
  );
}
