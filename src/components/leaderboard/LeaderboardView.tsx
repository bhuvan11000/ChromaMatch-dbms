"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, EmptyState, ErrorMessage, Input, ModeGlyph, Spinner } from "@/components/ui";
import { LEADERBOARD_DEFAULT_LIMIT } from "@/lib/config/constants";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useLeaderboard, type LeaderboardMode } from "@/hooks/useLeaderboard";

import { LeaderboardTable } from "./LeaderboardTable";
import { YourRankCard } from "./YourRankCard";

export interface LeaderboardViewProps {
  mode: LeaderboardMode;
  /** Today in UTC; required by the daily page to keep its picker bounded. */
  todayUtc?: string;
}

const TAB_CLASSES =
  "inline-flex min-h-10 items-center justify-center rounded-[0.6rem] border-2 px-4 py-2 font-display text-xs font-extrabold tracking-[0.05em] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

/**
 * Shared public leaderboard screen — Architecture §5.11.1, §5.11.5.
 *
 * The viewer's `me` row comes from the API, so the page works signed-out and
 * still highlights the signed-in player when they have a score.
 */
export function LeaderboardView({ mode, todayUtc = "" }: LeaderboardViewProps) {
  const [page, setPage] = useState(0);
  const [date, setDate] = useState(todayUtc);
  const query = useLeaderboard({ mode, page, date });

  const entries = query.data?.entries ?? [];
  const me = query.data?.me ?? null;
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / LEADERBOARD_DEFAULT_LIMIT));
  const firstRow = total === 0 ? 0 : page * LEADERBOARD_DEFAULT_LIMIT + 1;
  const lastRow = Math.min((page + 1) * LEADERBOARD_DEFAULT_LIMIT, total);

  const errorMessage =
    query.error instanceof ApiError
      ? query.error.message
      : query.error
        ? "The leaderboard could not be loaded."
        : null;

  function changeDate(nextDate: string) {
    if (!nextDate) return;
    setDate(nextDate);
    setPage(0);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="cm-cabinet cm-rise overflow-hidden p-0">
        <div className="cm-marquee flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5 sm:px-7">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
            High scores // {mode}
          </p>
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/45 uppercase">
            {total === 0 ? "No scores yet" : `${total} ranked`}
          </p>
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <ModeGlyph kind="boards" size="lg" />
            <div className="min-w-0">
              <p className="cm-eyebrow text-muted-foreground">Boards</p>
              <h1 className="cm-stencil mt-1 text-4xl leading-none sm:text-5xl">Leaderboards</h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {mode === "global"
                  ? "Every player's best Global game."
                  : "One palette. One day. One board."}
              </p>
            </div>
          </div>

          <nav aria-label="Leaderboard boards" className="flex flex-wrap gap-2">
            {(["global", "daily"] as const).map((tab) => {
              const active = tab === mode;

              return (
                <Link
                  key={tab}
                  href={`/leaderboard/${tab}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    TAB_CLASSES,
                    active
                      ? "border-border bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-lip)]"
                      : "border-border bg-card text-foreground shadow-[0_3px_0_var(--border-lip)] hover:bg-muted",
                  )}
                >
                  {tab === "global" ? "Global" : "Daily"}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          {mode === "daily" ? (
            <>
              <div className="w-full max-w-56">
                <Input
                  label="Challenge date (UTC)"
                  type="date"
                  max={todayUtc || undefined}
                  value={date}
                  onChange={(event) => changeDate(event.target.value)}
                  hint="Today or earlier."
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeDate(todayUtc)}
                disabled={!todayUtc || date === todayUtc}
              >
                Today
              </Button>
            </>
          ) : (
            <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              Personal bests · all time
            </p>
          )}
        </div>

        {me ? <YourRankCard me={me} className="w-full sm:w-64" /> : null}
      </div>

      <section className="cm-cabinet mt-4 overflow-hidden p-0" aria-labelledby="board-heading">
        <div className="cm-marquee flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5">
          <div>
            <h2
              id="board-heading"
              className="font-display text-sm font-extrabold tracking-tight text-white"
            >
              {mode === "global" ? "Global" : "Daily"}
            </h2>
            <p className="mt-0.5 font-mono text-[8px] tracking-[0.16em] text-white/40 uppercase">
              {mode === "global" ? "All time" : date || "Daily"}
            </p>
          </div>
          <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-white/50 uppercase">
            {total === 0 ? "Empty" : `${total} players`}
          </p>
        </div>

        {query.isPending && (mode === "global" || date) ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 bg-card px-4 py-8 text-center">
            <Spinner size="lg" label="Loading leaderboard" />
            <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
              Reading the board…
            </p>
          </div>
        ) : errorMessage ? (
          <div className="bg-card p-4 sm:p-5">
            <ErrorMessage
              title="Couldn't load the leaderboard"
              message={errorMessage}
              onRetry={() => {
                void query.refetch();
              }}
            />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-card p-4 sm:p-5">
            <EmptyState
              title="No scores on this board yet"
              description={
                mode === "global"
                  ? "Play a Global game to put the first mark on the wall."
                  : "This day has no finished challenge. Try another date."
              }
            />
          </div>
        ) : (
          <div className="cm-screen border-0 px-2 py-2 sm:px-4 sm:py-3">
            <LeaderboardTable entries={entries} me={me} mode={mode} />
          </div>
        )}

        {!query.isPending && !errorMessage && total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border bg-muted/25 px-4 py-3">
            <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
              {firstRow}–{lastRow} of {total}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={page + 1 >= pageCount}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
