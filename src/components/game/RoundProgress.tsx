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
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Compact round tracker shown outside the stage. Completion is carried by a
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
                  "grid size-6 place-items-center rounded-full border font-mono text-[10px] font-bold tabular-nums",
                  isComplete
                    ? "border-success/40 bg-success-soft text-success"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {isComplete ? <CheckIcon /> : round}
              </span>
              {round < totalRounds ? (
                <span aria-hidden="true" className="h-px w-3 bg-border" />
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Round {currentRound} / {totalRounds}
      </p>
    </div>
  );
}
