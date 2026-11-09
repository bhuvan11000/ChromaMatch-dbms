import Link from "next/link";

import { Button, formatScoreTenths } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AdminUserSummary } from "@/lib/schemas/admin";

export interface AdminUserTableProps {
  users: AdminUserSummary[];
  currentUserId: number | null;
  onToggleBan: (user: AdminUserSummary) => void;
  busyUserId?: number | null;
}

function score(value: number | null): string {
  return value === null ? "—" : formatScoreTenths(Math.round(value * 10));
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function RoleBadge({ role }: { role: AdminUserSummary["role"] }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase",
        role === "admin"
          ? "border-accent-violet/40 bg-accent-violet/10 text-accent-violet"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {role === "admin" ? "Admin" : "Player"}
    </span>
  );
}

function StatusBadge({ banned }: { banned: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase",
        banned
          ? "border-danger/40 bg-danger-soft text-danger"
          : "border-success/40 bg-success-soft text-success",
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {banned ? "Banned" : "Active"}
    </span>
  );
}

/** Admin player table with protected admin rows — Architecture §5.11.1. */
export function AdminUserTable({
  users,
  currentUserId,
  onToggleBan,
  busyUserId = null,
}: AdminUserTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] border-collapse text-left">
        <caption className="sr-only">Players</caption>
        <thead>
          <tr className="border-b border-border">
            {["Player", "Role", "Status", "Global PB", "Games", "Streak", "Joined", ""].map(
              (label) => (
                <th
                  key={label || "actions"}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 font-mono text-[10px] font-bold tracking-[0.16em] text-muted-foreground uppercase",
                    ["Global PB", "Games", "Streak"].includes(label) && "text-right",
                  )}
                >
                  {label}
                  {label === "" ? <span className="sr-only">Actions</span> : null}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const protectedRow = user.role === "admin" || isSelf;
            const busy = busyUserId === user.id;

            return (
              <tr
                key={user.id}
                data-banned={user.isBanned ? "true" : "false"}
                data-protected={protectedRow ? "true" : "false"}
                className={cn(
                  "border-b border-border/70 last:border-b-0",
                  user.isBanned ? "bg-danger-soft/40" : "hover:bg-muted/40",
                )}
              >
                <td className="px-3 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="truncate font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {user.username}
                      </Link>
                      {isSelf ? (
                        <span className="shrink-0 rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-primary uppercase">
                          You
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-3 py-3">
                  <StatusBadge banned={user.isBanned} />
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm font-bold tabular-nums">
                  {score(user.globalBestScore)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm tabular-nums">
                  {user.totalGamesPlayed}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm tabular-nums">
                  {user.currentDailyStreak} / {user.longestDailyStreak}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground tabular-nums">
                  {date(user.createdAt)}
                </td>
                <td className="px-3 py-3 text-right">
                  {protectedRow ? (
                    <span
                      title="Admins cannot be banned"
                      className="font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase"
                    >
                      Protected
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={user.isBanned ? "outline" : "danger"}
                      onClick={() => onToggleBan(user)}
                      loading={busy}
                      disabled={busy}
                    >
                      {user.isBanned ? "Unban" : "Ban"}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
