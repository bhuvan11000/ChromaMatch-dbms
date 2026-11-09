"use client";

import Link from "next/link";

import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  ModeGlyph,
  Spinner,
  Wordmark,
} from "@/components/ui";
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
      <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h2 id={id} className="mt-1 text-2xl font-bold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <ModeGlyph kind="profile" size="md" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              Your station
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight">
              {session.user ? session.user.username : "Profile"}
            </h1>
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

      <section aria-labelledby="profile-overview" className="mt-7">
        <SectionHeading
          id="profile-overview"
          eyebrow="Overview"
          title="Your colours, streaks and badges."
          description="Only Global and Daily games count here. Room attempts stay in your history."
        />

        <div className="mt-4">
          {stats.isPending ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3">
              <Spinner size="lg" label="Loading your stats" />
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
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
              description="Your counters still work. Charts will return when the history store is reachable."
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
              <Card className="min-w-0 p-4 sm:p-5 lg:col-span-2">
                <h3 className="text-sm font-bold tracking-tight">Score trend</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Daily average, last 30 UTC days.
                </p>
                <TrendChart points={stats.data.history.trend} />
              </Card>

              <Card className="min-w-0 p-4 sm:p-5">
                <h3 className="text-sm font-bold tracking-tight">Channel accuracy</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Closeness to the target; lower miss is better.
                </p>
                <AccuracyChart accuracy={stats.data.history.channelAccuracy} />
              </Card>

              <Card className="min-w-0 p-4 sm:p-5">
                <h3 className="text-sm font-bold tracking-tight">Hue regions</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Average round score by target hue.
                </p>
                <HueRegionChart regions={stats.data.history.hueRegions} />
              </Card>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="profile-achievements" className="mt-9">
        <SectionHeading
          id="profile-achievements"
          eyebrow="Badges"
          title="Achievements"
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
            eyebrow="Recent history"
            title="Every run, newest first."
            description="Room attempts are labelled and never feed your stats."
          />
          <Link
            href="/leaderboard/global"
            className="inline-flex min-h-9 items-center rounded-[0.625rem] border border-border bg-card px-3 py-2 font-mono text-[10px] font-bold tracking-[0.12em] text-foreground uppercase transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Global board
          </Link>
        </div>

        <div className="mt-4">
          {history.isPending ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3">
              <Spinner size="lg" label="Loading recent history" />
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
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
