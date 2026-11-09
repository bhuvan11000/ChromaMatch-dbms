import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  getUserHistory: vi.fn(),
  updateUserStats: vi.fn(),
  setBan: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("@/lib/services/adminService", () => ({
  listUsers: mocks.listUsers,
  getUser: mocks.getUser,
  getUserHistory: mocks.getUserHistory,
  updateUserStats: mocks.updateUserStats,
  setBan: mocks.setBan,
}));

vi.mock("@/lib/db/pg/queries/users", () => ({
  findById: mocks.findById,
}));

import { GET as listRoute } from "@/app/api/admin/users/route";
import { GET as detailRoute } from "@/app/api/admin/users/[id]/route";
import { GET as historyRoute } from "@/app/api/admin/users/[id]/history/route";
import { PATCH as statsRoute } from "@/app/api/admin/users/[id]/stats/route";
import { POST as banRoute } from "@/app/api/admin/users/[id]/ban/route";
import { POST as unbanRoute } from "@/app/api/admin/users/[id]/unban/route";
import { signSession } from "@/lib/auth/session";

import {
  makeGetRequest,
  makeJsonRequest,
  resetAuthEnv,
  sessionCookieHeader,
  stubAuthEnv,
} from "../support/auth";

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

const PLAYER_ROW = {
  id: 1,
  username: "admin-hint",
  email: "admin-hint@example.com",
  role: "player" as const,
  isBanned: false,
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
};

const ADMIN_ROW = {
  ...PLAYER_ROW,
  id: 1,
  username: "root",
  email: "root@example.com",
  role: "admin" as const,
};

const USER = {
  id: 7,
  username: "alice",
  email: "alice@example.com",
  role: "player" as const,
  isBanned: false,
  createdAt: "2026-10-01T12:00:00.000Z",
  globalBestScore: 24.6,
};

const DETAIL = {
  user: {
    ...USER,
    globalBestAchievedAt: null,
    lastDailyPlayedDate: null,
  },
  dailyBests: [],
  achievements: [],
};

const LIST = { users: [USER], total: 1 };

function context(id = "7"): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function adminToken(): Promise<Record<string, string>> {
  mocks.findById.mockResolvedValue(ADMIN_ROW);
  const token = await signSession({ userId: 1, role: "admin" });
  return sessionCookieHeader(token);
}

async function errorCode(response: Response): Promise<string> {
  return (await response.json()).error.code as string;
}

