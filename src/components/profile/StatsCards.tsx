import { Card, formatScoreTenths } from "@/components/ui";
import type { MyStatsResponse } from "@/lib/schemas/stats";

function score(value: number | null): string {
  return value === null ? "—" : formatScoreTenths(Math.round(value * 10));
}

function date(value: string | null): string {
  return value === null ? "No PB yet" : value.slice(0, 10);
}

export interface StatsCardsProps {
  stats: MyStatsResponse;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <dt className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 font-display text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </dd>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

/** Four headline counters from `GET /api/me/stats` — Architecture §5.7.6. */
export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Global PB"
        value={score(stats.global.bestScore)}
        detail={date(stats.global.achievedAt)}
      />
      <Stat label="Games played" value={String(stats.totalGamesPlayed)} detail="Global + Daily" />
      <Stat
        label="Daily streak"
        value={`${stats.daily.currentStreak} / ${stats.daily.longestStreak}`}
        detail="Current / longest"
      />
      <Stat
        label="Today's Daily"
        value={score(stats.daily.todayBest)}
        detail={
          stats.daily.lastPlayedDate ? `Last played ${stats.daily.lastPlayedDate}` : "No run yet"
        }
      />
    </dl>
  );
}
