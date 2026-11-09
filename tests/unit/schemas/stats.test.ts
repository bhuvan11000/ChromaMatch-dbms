import { describe, expect, it } from "vitest";

import {
  achievementsResponseSchema,
  historyQuerySchema,
  historyResponseSchema,
  myStatsResponseSchema,
} from "@/lib/schemas/stats";

const STATS = {
  global: {
    bestScore: 24.6,
    achievedAt: "2026-10-17T14:32:08.000Z",
  },
  totalGamesPlayed: 41,
  daily: {
    currentStreak: 3,
    longestStreak: 7,
    lastPlayedDate: "2026-10-20",
    todayBest: 25.3,
  },
  achievementsEarned: 6,
  historyAvailable: true,
  history: {
    byMode: [
      {
        mode: "global",
        games: 30,
        avgScore: 18.4,
        bestScore: 24.6,
        worstScore: 9.1,
      },
    ],
    channelAccuracy: {
      rounds: 123,
      avgAbsDiff: { h: 9.4, s: 7.2, v: 6.8 },
    },
    trend: [{ bucketStart: "2026-10-01", games: 4, avgScore: 17.9 }],
    hueRegions: [{ from: 0, to: 30, rounds: 11, avgScore: 7.3 }],
  },
} as const;

const HISTORY_ITEM = {
  id: "66f0f0f0f0f0f0f0f0f0f0f0",
  mode: "room",
  playedAt: "2026-10-21T09:15:00.000Z",
  totalScore: 22.1,
  roomId: 7,
  attemptNumber: 2,
  rounds: [
    {
      roundNumber: 1,
      colorNumber: 3,
      target: { h: 10, s: 20, v: 30 },
      guess: { h: 11, s: 21, v: 31 },
      score: 9.1,
      timedOut: false,
    },
    {
      roundNumber: 2,
      colorNumber: 1,
      target: { h: 110, s: 40, v: 50 },
      guess: { h: 111, s: 41, v: 51 },
      score: 8.2,
      timedOut: true,
    },
    {
      roundNumber: 3,
      colorNumber: 2,
      target: { h: 210, s: 60, v: 70 },
      guess: { h: 211, s: 61, v: 71 },
      score: 4.8,
      timedOut: false,
    },
  ],
} as const;

describe("stats schemas", () => {
  it("accepts the documented stats response", () => {
    expect(myStatsResponseSchema.parse(STATS)).toEqual(STATS);
  });

  it("accepts a degraded stats response with null history", () => {
    const degraded = { ...STATS, historyAvailable: false, history: null };

    expect(myStatsResponseSchema.parse(degraded).history).toBeNull();
  });

  it("rejects a history payload that disagrees with historyAvailable", () => {
    expect(myStatsResponseSchema.safeParse({ ...STATS, historyAvailable: false }).success).toBe(
      false,
    );
  });

  it("rejects room modes inside the stats byMode block", () => {
    const invalid = {
      ...STATS,
      history: {
        ...STATS.history,
        byMode: [{ ...STATS.history.byMode[0], mode: "room" }],
      },
    };

    expect(myStatsResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("applies the history limit default and rejects unknown query keys", () => {
    expect(historyQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(historyQuerySchema.parse({ limit: "5", cursor: " abc " })).toEqual({
      limit: 5,
      cursor: "abc",
    });
    expect(historyQuerySchema.safeParse({ limit: 5, page: 2 }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
  });

  it("accepts a room history item with color numbers and timeouts", () => {
    expect(
      historyResponseSchema.parse({ items: [HISTORY_ITEM], nextCursor: "opaque-cursor" }),
    ).toEqual({ items: [HISTORY_ITEM], nextCursor: "opaque-cursor" });
  });

  it("rejects a daily history item without a challenge id", () => {
    const daily = { ...HISTORY_ITEM, mode: "daily", roomId: undefined, attemptNumber: undefined };

    expect(historyResponseSchema.safeParse({ items: [daily], nextCursor: null }).success).toBe(
      false,
    );
  });

  it("rejects an achievement whose earned flag and timestamp disagree", () => {
    const response = {
      achievements: [
        {
          id: 1,
          name: "First Global Game",
          description: "Complete your first Global game.",
          criteriaDescription: "Complete your first Global game.",
          earned: true,
          earnedAt: null,
        },
      ],
    };

    expect(achievementsResponseSchema.safeParse(response).success).toBe(false);
  });
});
