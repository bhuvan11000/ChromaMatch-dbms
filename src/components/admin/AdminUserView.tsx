"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AchievementGrid, HistoryList } from "@/components/profile";
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Spinner,
  Wordmark,
  useToast,
} from "@/components/ui";
import { useAdminHistory, useAdminUpdateStats, useAdminUser } from "@/hooks/useAdmin";
import { ApiError } from "@/lib/api-client";

import { AdminGuard } from "./AdminGuard";
import { AdminStatsEditor } from "./AdminStatsEditor";
import { DailyBestsTable } from "./DailyBestsTable";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function StatusBadge({ banned }: { banned: boolean }) {
  return (
    <span
      className={
        banned
          ? "inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-danger uppercase"
          : "inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success-soft px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-success uppercase"
      }
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {banned ? "Banned" : "Active"}
    </span>
  );
}

function AdminUserContent() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const validId = Number.isSafeInteger(userId) && userId > 0;
  const userQuery = useAdminUser(validId ? userId : null);
  const history = useAdminHistory(validId ? userId : null);
  const updateStats = useAdminUpdateStats();
  const { toast } = useToast();

  const historyItems = history.data?.pages.flatMap((page) => page.items) ?? [];

  if (!validId) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorMessage title="Player not found" message="The player id is invalid." />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/admin"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Back to players
          </Link>
        </p>
      </div>
    );
  }

  if (userQuery.isPending) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <Spinner size="lg" label="Loading player" />
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Reading the record…
        </p>
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorMessage
          title="Couldn't load this player"
          message={messageOf(userQuery.error, "The player record could not be loaded.")}
          onRetry={() => {
            void userQuery.refetch();
          }}
        />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/admin"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Back to players
          </Link>
        </p>
      </div>
    );
  }

  const { user, dailyBests, achievements } = userQuery.data;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              Admin · Player record
            </p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight">{user.username}</h1>
              <StatusBadge banned={user.isBanned} />
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                {user.role}
              </span>
            </div>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex min-h-9 items-center rounded-[0.625rem] px-2 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            ← Players
          </Link>
          <Wordmark size="sm" />
        </div>
      </header>

      <section aria-labelledby="admin-stats" className="mt-6">
        <h2 id="admin-stats" className="text-2xl font-bold tracking-tight">
          Stats editor
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Correct counters and personal bests. Changes are logged.
        </p>

        <Card className="mt-4 p-4 sm:p-5">
          <AdminStatsEditor
            key={`${user.id}-${user.globalBestAchievedAt ?? "none"}-${user.lastDailyPlayedDate ?? "none"}`}
            user={user}
            saving={updateStats.isPending}
            error={
              updateStats.error
                ? messageOf(updateStats.error, "The stats could not be saved.")
                : null
            }
            successMessage={updateStats.isSuccess ? "Stats saved." : null}
            onSave={(patch) => {
              updateStats.mutate(
                { userId: user.id, patch },
                {
                  onSuccess: () => {
                    toast({ title: "Player stats updated", variant: "success" });
                  },
                  onError: (error) => {
                    toast({
                      title: "Couldn't save stats",
                      description: messageOf(error, "Check the values and try again."),
                      variant: "error",
                    });
                  },
                },
              );
            }}
          />
        </Card>
      </section>

      <section aria-labelledby="admin-daily" className="mt-8">
        <h2 id="admin-daily" className="text-2xl font-bold tracking-tight">
          Daily bests
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">The last 30 recorded challenge days.</p>

        <Card className="mt-4 overflow-hidden">
          {dailyBests.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="No Daily bests"
                description="This player has not finished a Daily challenge yet."
              />
            </div>
          ) : (
            <DailyBestsTable bests={dailyBests} />
          )}
        </Card>
      </section>

      <section aria-labelledby="admin-achievements" className="mt-8">
        <h2 id="admin-achievements" className="text-2xl font-bold tracking-tight">
          Achievements
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Earned badges only.</p>

        <div className="mt-4">
          {achievements.length === 0 ? (
            <EmptyState
              title="No achievements earned"
              description="This player has not unlocked a badge yet."
            />
          ) : (
            <AchievementGrid achievements={achievements} />
          )}
        </div>
      </section>

      <section aria-labelledby="admin-history" className="mt-8">
        <h2 id="admin-history" className="text-2xl font-bold tracking-tight">
          History
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every recorded game and room attempt, newest first.
        </p>

        <div className="mt-4">
          {history.isPending ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3">
              <Spinner size="lg" label="Loading history" />
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Opening the logbook…
              </p>
            </div>
          ) : history.isError ? (
            <ErrorMessage
              title="Couldn't load history"
              message={messageOf(history.error, "The history could not be loaded.")}
              onRetry={() => {
                void history.refetch();
              }}
            />
          ) : historyItems.length === 0 ? (
            <EmptyState
              title="No games recorded"
              description="Finished games and room attempts will appear here."
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

/** `/admin/users/[id]` — stats editor, daily bests, achievements and history. */
export function AdminUserView() {
  return (
    <AdminGuard>
      <AdminUserContent />
    </AdminGuard>
  );
}
