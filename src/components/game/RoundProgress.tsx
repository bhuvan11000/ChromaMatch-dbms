import { ROUNDS_PER_GAME } from "@/lib/config/constants";
import { cn } from "@/lib/cn";

export interface RoundProgressProps {
  /** 1-based round currently on screen. */
  currentRound: number;
  /** Number of rounds whose guesses have already been recorded. */
  completedRounds?: number;
  totalRounds?: number;
  className?: string;
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path
        d="m3.5 8.2 3 3 6-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Arcade round tracker shown outside the stage. Completion is carried by a
 * check icon and text, not by colour alone.
 */
export function RoundProgress({
  currentRound,
  completedRounds = 0,
  totalRounds = ROUNDS_PER_GAME,
  className,
}: RoundProgressProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase sm:block">
          Round rail
        </span>
        <ol className="flex items-center gap-1.5" aria-label="Round progress">
          {Array.from({ length: totalRounds }, (_, index) => {
            const round = index + 1;
            const isComplete = round <= completedRounds;
            const isCurrent = round === currentRound && !isComplete;

            return (
              <li
                key={round}
                aria-current={isCurrent ? "step" : undefined}
                className="flex items-center gap-1.5"
              >
                <span
                  className={cn(
                    "grid h-8 min-w-9 place-items-center rounded-[0.4rem] border-2 font-mono text-[11px] font-bold tabular-nums transition-colors",
                    isComplete
                      ? "border-border bg-success-soft text-success shadow-[0_2px_0_var(--border-lip)]"
                      : isCurrent
                        ? "border-border bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-lip)]"
                        : "border-border/40 bg-card text-muted-foreground",
                  )}
                >
                  {isComplete ? <CheckIcon /> : `0${round}`}
                </span>
                {round < totalRounds ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-0.5 w-3 rounded-full",
                      round <= completedRounds ? "bg-success/50" : "bg-border/50",
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <p className="font-display text-sm font-extrabold tracking-tight text-foreground">
        Round {currentRound}
        <span className="ml-1 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          / {totalRounds}
        </span>
      </p>
    </div>
  );
}
