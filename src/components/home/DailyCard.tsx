"use client";

import Link from "next/link";

import { Card, ModeGlyph } from "@/components/ui";
import { useDailyToday, useResetCountdown } from "@/hooks/useDailyToday";

const PLACEHOLDER = "--:--:--";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-base font-bold tracking-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * Live Daily card for /home: today's best, streak and the reset countdown.
 * The countdown renders a stable placeholder until the first client tick.
 */
export function DailyCard() {
  const query = useDailyToday();
  const { data, dataUpdatedAt, refetch } = query;

  const countdown = useResetCountdown(data, dataUpdatedAt, () => {
    void refetch();
  });

  return (
    <Link
      href="/play/daily"
      className="group block min-w-0 rounded-[1.25rem] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <Card
        interactive
        elevated
        className="relative flex h-full min-w-0 flex-col overflow-hidden p-5 pt-6 ring-1 ring-primary/30"
      >
        <div aria-hidden="true" className="cm-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <div className="flex items-start justify-between gap-2">
          <ModeGlyph kind="daily" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] text-primary uppercase">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
            Live
          </span>
        </div>

        <h2 className="mt-4 text-lg font-bold tracking-tight">Daily</h2>
        <p className="mt-1 text-sm text-muted-foreground">Same palette for everyone, every day.</p>

        {query.isError ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Today&rsquo;s stats are unavailable right now. You can still play.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            <Stat
              label="Today"
              value={
                query.isPending
                  ? "…"
                  : data?.myBest
                    ? `${data.myBest.score.toFixed(1)} / 30`
                    : "No run yet"
              }
            />
            <Stat
              label="Streak"
              value={
                query.isPending || !data
                  ? "…"
                  : `${data.streak.current} · best ${data.streak.longest}`
              }
            />
            <div className="col-span-2">
              <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                Resets in
              </dt>
              <dd
                data-testid="daily-reset-countdown"
                className="mt-0.5 font-mono text-sm font-bold tabular-nums"
              >
                {countdown.label ?? PLACEHOLDER}
              </dd>
            </div>
          </dl>
        )}

        <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.16em] text-foreground uppercase">
          Play today
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
            <path
              d="M4.5 10h10M10.5 6 14.5 10l-4 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </Card>
    </Link>
  );
}
