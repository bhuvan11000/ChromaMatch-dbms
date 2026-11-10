import { formatScoreTenths } from "@/components/ui";
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

interface StatProps {
  index: string;
  label: string;
  value: string;
  detail: string;
  accent: string;
}

function Stat({ index, label, value, detail, accent }: StatProps) {
  return (
    <div className="cm-console-card relative min-w-0 overflow-hidden rounded-[0.9rem] bg-card p-4">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <dt className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </dt>
        <span className="font-mono text-[8px] font-bold tracking-[0.12em] text-muted-foreground/60">
          {index}
        </span>
      </div>
      <dd className="mt-2 font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
        {value}
      </dd>
      <p className="mt-2 border-t border-dashed border-border/40 pt-2 font-mono text-[9px] tracking-[0.08em] text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

/** Four headline counters from `GET /api/me/stats` — Architecture §5.7.6. */
export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        index="01"
        label="Global PB"
        value={score(stats.global.bestScore)}
        detail={date(stats.global.achievedAt)}
        accent="bg-accent-cyan"
      />
      <Stat
        index="02"
        label="Games played"
        value={String(stats.totalGamesPlayed)}
        detail="Global + Daily"
        accent="bg-accent-gold"
      />
      <Stat
        index="03"
        label="Daily streak"
        value={`${stats.daily.currentStreak} / ${stats.daily.longestStreak}`}
        detail="Current / longest"
        accent="bg-accent-violet"
      />
      <Stat
        index="04"
        label="Today's Daily"
        value={score(stats.daily.todayBest)}
        detail={
          stats.daily.lastPlayedDate ? `Last played ${stats.daily.lastPlayedDate}` : "No run yet"
        }
        accent="bg-primary"
      />
    </dl>
  );
}