describe("admin route authorization", () => {
  it("returns 403 on every admin route for a DB player with an admin role hint", async () => {
    mocks.findById.mockResolvedValue(PLAYER_ROW);
    const token = await signSession({ userId: 1, role: "admin" });
    const headers = sessionCookieHeader(token);
    const validPatch = {
      globalBestScore: 20,
      globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
    };

    const responses = await Promise.all([
      listRoute(makeGetRequest("/api/admin/users", headers), undefined),
      detailRoute(makeGetRequest("/api/admin/users/7", headers), context()),
      historyRoute(makeGetRequest("/api/admin/users/7/history", headers), context()),
      statsRoute(
        makeJsonRequest("/api/admin/users/7/stats", "PATCH", validPatch, headers),
        context(),
      ),
      banRoute(makeJsonRequest("/api/admin/users/7/ban", "POST", undefined, headers), context()),
      unbanRoute(
        makeJsonRequest("/api/admin/users/7/unban", "POST", undefined, headers),
        context(),
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("FORBIDDEN");
    }

    for (const mock of [
      mocks.listUsers,
      mocks.getUser,
      mocks.getUserHistory,
      mocks.updateUserStats,
      mocks.setBan,
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("requires a session", async () => {
    const response = await listRoute(makeGetRequest("/api/admin/users"), undefined);

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHENTICATED");
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/users", () => {
  it("parses search, banned and pagination and returns the page", async () => {
    const headers = await adminToken();
    mocks.listUsers.mockResolvedValue(LIST);

    const response = await listRoute(
      makeGetRequest("/api/admin/users?query=alice&banned=true&limit=10&offset=20", headers),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(LIST);
    expect(mocks.listUsers).toHaveBeenCalledWith({
      query: "alice",
      banned: true,
      limit: 10,
      offset: 20,
    });
  });

  it("rejects unknown query keys before calling the service", async () => {
    const headers = await adminToken();

    const response = await listRoute(
      makeGetRequest("/api/admin/users?limit=10&page=2", headers),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });
});

describe("admin user detail and history routes", () => {
  it("parses the id and returns the detail", async () => {
    const headers = await adminToken();
    mocks.getUser.mockResolvedValue(DETAIL);

    const response = await detailRoute(makeGetRequest("/api/admin/users/7", headers), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DETAIL);
    expect(mocks.getUser).toHaveBeenCalledWith(7);
  });

  it("rejects a malformed id", async () => {
    const headers = await adminToken();

    const response = await detailRoute(
      makeGetRequest("/api/admin/users/abc", headers),
      context("abc"),
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("parses history pagination and cursor", async () => {
    const headers = await adminToken();
    mocks.getUserHistory.mockResolvedValue({ items: [], nextCursor: null });

    const response = await historyRoute(
      makeGetRequest("/api/admin/users/7/history?limit=5&cursor=abc", headers),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.getUserHistory).toHaveBeenCalledWith(7, { limit: 5, cursor: "abc" });
  });
});

describe("PATCH /api/admin/users/:id/stats", () => {
  it("passes the camelCase patch to the service", async () => {
    const headers = await adminToken();
    const body = {
      globalBestScore: 20,
      globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
      totalGamesPlayed: 5,
      currentDailyStreak: 2,
      longestDailyStreak: 4,
      lastDailyPlayedDate: "2026-05-01",
    };
    mocks.updateUserStats.mockResolvedValue({ user: DETAIL.user });

    const response = await statsRoute(
      makeJsonRequest("/api/admin/users/7/stats", "PATCH", body, headers),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateUserStats).toHaveBeenCalledWith(1, 7, body);
  });

  it("maps an unknown key to INVALID_PATCH", async () => {
    const headers = await adminToken();

    const response = await statsRoute(
      makeJsonRequest("/api/admin/users/7/stats", "PATCH", { role: "admin" }, headers),
      context(),
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("INVALID_PATCH");
    expect(mocks.updateUserStats).not.toHaveBeenCalled();
  });

  it("maps invalid values to VALIDATION_ERROR", async () => {
    const headers = await adminToken();

    const response = await statsRoute(
      makeJsonRequest(
        "/api/admin/users/7/stats",
        "PATCH",
        { globalBestScore: 31, globalBestAchievedAt: "2026-05-01T12:34:56.000Z" },
        headers,
      ),
      context(),
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    expect(mocks.updateUserStats).not.toHaveBeenCalled();
  });

  it("rejects a lone PB score", async () => {
    const headers = await adminToken();

    const response = await statsRoute(
      makeJsonRequest("/api/admin/users/7/stats", "PATCH", { globalBestScore: 20 }, headers),
      context(),
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("VALIDATION_ERROR");
  });
});

describe("ban and unban routes", () => {
  it("calls setBan with true and false", async () => {
    const headers = await adminToken();
    mocks.setBan.mockResolvedValue({ user: DETAIL.user });

    const banned = await banRoute(
      makeJsonRequest("/api/admin/users/7/ban", "POST", undefined, headers),
      context(),
    );
    const unbanned = await unbanRoute(
      makeJsonRequest("/api/admin/users/7/unban", "POST", undefined, headers),
      context(),
    );

    expect(banned.status).toBe(200);
    expect(unbanned.status).toBe(200);
    expect(mocks.setBan).toHaveBeenNthCalledWith(1, 1, 7, true);
    expect(mocks.setBan).toHaveBeenNthCalledWith(2, 1, 7, false);
  });
});
