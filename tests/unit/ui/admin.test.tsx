import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AdminNavLink,
  AdminStatsEditor,
  AdminUserTable,
  DailyBestsTable,
} from "@/components/admin";
import type { AdminDailyBest, AdminUserDetail, AdminUserSummary } from "@/lib/schemas/admin";

const USER: AdminUserDetail = {
  id: 7,
  username: "alice",
  email: "alice@example.com",
  role: "player",
  isBanned: false,
  createdAt: "2026-10-01T12:00:00.000Z",
  globalBestScore: 24.6,
  globalBestAchievedAt: "2026-10-17T14:32:08.000Z",
  totalGamesPlayed: 41,
  currentDailyStreak: 3,
  longestDailyStreak: 7,
  lastDailyPlayedDate: "2026-10-20",
};

const USERS: AdminUserSummary[] = [
  {
    ...USER,
    id: 1,
    username: "root",
    email: "root@example.com",
    role: "admin",
  },
  USER,
  {
    ...USER,
    id: 8,
    username: "bob",
    email: "bob@example.com",
    isBanned: true,
    globalBestScore: null,
  },
];

const BESTS: AdminDailyBest[] = [
  { date: "2026-10-20", bestScore: 25.3, achievedAt: "2026-10-20T08:00:00.000Z" },
];

describe("admin UI components", () => {
  it("hides admin navigation from non-admins", () => {
    expect(renderToStaticMarkup(<AdminNavLink role={null} />)).toBe("");
    expect(renderToStaticMarkup(<AdminNavLink role="player" />)).toBe("");

    const adminMarkup = renderToStaticMarkup(<AdminNavLink role="admin" />);
    expect(adminMarkup).toContain('href="/admin"');
    expect(adminMarkup).toContain("Admin");
  });

  it("renders player rows, status labels, ban controls and protected admins", () => {
    const markup = renderToStaticMarkup(
      <AdminUserTable users={USERS} currentUserId={1} onToggleBan={() => {}} />,
    );

    expect(markup).toContain('href="/admin/users/7"');
    expect(markup).toContain("alice@example.com");
    expect(markup).toContain('data-banned="true"');
    expect(markup).toContain('data-protected="true"');
    expect(markup).toContain("Banned");
    expect(markup).toContain("Active");
    expect(markup).toContain(">Ban<");
    expect(markup).toContain(">Unban<");
    expect(markup).toContain("Protected");
    expect(markup).toContain("You");
    expect(markup).toContain("24.6");
  });

  it("renders the stats editor with the current values and API errors", () => {
    const markup = renderToStaticMarkup(
      <AdminStatsEditor
        user={USER}
        saving={false}
        error="The stats could not be saved."
        onSave={() => {}}
      />,
    );

    expect(markup).toContain("Global PB score");
    expect(markup).toContain("Global PB achieved at");
    expect(markup).toContain("Total games played");
    expect(markup).toContain("Current Daily streak");
    expect(markup).toContain("Longest Daily streak");
    expect(markup).toContain("Last Daily played");
    expect(markup).toContain('value="24.6"');
    expect(markup).toContain('value="41"');
    expect(markup).toContain("The stats could not be saved.");
    expect(markup).toContain("Save stats");
  });

  it("renders recent daily bests with dates and one-decimal scores", () => {
    const markup = renderToStaticMarkup(<DailyBestsTable bests={BESTS} />);

    expect(markup).toContain("2026-10-20");
    expect(markup).toContain("25.3");
    expect(markup).toContain("UTC");
  });
});
