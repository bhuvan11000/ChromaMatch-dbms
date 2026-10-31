import { formatScoreTenths } from "@/components/ui";
import type { LeaderboardEntryResponse, LeaderboardMeResponse } from "@/lib/schemas/leaderboard";
import { cn } from "@/lib/cn";

import { RankBadge } from "./RankBadge";

export interface LeaderboardTableProps {
  entries: LeaderboardEntryResponse[];
  me: LeaderboardMeResponse | null;
  /** Daily boards label the column "Date"; Global boards use "Achieved". */
  mode: "global" | "daily";
  className?: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function formatScore(value: number): string {
  return formatScoreTenths(Math.round(value * 10));
}

/**
 * Ranked leaderboard table — Architecture §5.10.5, §5.11.5.
 *
 * The viewer's row is highlighted by rank because the API intentionally exposes
 * only `{ rank, score }` for `me`. A visible "You" label keeps the highlight
 * from depending on colour alone.
 */
export function LeaderboardTable({ entries, me, mode, className }: LeaderboardTableProps) {
  const dateLabel = mode === "daily" ? "Date" : "Achieved";

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <caption className="sr-only">
          {mode === "daily" ? "Daily leaderboard" : "Global leaderboard"}
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="px-3 py-2.5 font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
            >
              Rank
            </th>
            <th
              scope="col"
              className="px-3 py-2.5 font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
            >
              Player
            </th>
            <th
              scope="col"
              className="px-3 py-2.5 text-right font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
            >
              Score
            </th>
            <th
              scope="col"
              className="px-3 py-2.5 text-right font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
            >
              {dateLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isViewer = me !== null && entry.rank === me.rank;

            return (
              <tr
                key={entry.userId}
                data-viewer={isViewer ? "true" : undefined}
                aria-current={isViewer ? "true" : undefined}
                className={cn(
                  "border-b border-border/70 last:border-b-0",
                  isViewer ? "bg-primary/10" : "hover:bg-muted/40",
                )}
              >
                <td className="px-3 py-3">
                  <RankBadge rank={entry.rank} />
                </td>
                <td className="px-3 py-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{entry.username}</span>
                    {isViewer ? (
                      <span className="shrink-0 rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-primary uppercase">
                        You
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm font-bold text-foreground tabular-nums">
                  {formatScore(entry.score)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {formatDate(entry.achievedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
