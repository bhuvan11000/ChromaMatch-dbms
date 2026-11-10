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
      <h2
        id="room-standings-heading"
        className="font-display text-lg font-extrabold tracking-tight"
      >
        {title}
      </h2>

      <div className="mt-3 overflow-hidden rounded-[0.9rem] border-2 border-border">
        <div className="cm-marquee flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <p className="font-mono text-[8px] font-bold tracking-[0.18em] text-white/55 uppercase">
            Room scoreboard
          </p>
          <p className="font-mono text-[8px] font-bold tracking-[0.16em] text-white/40 uppercase">
            Best / 30
          </p>
        </div>

        <div className="cm-screen border-0">
          <div className="overflow-x-auto">
            <table data-testid="room-scoreboard" className="cm-score-table min-w-[18rem]">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left">
                    Rank
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-left">
                    Player
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Best
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing) => {
                  const isMe = standing.userId === meId;

                  return (
                    <tr
                      key={standing.userId}
                      data-testid="room-scoreboard-row"
                      data-viewer={isMe || undefined}
                    >
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {standing.rank === null ? (
                          <span className="text-[8px] font-bold tracking-[0.1em] text-[var(--screen-muted)] uppercase">
                            Unranked
                          </span>
                        ) : (
                          <span className="inline-grid min-w-8 place-items-center rounded-[0.25rem] border border-[var(--screen-line)] bg-white/5 px-1.5 py-0.5 font-bold text-[var(--screen-gold)]">
                            #{standing.rank}
                          </span>
                        )}
                      </td>
                      <td className="min-w-0 px-2 py-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="cm-score-name truncate">{standing.username}</span>
                          {isMe ? (
                            <span className="shrink-0 rounded-[0.2rem] border border-[var(--screen-gold)]/50 bg-[var(--screen-gold)]/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] text-[var(--screen-gold)] uppercase">
                              You
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                        {standing.bestScore === null ? (
                          <span className="text-[9px] font-medium text-[var(--screen-muted)]">
                            {formatScore(standing.bestScore)}
                          </span>
                        ) : (
                          <>
                            <span className="cm-score-value">
                              {formatScore(standing.bestScore)}
                            </span>
                            <span className="text-[9px] font-medium text-[var(--screen-muted)]">
                              {" "}
                              / 30
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
