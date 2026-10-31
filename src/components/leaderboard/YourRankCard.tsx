import { Card, formatScoreTenths } from "@/components/ui";
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
    <Card className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
            Your rank
          </p>
          <div className="mt-2">
            <RankBadge rank={me.rank} />
          </div>
        </div>

        <div className="text-right">
          <p className="font-display text-3xl font-bold tracking-tight tabular-nums">
            {formatScoreTenths(Math.round(me.score * 10))}
          </p>
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            out of {MAX_GAME_SCORE}
          </p>
        </div>
      </div>
    </Card>
  );
}
