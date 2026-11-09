import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUserStats: vi.fn(),
  countEarnedAchievements: vi.fn(),
  listAchievementsForUser: vi.fn(),
  findChallengeByDate: vi.fn(),
  findDailyBest: vi.fn(),
  userModeSummary: vi.fn(),
  userChannelAccuracy: vi.fn(),
  userTrend: vi.fn(),
  userHueRegionAccuracy: vi.fn(),
  listUserHistory: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/db/pg/queries/users", () => ({
  findUserStats: mocks.findUserStats,
}));

vi.mock("@/lib/db/pg/queries/achievements", () => ({
  countEarnedAchievements: mocks.countEarnedAchievements,
  listAchievementsForUser: mocks.listAchievementsForUser,
}));

vi.mock("@/lib/db/pg/queries/daily", () => ({
  findChallengeByDate: mocks.findChallengeByDate,
  findDailyBest: mocks.findDailyBest,
}));

vi.mock("@/lib/db/mongo/aggregations", () => ({
  userModeSummary: mocks.userModeSummary,
  userChannelAccuracy: mocks.userChannelAccuracy,
  userTrend: mocks.userTrend,
  userHueRegionAccuracy: mocks.userHueRegionAccuracy,
}));

vi.mock("@/lib/db/mongo/historyRepo", () => ({
  listUserHistory: mocks.listUserHistory,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.logError },
}));

import { getAchievements, getHistory, getMyStats } from "@/lib/services/statsService";

const NOW = new Date("2026-10-29T09:15:00.000Z");
const TODAY = "2026-10-29";

