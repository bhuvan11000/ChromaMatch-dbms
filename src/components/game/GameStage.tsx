import type { ReactNode } from "react";

import { ROUNDS_PER_GAME } from "@/lib/config/constants";
import { cn } from "@/lib/cn";

/** Calibrated, achromatic stage gray (Munsell N2). Identical for every player. */
export const GAME_STAGE_HEX = "#1e1e1e";
export const GAME_STAGE_NEUTRAL_TOKEN = "neutral-1e1e1e";

export interface GameStageCountdown {
  remainingMs: number;
  totalMs: number;
  /** Defaults to "Reveal window"; use "Guess window" for timed rooms. */
  label?: string;
}

export interface GameStageProps {
  roundNumber?: number;
  totalRounds?: number;
  /** Mode context shown in the neutral HUD, e.g. "Global" or "Room ABCD2345". */
  modeLabel?: string;
  /** Current phase, e.g. "Memorise swatch" or "Recreate from memory". */
  phaseLabel?: string;
  /**
   * The only motion allowed on the stage: a flat achromatic countdown bar.
   * Per Architecture §5.11.2 this runs during reveal and timed guessing.
   */
  countdown?: GameStageCountdown | null;
  children: ReactNode;
  /** Optional actions below the stage content (never inside the swatch area). */
  footer?: ReactNode;
  className?: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * The fixed neutral game stage.
 *
 * Rules enforced here (docs/UI_THEME.md):
 *  - achromatic background, identical in light and dark themes;
 *  - no gradients, glows, colored borders or decorative shadows;
 *  - the countdown bar is the only animated element allowed during play.
 */
export function GameStage({
  roundNumber = 1,
  totalRounds = ROUNDS_PER_GAME,
  modeLabel,
  phaseLabel,
  countdown,
  children,
  footer,
  className,
}: GameStageProps) {
  const progress = countdown
    ? clampPercent((countdown.remainingMs / Math.max(1, countdown.totalMs)) * 100)
    : 0;
  const seconds = countdown ? Math.max(0, countdown.remainingMs) / 1000 : 0;
  const wholeSeconds = Math.ceil(seconds);

  return (
    <section
      data-testid="game-stage"
      data-stage-calibration={GAME_STAGE_NEUTRAL_TOKEN}
      aria-label="Game stage"
      className={cn(
        "cm-game-stage w-full rounded-[1.25rem] border border-stage-border p-4 text-stage-fg sm:p-6",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-stage-border pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] font-medium tracking-[0.16em] text-stage-muted uppercase">
          {modeLabel ? (
            <>
              <span data-testid="game-stage-mode" className="truncate">
                {modeLabel}
              </span>
              <span aria-hidden="true" className="text-stage-border">
                /
              </span>
            </>
          ) : null}
          <span data-testid="game-stage-round" className="text-stage-fg tabular-nums">
            Round {roundNumber} / {totalRounds}
          </span>
        </div>
        {phaseLabel ? (
          <span className="font-mono text-[11px] tracking-[0.16em] text-stage-muted uppercase">
            {phaseLabel}
          </span>
        ) : null}
      </header>

      {countdown ? (
        <div className="mt-3" data-testid="game-stage-countdown">
          <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] tracking-[0.14em] text-stage-muted uppercase">
            <span>{countdown.label ?? "Reveal window"}</span>
            <span aria-hidden="true" className="text-sm font-bold text-stage-fg tabular-nums">
              {seconds.toFixed(1)}s
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={countdown.label ?? "Reveal window"}
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
      ) : null}

      <div className="mt-4 sm:mt-5">{children}</div>

      {footer ? (
        <div className="mt-4 border-t border-stage-border pt-3 sm:mt-5">{footer}</div>
      ) : null}
    </section>
  );
}
