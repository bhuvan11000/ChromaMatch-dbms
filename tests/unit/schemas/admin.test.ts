import { describe, expect, it } from "vitest";

import {
  adminStatsPatchSchema,
  adminUserIdSchema,
  adminUserDetailResponseSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
} from "@/lib/schemas/admin";

describe("admin schemas", () => {
  describe("adminUsersQuerySchema", () => {
    it("applies the documented defaults and parses the banned filter", () => {
      const defaults = adminUsersQuerySchema.parse({});
      expect(defaults.limit).toBe(50);
      expect(defaults.offset).toBe(0);
      expect(defaults.query).toBeUndefined();
      expect(defaults.banned).toBeUndefined();

      expect(adminUsersQuerySchema.parse({ banned: "true" }).banned).toBe(true);
      expect(adminUsersQuerySchema.parse({ banned: "false" }).banned).toBe(false);
    });

    it("coerces pagination and trims the search", () => {
      const parsed = adminUsersQuerySchema.parse({ query: "  alice ", limit: "10", offset: "20" });

      expect(parsed).toMatchObject({ query: "alice", limit: 10, offset: 20 });
    });

    it("rejects unknown keys and malformed filters", () => {
      expect(adminUsersQuerySchema.safeParse({ role: "admin" }).success).toBe(false);
      expect(adminUsersQuerySchema.safeParse({ banned: "yes" }).success).toBe(false);
      expect(adminUsersQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
      expect(adminUsersQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
    });
  });

  describe("adminUserIdSchema", () => {
    it("accepts positive integer ids and rejects everything else", () => {
      expect(adminUserIdSchema.parse("42")).toBe(42);
      expect(adminUserIdSchema.safeParse("0").success).toBe(false);
      expect(adminUserIdSchema.safeParse("1.5").success).toBe(false);
      expect(adminUserIdSchema.safeParse("abc").success).toBe(false);
    });
  });

  describe("adminStatsPatchSchema", () => {
    it("accepts the full allow-list", () => {
      const parsed = adminStatsPatchSchema.parse({
        globalBestScore: 24.5,
        globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
        totalGamesPlayed: 12,
        currentDailyStreak: 3,
        longestDailyStreak: 7,
        lastDailyPlayedDate: "2026-05-01",
      });

      expect(parsed).toEqual({
        globalBestScore: 24.5,
        globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
        totalGamesPlayed: 12,
        currentDailyStreak: 3,
        longestDailyStreak: 7,
        lastDailyPlayedDate: "2026-05-01",
      });
    });

    it("accepts clearing the Global PB with both nulls", () => {
      const parsed = adminStatsPatchSchema.parse({
        globalBestScore: null,
        globalBestAchievedAt: null,
      });

      expect(parsed.globalBestScore).toBeNull();
      expect(parsed.globalBestAchievedAt).toBeNull();
    });

    it("rejects unknown keys with an unrecognized_keys issue", () => {
      const result = adminStatsPatchSchema.safeParse({ role: "admin" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
      }
    });

    it("requires the PB score and timestamp together and null together", () => {
      expect(adminStatsPatchSchema.safeParse({ globalBestScore: 20 }).success).toBe(false);
      expect(adminStatsPatchSchema.safeParse({ globalBestAchievedAt: null }).success).toBe(false);
      expect(
        adminStatsPatchSchema.safeParse({
          globalBestScore: 20,
          globalBestAchievedAt: null,
        }).success,
      ).toBe(false);
    });

    it("rejects out-of-range, non-one-decimal and negative values", () => {
      const invalid = [
        { globalBestScore: 31, globalBestAchievedAt: "2026-05-01T12:34:56.000Z" },
        { globalBestScore: 24.65, globalBestAchievedAt: "2026-05-01T12:34:56.000Z" },
        { totalGamesPlayed: -1 },
        { totalGamesPlayed: 1.5 },
        { currentDailyStreak: -1 },
        { currentDailyStreak: 5, longestDailyStreak: 4 },
        { lastDailyPlayedDate: "not-a-date" },
      ];

      for (const patch of invalid) {
        expect(adminStatsPatchSchema.safeParse(patch).success).toBe(false);
      }
    });
  });

  describe("response schemas", () => {
    const USER = {
      id: 7,
      username: "alice",
      email: "alice@example.com",
      role: "player" as const,
      isBanned: false,
      createdAt: "2026-10-01T12:00:00.000Z",
      globalBestScore: 24.6,
      totalGamesPlayed: 42,
      currentDailyStreak: 3,
      longestDailyStreak: 7,
    };

    it("accepts a list page", () => {
      expect(adminUsersResponseSchema.safeParse({ users: [USER], total: 1 }).success).toBe(true);
    });

    it("accepts a detail page with daily bests and achievements", () => {
      const result = adminUserDetailResponseSchema.safeParse({
        user: {
          ...USER,
          globalBestAchievedAt: "2026-10-01T12:00:00.000Z",
          lastDailyPlayedDate: "2026-10-01",
        },
        dailyBests: [
          {
            date: "2026-10-01",
            bestScore: 25.3,
            achievedAt: "2026-10-01T12:00:00.000Z",
          },
        ],
        achievements: [
          {
            id: 1,
            name: "First game",
            description: "Play once.",
            criteriaDescription: "Play once.",
            earned: true,
            earnedAt: "2026-10-01T12:00:00.000Z",
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });
});
