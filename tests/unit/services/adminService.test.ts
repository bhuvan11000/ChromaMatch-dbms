import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  findAdminUser: vi.fn(),
  listDailyBestsForUser: vi.fn(),
  listAchievementsForUser: vi.fn(),
  adminSetBan: vi.fn(),
  adminUpdateUserStats: vi.fn(),
  getHistory: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("@/lib/db/pg/queries/admin", () => ({
  listAdminUsers: mocks.listAdminUsers,
  findAdminUser: mocks.findAdminUser,
  listDailyBestsForUser: mocks.listDailyBestsForUser,
}));

vi.mock("@/lib/db/pg/queries/achievements", () => ({
  listAchievementsForUser: mocks.listAchievementsForUser,
}));

vi.mock("@/lib/db/pg/functions", () => ({
  adminSetBan: mocks.adminSetBan,
  adminUpdateUserStats: mocks.adminUpdateUserStats,
}));

vi.mock("@/lib/services/statsService", () => ({
  getHistory: mocks.getHistory,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.logInfo },
}));

import { AppError } from "@/lib/errors";
import {
  getUser,
  getUserHistory,
  listUsers,
  setBan,
  updateUserStats,
} from "@/lib/services/adminService";

const USER = {
  id: 7,
  username: "alice",
  email: "alice@example.com",
  role: "player" as const,
  isBanned: false,
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  globalBestScore: 24.6,
  globalBestAchievedAt: new Date("2026-10-17T14:32:08.000Z"),
  totalGamesPlayed: 41,
  currentDailyStreak: 3,
  longestDailyStreak: 7,
  lastDailyPlayedDate: "2026-10-20",
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

describe("adminService.listUsers", () => {
  it("clamps the page size and maps the list response", async () => {
    mocks.listAdminUsers.mockResolvedValue({ users: [USER], total: 1 });

    const page = await listUsers({
      query: "alice",
      banned: false,
      limit: 500,
      offset: 10,
    });

    expect(mocks.listAdminUsers).toHaveBeenCalledWith({
      query: "alice",
      banned: false,
      limit: 100,
      offset: 10,
    });
    expect(page).toEqual({
      users: [
        {
          id: 7,
          username: "alice",
          email: "alice@example.com",
          role: "player",
          isBanned: false,
          createdAt: "2026-10-01T12:00:00.000Z",
          globalBestScore: 24.6,
          totalGamesPlayed: 41,
          currentDailyStreak: 3,
          longestDailyStreak: 7,
        },
      ],
      total: 1,
    });
  });

  it("drops an empty search string", async () => {
    mocks.listAdminUsers.mockResolvedValue({ users: [], total: 0 });

    await listUsers({ query: "", limit: 50, offset: 0 });

    expect(mocks.listAdminUsers).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });
});

describe("adminService.getUser", () => {
  it("returns the full row, recent daily bests and earned achievements only", async () => {
    mocks.findAdminUser.mockResolvedValue(USER);
    mocks.listDailyBestsForUser.mockResolvedValue([
      { date: "2026-10-20", bestScore: 25.3, achievedAt: new Date("2026-10-20T08:00:00.000Z") },
    ]);
    mocks.listAchievementsForUser.mockResolvedValue([
      {
        id: 1,
        name: "First game",
        description: "Play once.",
        criteriaDescription: "Play once.",
        earned: true,
        earnedAt: new Date("2026-10-17T14:32:08.000Z"),
      },
      {
        id: 2,
        name: "Centurion",
        description: "Play 100 games.",
        criteriaDescription: "Play 100 games.",
        earned: false,
        earnedAt: null,
      },
    ]);

    const detail = await getUser(7);

    expect(detail.user).toEqual({
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
    });
    expect(detail.dailyBests).toEqual([
      {
        date: "2026-10-20",
        bestScore: 25.3,
        achievedAt: "2026-10-20T08:00:00.000Z",
      },
    ]);
    expect(detail.achievements).toEqual([
      {
        id: 1,
        name: "First game",
        description: "Play once.",
        criteriaDescription: "Play once.",
        earned: true,
        earnedAt: "2026-10-17T14:32:08.000Z",
      },
    ]);
    expect(mocks.listDailyBestsForUser).toHaveBeenCalledWith(7, 30);
  });

  it("throws USER_NOT_FOUND without reading related data", async () => {
    mocks.findAdminUser.mockResolvedValue(null);

    await expect(getUser(404)).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    expect(mocks.listDailyBestsForUser).not.toHaveBeenCalled();
    expect(mocks.listAchievementsForUser).not.toHaveBeenCalled();
  });
});

describe("adminService.getUserHistory", () => {
  it("verifies the target and delegates to the shared history reader", async () => {
    mocks.findAdminUser.mockResolvedValue(USER);
    mocks.getHistory.mockResolvedValue({ items: [], nextCursor: null });

    const page = await getUserHistory(7, { limit: 20 });

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(mocks.getHistory).toHaveBeenCalledWith(7, { limit: 20 });
  });

  it("rejects a missing target", async () => {
    mocks.findAdminUser.mockResolvedValue(null);

    await expect(getUserHistory(404, { limit: 20 })).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
    expect(mocks.getHistory).not.toHaveBeenCalled();
  });
});

describe("adminService.updateUserStats", () => {
  it("maps the camelCase patch, calls the procedure once and logs the action", async () => {
    mocks.adminUpdateUserStats.mockResolvedValue(undefined);
    mocks.findAdminUser.mockResolvedValue({ ...USER, totalGamesPlayed: 12 });

    const result = await updateUserStats(1, 7, {
      globalBestScore: 24.5,
      globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
      totalGamesPlayed: 12,
      currentDailyStreak: 3,
      longestDailyStreak: 7,
      lastDailyPlayedDate: "2026-05-01",
    });

    expect(mocks.adminUpdateUserStats).toHaveBeenCalledTimes(1);
    expect(mocks.adminUpdateUserStats).toHaveBeenCalledWith({
      adminId: 1,
      targetId: 7,
      patch: {
        global_best_score: 24.5,
        global_best_achieved_at: "2026-05-01T12:34:56.000Z",
        total_games_played: 12,
        current_daily_streak: 3,
        longest_daily_streak: 7,
        last_daily_played_date: "2026-05-01",
      },
    });
    expect(mocks.logInfo).toHaveBeenCalledWith("admin_action", {
      admin: 1,
      target: 7,
      action: "update_stats",
      patch: {
        globalBestScore: 24.5,
        globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
        totalGamesPlayed: 12,
        currentDailyStreak: 3,
        longestDailyStreak: 7,
        lastDailyPlayedDate: "2026-05-01",
      },
    });
    expect(result.user.totalGamesPlayed).toBe(12);
  });

  it("does not log when the procedure rejects the patch", async () => {
    mocks.adminUpdateUserStats.mockRejectedValue(new AppError("INVALID_PATCH"));

    await expect(updateUserStats(1, 7, { totalGamesPlayed: 3 })).rejects.toMatchObject({
      code: "INVALID_PATCH",
    });
    expect(mocks.logInfo).not.toHaveBeenCalled();
    expect(mocks.findAdminUser).not.toHaveBeenCalled();
  });

  it("rejects unknown keys before calling the procedure", async () => {
    await expect(
      updateUserStats(1, 7, { role: "admin" } as unknown as { totalGamesPlayed: number }),
    ).rejects.toMatchObject({ code: "INVALID_PATCH" });

    expect(mocks.adminUpdateUserStats).not.toHaveBeenCalled();
    expect(mocks.logInfo).not.toHaveBeenCalled();
  });
});

describe("adminService.setBan", () => {
  it("calls the procedure once, logs and returns the updated user", async () => {
    mocks.adminSetBan.mockResolvedValue(undefined);
    mocks.findAdminUser.mockResolvedValue({ ...USER, isBanned: true });

    const result = await setBan(1, 7, true);

    expect(mocks.adminSetBan).toHaveBeenCalledWith({ adminId: 1, targetId: 7, banned: true });
    expect(mocks.logInfo).toHaveBeenCalledWith("admin_action", {
      admin: 1,
      target: 7,
      action: "ban",
    });
    expect(result.user.isBanned).toBe(true);
  });

  it("logs an unban distinctly", async () => {
    mocks.adminSetBan.mockResolvedValue(undefined);
    mocks.findAdminUser.mockResolvedValue(USER);

    await setBan(1, 7, false);

    expect(mocks.logInfo).toHaveBeenCalledWith("admin_action", {
      admin: 1,
      target: 7,
      action: "unban",
    });
  });
});
