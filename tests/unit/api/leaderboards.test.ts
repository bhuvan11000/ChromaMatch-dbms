import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGlobal: vi.fn(),
  getDaily: vi.fn(),
}));

vi.mock("@/lib/services/leaderboardService", () => ({
  getGlobal: mocks.getGlobal,
  getDaily: mocks.getDaily,
}));

import { GET as globalRoute } from "@/app/api/leaderboards/global/route";
import { GET as dailyRoute } from "@/app/api/leaderboards/daily/route";
import { signSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

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

const GLOBAL_RESPONSE = {
  entries: [
    {
      rank: 1,
      userId: 7,
      username: "alice",
      score: 24.6,
      achievedAt: "2026-10-30T12:00:00.000Z",
    },
  ],
  total: 1,
  me: null,
};

const DAILY_RESPONSE = {
  ...GLOBAL_RESPONSE,
  date: "2026-10-30",
};

function errorBody(body: unknown): { error: { code: string; message: string } } {
  return body as { error: { code: string; message: string } };
}

describe("GET /api/leaderboards/global", () => {
  it("is public and returns the service response with no viewer", async () => {
    mocks.getGlobal.mockResolvedValue(GLOBAL_RESPONSE);

    const response = await globalRoute(makeGetRequest("/api/leaderboards/global"), undefined);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(GLOBAL_RESPONSE);
    expect(mocks.getGlobal).toHaveBeenCalledWith({ limit: 50, offset: 0 }, undefined);
  });

  it("passes an optional authenticated viewer id", async () => {
    mocks.getGlobal.mockResolvedValue(GLOBAL_RESPONSE);
    const token = await signSession({ userId: 7, role: "player" });

    const response = await globalRoute(
      makeGetRequest("/api/leaderboards/global?limit=10&offset=20", sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(mocks.getGlobal).toHaveBeenCalledWith({ limit: 10, offset: 20 }, 7);
  });

  it("rejects unknown query keys before calling the service", async () => {
    const response = await globalRoute(
      makeGetRequest("/api/leaderboards/global?limit=10&unexpected=1"),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(errorBody(await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.getGlobal).not.toHaveBeenCalled();
  });
});

describe("GET /api/leaderboards/daily", () => {
  it("defaults to today and returns the daily page", async () => {
    mocks.getDaily.mockResolvedValue(DAILY_RESPONSE);

    const response = await dailyRoute(makeGetRequest("/api/leaderboards/daily"), undefined);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DAILY_RESPONSE);
    expect(mocks.getDaily).toHaveBeenCalledWith(
      { limit: 50, offset: 0 },
      undefined,
      expect.any(Date),
    );
  });

  it("passes date, pagination and an optional viewer", async () => {
    mocks.getDaily.mockResolvedValue(DAILY_RESPONSE);
    const token = await signSession({ userId: 9, role: "player" });

    const response = await dailyRoute(
      makeGetRequest(
        "/api/leaderboards/daily?date=2026-10-30&limit=25&offset=5",
        sessionCookieHeader(token),
      ),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(mocks.getDaily).toHaveBeenCalledWith(
      { date: "2026-10-30", limit: 25, offset: 5 },
      9,
      expect.any(Date),
    );
  });

  it("maps INVALID_DATE from the service to a 400 envelope", async () => {
    mocks.getDaily.mockRejectedValue(new AppError("INVALID_DATE"));

    const response = await dailyRoute(
      makeGetRequest("/api/leaderboards/daily?date=2999-01-01"),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(errorBody(await response.json()).error.code).toBe("INVALID_DATE");
    expect(mocks.getDaily).toHaveBeenCalledTimes(1);
  });
});