function primeStats(): void {
  mocks.findUserStats.mockResolvedValue({
    globalBestScore: 24.6,
    globalBestAchievedAt: new Date("2026-10-17T14:32:08.000Z"),
    totalGamesPlayed: 41,
    currentDailyStreak: 4,
    longestDailyStreak: 9,
    lastDailyPlayedDate: "2026-10-28",
  });
  mocks.countEarnedAchievements.mockResolvedValue(6);
  mocks.findChallengeByDate.mockResolvedValue({ challengeId: 118, date: TODAY });
  mocks.findDailyBest.mockResolvedValue({
    score: 25.3,
    achievedAt: new Date("2026-10-29T08:02:11.000Z"),
  });
  mocks.userModeSummary.mockResolvedValue([
    {
      mode: "global",
      games: 2,
      avgScore: 26.85,
      bestScore: 30,
      worstScore: 23.7,
    },
    {
      mode: "daily",
      games: 1,
      avgScore: 18.04,
      bestScore: 18.04,
      worstScore: 18.04,
    },
    {
      mode: "room",
      games: 9,
      avgScore: 12.34,
      bestScore: 20,
      worstScore: 4,
    },
  ]);
  mocks.userChannelAccuracy.mockResolvedValue({
    rounds: 9,
    avgAbsDiff: { h: 31.333, s: 7.777, v: 5 },
  });
  mocks.userTrend.mockResolvedValue([{ bucketStart: "2026-10-01", games: 4, avgScore: 17.94 }]);
  mocks.userHueRegionAccuracy.mockResolvedValue([{ from: 0, to: 30, rounds: 2, avgScore: 8.54 }]);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

describe("getMyStats", () => {
  it("returns Postgres counters and rounded history without room games", async () => {
    primeStats();

    const stats = await getMyStats(7, NOW);

    expect(stats.global).toEqual({
      bestScore: 24.6,
      achievedAt: "2026-10-17T14:32:08.000Z",
    });
    expect(stats.totalGamesPlayed).toBe(41);
    expect(stats.daily).toEqual({
      currentStreak: 4,
      longestStreak: 9,
      lastPlayedDate: "2026-10-28",
      todayBest: 25.3,
    });
    expect(stats.achievementsEarned).toBe(6);
    expect(stats.historyAvailable).toBe(true);
    expect(stats.history?.byMode).toEqual([
      {
        mode: "global",
        games: 2,
        avgScore: 26.9,
        bestScore: 30,
        worstScore: 23.7,
      },
      {
        mode: "daily",
        games: 1,
        avgScore: 18,
        bestScore: 18,
        worstScore: 18,
      },
    ]);
    expect(stats.history?.channelAccuracy).toEqual({
      rounds: 9,
      avgAbsDiff: { h: 31.3, s: 7.8, v: 5 },
    });
    expect(stats.history?.trend).toEqual([{ bucketStart: "2026-10-01", games: 4, avgScore: 17.9 }]);
    expect(stats.history?.hueRegions).toEqual([{ from: 0, to: 30, rounds: 2, avgScore: 8.5 }]);

    expect(mocks.userTrend).toHaveBeenCalledWith(
      7,
      new Date("2026-09-30T00:00:00.000Z"),
      NOW,
      "day",
    );
    expect(mocks.findDailyBest).toHaveBeenCalledWith(7, 118);
  });

  it("displays a lapsed Daily streak as zero but keeps the longest", async () => {
    primeStats();
    mocks.findUserStats.mockResolvedValue({
      globalBestScore: null,
      globalBestAchievedAt: null,
      totalGamesPlayed: 0,
      currentDailyStreak: 4,
      longestDailyStreak: 9,
      lastDailyPlayedDate: "2026-10-01",
    });
    mocks.findChallengeByDate.mockResolvedValue(null);

    const stats = await getMyStats(7, NOW);

    expect(stats.daily.currentStreak).toBe(0);
    expect(stats.daily.longestStreak).toBe(9);
    expect(stats.daily.todayBest).toBeNull();
    expect(mocks.findDailyBest).not.toHaveBeenCalled();
  });

  it("degrades history to null when a Mongo aggregation throws", async () => {
    primeStats();
    mocks.userTrend.mockRejectedValue(new Error("mongo down"));

    const stats = await getMyStats(7, NOW);

    expect(stats.historyAvailable).toBe(false);
    expect(stats.history).toBeNull();
    expect(stats.totalGamesPlayed).toBe(41);
    expect(stats.daily.todayBest).toBe(25.3);
    expect(mocks.logError).toHaveBeenCalledWith(
      "stats_history_unavailable",
      expect.objectContaining({ userId: 7 }),
    );
  });
});

describe("getHistory", () => {
  const ITEM = {
    id: "66f0f0f0f0f0f0f0f0f0f0f0",
    mode: "global" as const,
    playedAt: new Date("2026-10-21T09:15:00.000Z"),
    totalScore: 24.6,
    rounds: [
      {
        roundNumber: 1,
        target: { h: 10, s: 20, v: 30 },
        guess: { h: 11, s: 21, v: 31 },
        score: 9.1,
      },
      {
        roundNumber: 2,
        target: { h: 110, s: 40, v: 50 },
        guess: { h: 111, s: 41, v: 51 },
        score: 8.2,
      },
      {
        roundNumber: 3,
        target: { h: 210, s: 60, v: 70 },
        guess: { h: 211, s: 61, v: 71 },
        score: 7.3,
      },
    ],
  };

  it("serializes dates, forwards the cursor and clamps the page size", async () => {
    mocks.listUserHistory.mockResolvedValue({ items: [ITEM], nextCursor: "next-cursor" });

    const page = await getHistory(7, { limit: 500, cursor: "opaque" });

    expect(mocks.listUserHistory).toHaveBeenCalledWith(7, {
      limit: 100,
      cursor: "opaque",
    });
    expect(page.items[0]?.playedAt).toBe("2026-10-21T09:15:00.000Z");
    expect(page.nextCursor).toBe("next-cursor");
  });

  it("omits the cursor on the first page", async () => {
    mocks.listUserHistory.mockResolvedValue({ items: [], nextCursor: null });

    await getHistory(7, { limit: 20 });

    expect(mocks.listUserHistory).toHaveBeenCalledWith(7, { limit: 20 });
  });
});

describe("getAchievements", () => {
  it("maps earned and locked definitions and serializes earnedAt", async () => {
    mocks.listAchievementsForUser.mockResolvedValue([
      {
        id: 1,
        name: "First Global Game",
        description: "Complete your first Global game.",
        criteriaDescription: "Complete your first Global game.",
        earned: true,
        earnedAt: new Date("2026-10-17T14:32:08.000Z"),
      },
      {
        id: 2,
        name: "Centurion",
        description: "Complete 100 games.",
        criteriaDescription: "Complete 100 games.",
        earned: false,
        earnedAt: null,
      },
    ]);

    const response = await getAchievements(7);

    expect(response.achievements).toEqual([
      {
        id: 1,
        name: "First Global Game",
        description: "Complete your first Global game.",
        criteriaDescription: "Complete your first Global game.",
        earned: true,
        earnedAt: "2026-10-17T14:32:08.000Z",
      },
      {
        id: 2,
        name: "Centurion",
        description: "Complete 100 games.",
        criteriaDescription: "Complete 100 games.",
        earned: false,
        earnedAt: null,
      },
    ]);
  });
});
