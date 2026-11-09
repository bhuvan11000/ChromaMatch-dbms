import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyStats: vi.fn(),
  getHistory: vi.fn(),
  getAchievements: vi.fn(),
}));

vi.mock("@/lib/services/statsService", () => ({
  getMyStats: mocks.getMyStats,
  getHistory: mocks.getHistory,
  getAchievements: mocks.getAchievements,
}));

import { GET as achievementsRoute } from "@/app/api/me/achievements/route";
import { GET as historyRoute } from "@/app/api/me/history/route";
import { GET as statsRoute } from "@/app/api/me/stats/route";
import { signSession } from "@/lib/auth/session";

import { makeGetRequest, resetAuthEnv, sessionCookieHeader, stubAuthEnv } from "../support/auth";

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

const STATS_RESPONSE = {
  global: { bestScore: 24.6, achievedAt: "2026-10-17T14:32:08.000Z" },
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
    byMode: [],
    channelAccuracy: { rounds: 0, avgAbsDiff: { h: 0, s: 0, v: 0 } },
    trend: [],
    hueRegions: [],
  },
};

const HISTORY_RESPONSE = { items: [], nextCursor: null };
const ACHIEVEMENTS_RESPONSE = { achievements: [] };

function errorBody(body: unknown): { error: { code: string } } {
  return body as { error: { code: string } };
}

async function tokenFor(userId: number): Promise<string> {
  return signSession({ userId, role: "player" });
}

describe("GET /api/me/stats", () => {
  it("requires a session", async () => {
    const response = await statsRoute(makeGetRequest("/api/me/stats"), undefined);

    expect(response.status).toBe(401);
    expect(errorBody(await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.getMyStats).not.toHaveBeenCalled();
  });

  it("returns the service response with no-store", async () => {
    mocks.getMyStats.mockResolvedValue(STATS_RESPONSE);
    const token = await tokenFor(7);

    const response = await statsRoute(
      makeGetRequest("/api/me/stats", sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(STATS_RESPONSE);
    expect(mocks.getMyStats).toHaveBeenCalledWith(7, expect.any(Date));
  });
});

describe("GET /api/me/history", () => {
  it("parses limit and cursor and passes the user id", async () => {
    mocks.getHistory.mockResolvedValue(HISTORY_RESPONSE);
    const token = await tokenFor(9);

    const response = await historyRoute(
      makeGetRequest("/api/me/history?limit=5&cursor=opaque-cursor", sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(HISTORY_RESPONSE);
    expect(mocks.getHistory).toHaveBeenCalledWith(9, {
      limit: 5,
      cursor: "opaque-cursor",
    });
  });

  it("applies the default limit", async () => {
    mocks.getHistory.mockResolvedValue(HISTORY_RESPONSE);
    const token = await tokenFor(9);

    await historyRoute(makeGetRequest("/api/me/history", sessionCookieHeader(token)), undefined);

    expect(mocks.getHistory).toHaveBeenCalledWith(9, { limit: 20 });
  });

  it("rejects unknown query keys before calling the service", async () => {
    const token = await tokenFor(9);

    const response = await historyRoute(
      makeGetRequest("/api/me/history?limit=5&page=2", sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(errorBody(await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.getHistory).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    const response = await historyRoute(makeGetRequest("/api/me/history?limit=5"), undefined);

    expect(response.status).toBe(401);
    expect(mocks.getHistory).not.toHaveBeenCalled();
  });
});

describe("GET /api/me/achievements", () => {
  it("requires a session", async () => {
    const response = await achievementsRoute(makeGetRequest("/api/me/achievements"), undefined);

    expect(response.status).toBe(401);
    expect(mocks.getAchievements).not.toHaveBeenCalled();
  });

  it("returns the achievement list", async () => {
    mocks.getAchievements.mockResolvedValue(ACHIEVEMENTS_RESPONSE);
    const token = await tokenFor(7);

    const response = await achievementsRoute(
      makeGetRequest("/api/me/achievements", sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ACHIEVEMENTS_RESPONSE);
    expect(mocks.getAchievements).toHaveBeenCalledWith(7);
  });
});
