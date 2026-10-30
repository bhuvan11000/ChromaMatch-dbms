import type { ReactNode } from "react";

import { ROUNDS_PER_GAME } from "@/lib/config/constants";
import { cn } from "@/lib/cn";

import { RevealCountdown } from "./RevealCountdown";

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
        <RevealCountdown
          remainingMs={countdown.remainingMs}
          totalMs={countdown.totalMs}
          label={countdown.label}
        />
      ) : null}

      <div className="mt-4 sm:mt-5">{children}</div>

      {footer ? (
        <div className="mt-4 border-t border-stage-border pt-3 sm:mt-5">{footer}</div>
      ) : null}
    </section>
  );
}
