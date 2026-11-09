import { cn } from "@/lib/cn";
import type { RoomStanding } from "@/lib/schemas/rooms";

export interface RoomScoreboardProps {
  standings: readonly RoomStanding[];
  meId: number;
  /** Heading text; defaults to "Standings". */
  title?: string;
  className?: string;
}

function formatScore(score: number | null): string {
  return score === null ? "No score" : score.toFixed(1);
}

/**
 * Rank, player and best score. Players without a score are listed last and
 * labelled "Unranked"; the viewer's row carries a "You" tag. Meaning is never
 * carried by colour alone.
 */
export function RoomScoreboard({
  standings,
  meId,
  title = "Standings",
  className,
}: RoomScoreboardProps) {
  return (
    <section aria-labelledby="room-standings-heading" className={className}>
      <h2 id="room-standings-heading" className="text-lg font-bold tracking-tight">
        {title}
      </h2>

      <div className="mt-3 overflow-x-auto rounded-[1.25rem] border border-border bg-card">
        <table data-testid="room-scoreboard" className="w-full min-w-[18rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th
                scope="col"
                className="px-4 py-2.5 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
              >
                Rank
              </th>
              <th
                scope="col"
                className="px-2 py-2.5 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
              >
                Player
              </th>
              <th
                scope="col"
                className="px-4 py-2.5 text-right font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
              >
                Best
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {standings.map((standing) => {
              const isMe = standing.userId === meId;

              return (
                <tr
                  key={standing.userId}
                  data-testid="room-scoreboard-row"
                  aria-current={isMe ? "true" : undefined}
                  className={cn(isMe && "bg-primary/10")}
                >
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {standing.rank === null ? (
                      <span className="text-muted-foreground">Unranked</span>
                    ) : (
                      <span className="font-bold">#{standing.rank}</span>
                    )}
                  </td>
                  <td className="min-w-0 px-2 py-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{standing.username}</span>
                      {isMe ? (
                        <span className="shrink-0 rounded-full border-2 border-primary/40 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em] uppercase">
                          You
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold tabular-nums">
                    {standing.bestScore === null ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatScore(standing.bestScore)}
                      </span>
                    ) : (
                      <>
                        {formatScore(standing.bestScore)}
                        <span className="text-xs font-medium text-muted-foreground"> / 30</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
