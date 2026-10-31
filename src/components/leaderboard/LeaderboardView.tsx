"use client";

import Link from "next/link";
import { useState } from "react";

import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Input,
  ModeGlyph,
  Spinner,
  Wordmark,
} from "@/components/ui";
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
  "inline-flex min-h-9 items-center justify-center rounded-[0.625rem] border px-3 py-2 font-display text-xs font-semibold tracking-tight transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

function boardLabel(mode: LeaderboardMode): string {
  return mode === "global" ? "Global board" : "Daily board";
}

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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <ModeGlyph kind="boards" size="md" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              Boards
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight">Leaderboards</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/home"
            className="inline-flex min-h-9 items-center rounded-[0.625rem] px-2 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            ← Home
          </Link>
          <Wordmark size="sm" />
        </div>
      </header>

      <section className="cm-console-card relative mt-6 overflow-hidden rounded-[1.5rem] border border-border bg-card p-5 sm:p-7">
        <div aria-hidden="true" className="cm-spectrum-bar absolute inset-x-0 top-0 h-1.5" />

        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.22em] text-muted-foreground uppercase">
              {mode === "global" ? "All-time board" : "Daily board"}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              {mode === "global"
                ? "The sharpest eyes, ranked."
                : "Same palette. One day. One board."}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              {mode === "global"
                ? "Every player's best Global game, from freshest personal best to all-time top."
                : "Pick a day, see who mixed it best, and find your place in the palette."}
            </p>
          </div>

          <div className="rounded-[1rem] border border-border bg-muted/50 px-3 py-2 text-right">
            <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              {total === 0 ? "No scores" : `${total} ranked`}
            </p>
            <p className="mt-0.5 font-display text-sm font-bold tracking-tight">
              {mode === "global" ? "Global" : date || "Daily"}
            </p>
          </div>
        </div>

        <nav aria-label="Leaderboard boards" className="mt-5 flex flex-wrap gap-2">
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
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {boardLabel(tab)}
              </Link>
            );
          })}
        </nav>
      </section>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              Personal bests · all time
            </p>
          )}
        </div>

        {me ? <YourRankCard me={me} className="w-full p-4 sm:w-64" /> : null}
      </div>

      <Card className="mt-5 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/35 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">{boardLabel(mode)}</h2>
            <p className="text-xs text-muted-foreground">
              {total === 0 ? "No ranked players yet." : `${total} players with a score.`}
            </p>
          </div>
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {mode === "global" ? "All time" : date}
          </p>
        </div>

        <div className="p-3 sm:p-5">
          {query.isPending && (mode === "global" || date) ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <Spinner size="lg" label="Loading leaderboard" />
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Reading the board…
              </p>
            </div>
          ) : errorMessage ? (
            <ErrorMessage
              title="Couldn't load the leaderboard"
              message={errorMessage}
              onRetry={() => {
                void query.refetch();
              }}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              title="No scores on this board yet"
              description={
                mode === "global"
                  ? "Play a Global game to put the first mark on the wall."
                  : "This day has no finished challenge. Try another date."
              }
            />
          ) : (
            <LeaderboardTable entries={entries} me={me} mode={mode} />
          )}
        </div>

        {!query.isPending && !errorMessage && total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/25 px-4 py-3 sm:px-5">
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
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
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Page {page + 1} / {pageCount}
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
      </Card>
    </div>
  );
}
