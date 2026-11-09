import { ColorSwatch } from "@/components/game";
import { formatScoreTenths } from "@/components/ui";
import type { HistoryItemResponse, HistoryRoundResponse } from "@/lib/schemas/stats";
import { cn } from "@/lib/cn";

const MODE_BADGE: Record<HistoryItemResponse["mode"], string> = {
  global: "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan",
  daily: "border-accent-gold/40 bg-accent-gold/10 text-accent-gold",
  room: "border-accent-violet/40 bg-accent-violet/10 text-accent-violet",
};

const MODE_LABEL: Record<HistoryItemResponse["mode"], string> = {
  global: "Global",
  daily: "Daily",
  room: "Room",
};

function score(value: number, max = 30): string {
  return `${formatScoreTenths(Math.round(value * 10))} / ${max}`;
}

function playedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} · ${iso.slice(11, 16)} UTC`;
}

function hsvLabel(value: { h: number; s: number; v: number }): string {
  return `H ${value.h.toFixed(1)} · S ${value.s.toFixed(1)} · V ${value.v.toFixed(1)}`;
}

function RoundDetail({ round }: { round: HistoryRoundResponse }) {
  return (
    <li className="rounded-[0.875rem] border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          Round {round.roundNumber}
          {round.colorNumber !== undefined ? ` · Colour ${round.colorNumber}` : ""}
        </p>
        <div className="flex items-center gap-2">
          {round.timedOut ? (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em] text-warning uppercase">
              Timed out
            </span>
          ) : null}
          <span className="font-display text-sm font-bold tabular-nums">
            {score(round.score, 10)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {(
          [
            ["Target", round.target],
            ["Your mix", round.guess],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {label}
            </p>
            <div className="mt-1.5 h-11 w-full overflow-hidden rounded-[0.55rem]">
              <ColorSwatch hsv={value} label={`${label} color`} size="fill" />
            </div>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground tabular-nums">
              {hsvLabel(value)}
            </p>
          </div>
        ))}
      </div>
    </li>
  );
}

export interface HistoryListProps {
  items: HistoryItemResponse[];
}

/**
 * Newest-first recent history. Room attempts are labelled and set apart from
 * solo games; rounds stay collapsed until the player opens them.
 */
export function HistoryList({ items }: HistoryListProps) {
  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const isRoom = item.mode === "room";

        return (
          <li key={item.id} data-mode={item.mode}>
            <details
              className={cn(
                "group overflow-hidden rounded-[1rem] border",
                isRoom
                  ? "border-l-4 border-border border-l-accent-violet bg-muted/35"
                  : "border-border bg-card",
              )}
            >
              <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase",
                    MODE_BADGE[item.mode],
                  )}
                >
                  {MODE_LABEL[item.mode]}
                </span>

                <span className="font-display text-base font-bold tabular-nums">
                  {score(item.totalScore)}
                </span>

                <time
                  dateTime={item.playedAt}
                  className="font-mono text-[10px] text-muted-foreground tabular-nums"
                >
                  {playedAt(item.playedAt)}
                </time>

                {isRoom && item.attemptNumber !== undefined ? (
                  <span className="font-mono text-[9px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                    Attempt {item.attemptNumber}
                  </span>
                ) : null}

                <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                  Rounds
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="size-3.5 transition-transform group-open:rotate-180"
                  >
                    <path
                      d="m5.5 7.5 4.5 4.5 4.5-4.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </summary>

              <div className="border-t border-border px-4 py-3">
                <ol className="space-y-2.5">
                  {item.rounds.map((round) => (
                    <RoundDetail key={round.roundNumber} round={round} />
                  ))}
                </ol>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
