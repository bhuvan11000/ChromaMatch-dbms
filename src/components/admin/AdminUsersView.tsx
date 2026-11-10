"use client";

import { useEffect, useState } from "react";

import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Input,
  Modal,
  Spinner,
  useToast,
} from "@/components/ui";
import { useAdminSetBan, useAdminUsers } from "@/hooks/useAdmin";
import { useSession } from "@/hooks/useSession";
import { ApiError } from "@/lib/api-client";
import { ADMIN_USERS_DEFAULT_LIMIT } from "@/lib/config/constants";
import type { AdminUserSummary } from "@/lib/schemas/admin";

import { AdminGuard } from "./AdminGuard";
import { AdminUserTable } from "./AdminUserTable";

type BannedFilter = "all" | "active" | "banned";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function AdminUsersContent() {
  const session = useSession();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bannedFilter, setBannedFilter] = useState<BannedFilter>("all");
  const [offset, setOffset] = useState(0);
  const [pendingBan, setPendingBan] = useState<AdminUserSummary | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const banned = bannedFilter === "all" ? undefined : bannedFilter === "banned";
  const usersQuery = useAdminUsers({
    query: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    banned,
    limit: ADMIN_USERS_DEFAULT_LIMIT,
    offset,
  });
  const banMutation = useAdminSetBan();

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + ADMIN_USERS_DEFAULT_LIMIT, total);

  function confirmBanToggle() {
    if (!pendingBan) return;

    const target = pendingBan;
    const nextBanned = !target.isBanned;

    banMutation.mutate(
      { userId: target.id, banned: nextBanned },
      {
        onSuccess: () => {
          setPendingBan(null);
          toast({
            title: nextBanned ? "Player banned" : "Player unbanned",
            description: `${target.username} ${nextBanned ? "is hidden from the boards." : "is back on the boards."}`,
            variant: "success",
          });
        },
        onError: (error) => {
          toast({
            title: "Couldn't update the ban",
            description: messageOf(error, "Check your connection and try again."),
            variant: "error",
          });
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <section className="cm-cabinet overflow-hidden p-0">
        <div className="cm-marquee flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5 sm:px-7">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
            Admin console // Roster
          </p>
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/45 uppercase">
            Admin only
          </p>
        </div>
        <div className="p-5 sm:p-7">
          <p className="cm-eyebrow text-muted-foreground">Player records</p>
          <h1 className="cm-stencil mt-1 text-4xl leading-none sm:text-5xl">Players</h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Search the roster, correct stats and manage bans.
          </p>
        </div>
      </section>

      <section aria-labelledby="admin-filters" className="mt-5">
        <h2 id="admin-filters" className="sr-only">
          Find players
        </h2>
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Input
              label="Search players"
              type="search"
              placeholder="Username or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              hint="Case-insensitive substring search."
            />

            <div className="w-full">
              <label
                htmlFor="admin-banned-filter"
                className="mb-1.5 block font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase"
              >
                Status
              </label>
              <select
                id="admin-banned-filter"
                value={bannedFilter}
                onChange={(event) => {
                  setBannedFilter(event.target.value as BannedFilter);
                  setOffset(0);
                }}
                className="min-h-11 w-full rounded-[0.6rem] border-2 border-input-border bg-input px-3 py-2.5 text-sm font-medium text-foreground shadow-[inset_0_2px_0_rgb(0_0_0/0.12)] transition-colors hover:border-input-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <option value="all">All players</option>
                <option value="active">Active only</option>
                <option value="banned">Banned only</option>
              </select>
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="admin-players" className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="admin-players" className="font-display text-2xl font-extrabold tracking-tight">
              Player list
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {usersQuery.isError
                ? "The player list could not be loaded."
                : usersQuery.data
                  ? `${total} matching player${total === 1 ? "" : "s"}.`
                  : "Loading players…"}
            </p>
          </div>
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
            {usersQuery.data ? `${rangeStart}–${rangeEnd} of ${total}` : "—"}
          </p>
        </div>

        <Card className="mt-4 overflow-hidden">
          {usersQuery.isPending ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6">
              <Spinner size="lg" label="Loading players" />
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Opening the roster…
              </p>
            </div>
          ) : usersQuery.isError ? (
            <div className="p-4 sm:p-5">
              <ErrorMessage
                title="Couldn't load players"
                message={messageOf(usersQuery.error, "The player list could not be loaded.")}
                onRetry={() => {
                  void usersQuery.refetch();
                }}
              />
            </div>
          ) : users.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                title="No players found"
                description="Try a different search or status filter."
              />
            </div>
          ) : (
            <AdminUserTable
              users={users}
              currentUserId={session.user?.id ?? null}
              onToggleBan={setPendingBan}
              busyUserId={banMutation.isPending ? pendingBan?.id : null}
            />
          )}
        </Card>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - ADMIN_USERS_DEFAULT_LIMIT))}
            disabled={offset === 0 || usersQuery.isFetching}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + ADMIN_USERS_DEFAULT_LIMIT)}
            disabled={offset + ADMIN_USERS_DEFAULT_LIMIT >= total || usersQuery.isFetching}
          >
            Next
          </Button>
        </div>
      </section>

      <Modal
        open={pendingBan !== null}
        onClose={() => {
          if (banMutation.isPending) return;
          setPendingBan(null);
          banMutation.reset();
        }}
        title={
          pendingBan
            ? `${pendingBan.isBanned ? "Unban" : "Ban"} ${pendingBan.username}?`
            : "Change ban"
        }
        description={
          pendingBan?.isBanned
            ? "Their scores return to the Global and Daily boards. Nothing was deleted."
            : "Their entries disappear from the Global and Daily boards. All data stays intact."
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setPendingBan(null);
                banMutation.reset();
              }}
              disabled={banMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={pendingBan?.isBanned ? "primary" : "danger"}
              loading={banMutation.isPending}
              onClick={confirmBanToggle}
            >
              {pendingBan?.isBanned ? "Unban player" : "Ban player"}
            </Button>
          </>
        }
      >
        {banMutation.error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageOf(banMutation.error, "The ban could not be updated.")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {pendingBan?.isBanned
              ? "The player can keep playing; only their leaderboard visibility changes."
              : "The player can still sign in and play if banned-player access is enabled."}
          </p>
        )}
      </Modal>
    </div>
  );
}

/** `/admin` — player list, search and ban controls. */
export function AdminUsersView() {
  return (
    <AdminGuard>
      <AdminUsersContent />
    </AdminGuard>
  );
}
