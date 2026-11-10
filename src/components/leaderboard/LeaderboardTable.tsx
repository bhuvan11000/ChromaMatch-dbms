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
      <table className="cm-score-table min-w-[32rem] text-left">
        <caption className="sr-only">
          {mode === "daily" ? "Daily leaderboard" : "Global leaderboard"}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="px-3 py-3 text-left">
              Rank
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Player
            </th>
            <th scope="col" className="px-3 py-3 text-right">
              Score
            </th>
            <th scope="col" className="px-3 py-3 text-right">
              {dateLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const isViewer = me !== null && entry.rank === me.rank;

            return (
              <tr
                key={entry.userId}
                className="cm-list-row"
                style={{ animationDelay: `${index * 45}ms` }}
                data-viewer={isViewer ? "true" : undefined}
                aria-current={isViewer ? "true" : undefined}
              >
                <td className="px-3 py-3">
                  <RankBadge rank={entry.rank} tone="screen" />
                </td>
                <td className="px-3 py-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="cm-score-name truncate">{entry.username}</span>
                    {isViewer ? (
                      <span className="shrink-0 rounded-[0.25rem] border border-[var(--screen-gold)]/50 bg-[var(--screen-gold)]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] text-[var(--screen-gold)] uppercase">
                        You
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="cm-score-value px-3 py-3 text-right text-base">
                  {formatScore(entry.score)}
                </td>
                <td className="cm-score-muted px-3 py-3 text-right font-mono text-[11px]">
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
