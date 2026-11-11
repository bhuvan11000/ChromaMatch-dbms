"use client";

import Link from "next/link";

import { Barcode, Button, EmptyState, ErrorMessage, Spinner } from "@/components/ui";
import { useMyAchievements, useHistory, useMyStats } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { ApiError } from "@/lib/api-client";

import { AccuracyChart } from "./AccuracyChart";
import { AchievementGrid } from "./AchievementGrid";
import { HistoryList } from "./HistoryList";
import { HueRegionChart } from "./HueRegionChart";
import { StatsCards } from "./StatsCards";
import { TrendChart } from "./TrendChart";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : error ? fallback : "";
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="min-w-0">
      <p className="cm-eyebrow text-muted-foreground">{eyebrow}</p>
      <h2 id={id} className="mt-1 font-display text-2xl font-extrabold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function PanelHeader({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b-2 border-border bg-muted/35 px-4 py-2.5">
      <div>
        <h3 className="font-display text-sm font-extrabold tracking-tight">{title}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
      </div>
      <span className="font-mono text-[8px] font-bold tracking-[0.12em] text-muted-foreground/60">
        {index}
      </span>
    </div>
  );
}

/** Profile screen — Architecture §5.11.1. */
export function ProfileView() {
  const session = useSession();
  const stats = useMyStats();
  const achievements = useMyAchievements();
  const history = useHistory();

  const historyItems = history.data?.pages.flatMap((page) => page.items) ?? [];
  const earnedCount = stats.data?.achievementsEarned ?? 0;
  const achievementCount = achievements.data?.achievements.length ?? 0;
  const user = session.user;
  const initial = user?.username.slice(0, 1).toUpperCase() ?? "?";
  const memberSince = user?.createdAt ? user.createdAt.slice(0, 4) : "—";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <section className="cm-cabinet cm-rise overflow-hidden p-0">
        <div className="cm-marquee flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5 sm:px-7">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
            Player card // Station 01
          </p>
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/45 uppercase">
            {user?.role ?? "player"}
          </p>
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-7 md:flex-row md:items-center">
          <div
            aria-hidden="true"
            className="grid size-20 shrink-0 place-items-center rounded-[0.9rem] border-2 border-border bg-primary font-display text-4xl font-extrabold text-primary-foreground shadow-[0_4px_0_var(--primary-lip)]"
          >
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <p className="cm-eyebrow text-muted-foreground">Player 1</p>
            <h1 className="mt-1 truncate font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              {user?.username ?? "Profile"}
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Your colours, streaks and badges. Only Global and Daily games count here.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <span className="cm-sticker rotate-1 text-primary-ink">P1 · Ready</span>
            <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
              Member since {memberSince}
            </p>
            <Barcode value={String(user?.id ?? "0000")} className="mt-1" />
          </div>
        </div>
      </section>

      <section aria-labelledby="profile-overview" className="mt-7">
        <SectionHeading
          id="profile-overview"
          eyebrow="Stats"
          title="Your numbers."
          description="Personal bests, games played and the current Daily streak."
        />

        <div className="mt-4">
          {stats.isPending ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3">
              <Spinner size="lg" label="Loading your stats" />
              <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                Reading the counters…
              </p>
            </div>
          ) : stats.isError ? (
            <ErrorMessage
              title="Couldn't load your stats"
              message={messageOf(stats.error, "Your stats could not be loaded.")}
              onRetry={() => {
                void stats.refetch();
              }}
            />
          ) : stats.data ? (
            <StatsCards stats={stats.data} />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="profile-insights" className="mt-9">
        <SectionHeading
          id="profile-insights"
          eyebrow="History insights"
          title="How your eye is sharpening."
          description="Scores and accuracy from finished Global and Daily games."
        />

        <div className="mt-4">
          {stats.isPending ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner size="lg" label="Loading history insights" />
            </div>
          ) : stats.isError ? null : stats.data && !stats.data.historyAvailable ? (
            <EmptyState
              title="History insights are offline"
              description="Your counters still work. Charts return when the history store is reachable."
            />
          ) : stats.data?.history &&
            stats.data.history.byMode.length === 0 &&
            stats.data.history.trend.length === 0 &&
            stats.data.history.channelAccuracy.rounds === 0 &&
            stats.data.history.hueRegions.length === 0 ? (
            <EmptyState
              title="No finished games yet"
              description="Play a Global or Daily game to start drawing your trend."
            />
          ) : stats.data?.history ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="cm-console-card overflow-hidden rounded-[1rem] bg-card lg:col-span-2">
                <PanelHeader
                  index="CHART 01"
                  title="Score trend"
                  note="Daily average, last 30 UTC days."
                />
                <div className="p-4 sm:p-5">
                  <TrendChart points={stats.data.history.trend} />
                </div>
              </div>

              <div className="cm-console-card overflow-hidden rounded-[1rem] bg-card">
                <PanelHeader
                  index="CHART 02"
                  title="Channel accuracy"
                  note="Closeness to the target."
                />
                <div className="p-4 sm:p-5">
                  <AccuracyChart accuracy={stats.data.history.channelAccuracy} />
                </div>
              </div>

              <div className="cm-console-card overflow-hidden rounded-[1rem] bg-card">
                <PanelHeader
                  index="CHART 03"
                  title="Hue regions"
                  note="Average round score by target hue."
                />
                <div className="p-4 sm:p-5">
                  <HueRegionChart regions={stats.data.history.hueRegions} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="profile-achievements" className="mt-9">
        <SectionHeading
          id="profile-achievements"
          eyebrow="Badges"
          title="Trophy cabinet"
          description={
            stats.data && achievementCount > 0
              ? `${earnedCount} of ${achievementCount} earned.`
              : "Every badge, earned or waiting."
          }
        />

        <div className="mt-4">
          {achievements.isPending ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spinner size="lg" label="Loading achievements" />
            </div>
          ) : achievements.isError ? (
            <ErrorMessage
              title="Couldn't load achievements"
              message={messageOf(achievements.error, "Achievements could not be loaded.")}
              onRetry={() => {
                void achievements.refetch();
              }}
            />
          ) : achievements.data && achievements.data.achievements.length === 0 ? (
            <EmptyState
              title="No achievements defined yet"
              description="The trophy cabinet is waiting for its first badge."
            />
          ) : achievements.data ? (
            <AchievementGrid achievements={achievements.data.achievements} />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="profile-history" className="mt-9">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading
            id="profile-history"
            eyebrow="Logbook"
            title="Every run, newest first."
            description="Room attempts are labelled and never feed your stats."
          />
          <Link
            href="/leaderboard/global"
            className="cm-keycap cm-keycap-outline inline-flex min-h-9 items-center rounded-[0.55rem] border-border bg-card px-3 py-1.5 font-mono text-[9px] font-bold tracking-[0.12em] text-foreground uppercase hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Global board
          </Link>
        </div>

        <div className="mt-4">
          {history.isPending ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3">
              <Spinner size="lg" label="Loading recent history" />
              <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                Opening the logbook…
              </p>
            </div>
          ) : history.isError ? (
            <ErrorMessage
              title="Couldn't load your history"
              message={messageOf(history.error, "Your history could not be loaded.")}
              onRetry={() => {
                void history.refetch();
              }}
            />
          ) : historyItems.length === 0 ? (
            <EmptyState
              title="No games recorded yet"
              description="Finish a game and it will land here with every round."
            />
          ) : (
            <>
              <HistoryList items={historyItems} />

              {history.hasNextPage ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      void history.fetchNextPage();
                    }}
                    loading={history.isFetchingNextPage}
                    disabled={history.isFetchingNextPage}
                  >
                    {history.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : (
                <p className="mt-4 text-center font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                  End of the logbook
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
