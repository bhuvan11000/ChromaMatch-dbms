"use client";

import Link from "next/link";

import { ModeGlyph } from "@/components/ui";
import { Spotlight } from "@/components/ui/Spotlight";
import { useDailyToday, useResetCountdown } from "@/hooks/useDailyToday";

const PLACEHOLDER = "--:--:--";

/**
 * Live Daily card for /home: today's best, streak and reset countdown.
 * The countdown renders a stable placeholder until the first client tick.
 */
export function DailyCard() {
  const query = useDailyToday();
  const { data, dataUpdatedAt, refetch } = query;

  const countdown = useResetCountdown(data, dataUpdatedAt, () => {
    void refetch();
  });

  const todayBest = data?.myBest ? `${data.myBest.score.toFixed(1)}` : null;
  const streak = data?.streak;

  return (
    <Link
      href="/play/daily"
      className="group block h-full min-w-0 rounded-[1.25rem] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <Spotlight color="var(--accent-gold)" className="h-full rounded-[1.25rem]">
        <div className="cm-console-card cm-rise relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] bg-card p-5 transition-transform duration-150 group-hover:-translate-y-1">
          <div aria-hidden="true" className="cm-spectrum-bar absolute inset-x-0 top-0 h-1.5" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <ModeGlyph kind="daily" />
              <div>
                <p className="cm-eyebrow text-muted-foreground">One shared palette</p>
                <h2 className="mt-0.5 text-lg font-extrabold tracking-tight">Daily</h2>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-primary/10 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-primary-ink uppercase">
              <span aria-hidden="true" className="cm-live-dot size-1.5 rounded-full bg-primary" />
              Live
            </span>
          </div>

          {query.isError ? (
            <p className="mt-4 flex-1 text-sm text-muted-foreground">
              Today&rsquo;s stats are unavailable. You can still play.
            </p>
          ) : (
            <>
              <div className="cm-led-well mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-[0.75rem] px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-[var(--screen-muted)] uppercase">
                    Today&rsquo;s best
                  </p>
                  <p className="cm-led-gold mt-0.5 font-display text-4xl leading-none font-extrabold tabular-nums">
                    {query.isPending ? "—" : (todayBest ?? "—")}
                    <span className="ml-1 font-mono text-xs font-medium text-[var(--screen-muted)]">
                      / 30
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-[var(--screen-muted)] uppercase">
                    Streak
                  </p>
                  <p className="mt-0.5 font-display text-xl leading-none font-extrabold text-[var(--screen-fg)] tabular-nums">
                    {query.isPending || !streak ? "—" : streak.current}
                    <span className="ml-1 font-mono text-[9px] font-medium text-[var(--screen-muted)]">
                      {streak && streak.current === 1 ? "day" : "days"}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-[8px] tracking-[0.12em] text-[var(--screen-muted)] uppercase">
                    Best {query.isPending || !streak ? "—" : streak.longest}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-b-2 border-dashed border-border/40 pb-3">
                <span className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  Resets in
                </span>
                <span
                  data-testid="daily-reset-countdown"
                  className="font-mono text-xs font-bold tracking-[0.04em] tabular-nums"
                >
                  {countdown.label ?? PLACEHOLDER}
                </span>
              </div>
            </>
          )}

          <span className="mt-auto inline-flex items-center gap-1.5 pt-3 font-mono text-[10px] font-bold tracking-[0.14em] text-foreground uppercase">
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
        </div>
      </Spotlight>
    </Link>
  );
}
