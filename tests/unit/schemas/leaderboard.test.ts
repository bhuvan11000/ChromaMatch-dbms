import { describe, expect, it } from "vitest";

import { LEADERBOARD_DEFAULT_LIMIT, LEADERBOARD_MAX_LIMIT } from "@/lib/config/constants";
import {
  dailyLeaderboardQuerySchema,
  dailyLeaderboardResponseSchema,
  globalLeaderboardQuerySchema,
  globalLeaderboardResponseSchema,
} from "@/lib/schemas/leaderboard";

describe("leaderboard query schemas (Architecture §5.7.5)", () => {
  it("applies the documented pagination defaults", () => {
    expect(globalLeaderboardQuerySchema.parse({})).toEqual({
      limit: LEADERBOARD_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(dailyLeaderboardQuerySchema.parse({ date: "2026-10-30" })).toEqual({
      limit: LEADERBOARD_DEFAULT_LIMIT,
      offset: 0,
      date: "2026-10-30",
    });
  });

  it("coerces numeric query strings and accepts a capped-by-service limit", () => {
    expect(globalLeaderboardQuerySchema.parse({ limit: "100", offset: "5" })).toEqual({
      limit: 100,
      offset: 5,
    });
    expect(globalLeaderboardQuerySchema.parse({ limit: "150" })).toEqual({
      limit: 150,
      offset: 0,
    });
    expect(LEADERBOARD_MAX_LIMIT).toBe(100);
  });

  it("rejects unknown keys, non-positive limits and negative offsets", () => {
    expect(() => globalLeaderboardQuerySchema.parse({ page: "2" })).toThrow();
    expect(() => globalLeaderboardQuerySchema.parse({ limit: "0" })).toThrow();
    expect(() => globalLeaderboardQuerySchema.parse({ offset: "-1" })).toThrow();
  });

  it("leaves date validity to the service so malformed dates map to INVALID_DATE", () => {
    expect(dailyLeaderboardQuerySchema.parse({ date: "" })).toEqual({
      limit: LEADERBOARD_DEFAULT_LIMIT,
      offset: 0,
      date: "",
    });
  });
});

describe("leaderboard response schemas (Architecture §5.10.5)", () => {
  const entry = {
    rank: 1,
    userId: 7,
    username: "alice",
    score: 24.6,
    achievedAt: "2026-10-30T12:00:00.000Z",
  };

  it("accepts the global and daily envelopes", () => {
    expect(globalLeaderboardResponseSchema.parse({ entries: [entry], total: 1, me: null })).toEqual(
      { entries: [entry], total: 1, me: null },
    );

    expect(
      dailyLeaderboardResponseSchema.parse({
        entries: [entry],
        total: 1,
        me: { rank: 1, score: 24.6 },
        date: "2026-10-30",
      }),
    ).toMatchObject({ date: "2026-10-30" });
  });

  it("rejects missing me, out-of-range scores and malformed dates", () => {
    expect(() => globalLeaderboardResponseSchema.parse({ entries: [entry], total: 1 })).toThrow();
    expect(() =>
      globalLeaderboardResponseSchema.parse({
        entries: [{ ...entry, score: 31 }],
        total: 1,
        me: null,
      }),
    ).toThrow();
    expect(() =>
      dailyLeaderboardResponseSchema.parse({
        entries: [entry],
        total: 1,
        me: null,
        date: "30-10-2026",
      }),
    ).toThrow();
  });
});
