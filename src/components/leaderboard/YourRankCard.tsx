import { formatScoreTenths } from "@/components/ui";
import { MAX_GAME_SCORE } from "@/lib/config/constants";
import type { LeaderboardMeResponse } from "@/lib/schemas/leaderboard";

import { RankBadge } from "./RankBadge";

export interface YourRankCardProps {
  me: LeaderboardMeResponse;
  className?: string;
}

/** Compact viewer summary shown only when the board returned a `me` row. */
export function YourRankCard({ me, className }: YourRankCardProps) {
  return (
    <div
      className={`cm-console-card relative overflow-hidden rounded-[0.85rem] bg-card p-4 ${className ?? ""}`}
    >
      <div aria-hidden="true" className="cm-spectrum-bar absolute inset-x-0 top-0 h-1" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
            Your rank
          </p>
          <div className="mt-1.5">
            <RankBadge rank={me.rank} />
          </div>
        </div>

        <div className="text-right">
          <p className="font-display text-3xl font-extrabold tracking-tight tabular-nums">
            {formatScoreTenths(Math.round(me.score * 10))}
          </p>
          <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            out of {MAX_GAME_SCORE}
          </p>
        </div>
      </div>
    </div>
  );
}
