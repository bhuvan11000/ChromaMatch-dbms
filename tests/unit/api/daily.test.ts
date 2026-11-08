import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTodaySummary: vi.fn(),
}));

vi.mock("@/lib/services/dailyChallengeService", () => ({
  getTodaySummary: mocks.getTodaySummary,
}));

import { GET } from "@/app/api/daily/today/route";
import { signSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { dailyTodayResponseSchema } from "@/lib/schemas/daily";

import { makeGetRequest, resetAuthEnv, sessionCookieHeader, stubAuthEnv } from "../support/auth";

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

beforeEach(() => {
  mocks.getTodaySummary.mockReset();
});

const SUMMARY = {
  date: "2026-10-29",
  resetsAt: "2026-10-30T00:00:00.000Z",
  serverTime: "2026-10-29T09:15:00.000Z",
  myBest: { score: 25.3, achievedAt: "2026-10-29T08:02:11.000Z" },
  streak: { current: 3, longest: 7 },
};

describe("GET /api/daily/today", () => {
  it("returns 401 without a session and does not call the service", async () => {
    const response = await GET(makeGetRequest("/api/daily/today"), undefined);

    expect(response.status).toBe(401);
    expect(mocks.getTodaySummary).not.toHaveBeenCalled();
  });

  it("returns the §5.10.3 shape with no-store and exactly one service call", async () => {
    mocks.getTodaySummary.mockResolvedValue(SUMMARY);
    const token = await signSession({ userId: 7, role: "player" });

    const response = await GET(
      makeGetRequest("/api/daily/today", sessionCookieHeader(token)),
      undefined,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual(SUMMARY);
    expect(dailyTodayResponseSchema.safeParse(body).success).toBe(true);
    expect(mocks.getTodaySummary).toHaveBeenCalledTimes(1);
    expect(mocks.getTodaySummary).toHaveBeenCalledWith(7, expect.any(Date));
  });

  it("never exposes colours", async () => {
    mocks.getTodaySummary.mockResolvedValue({ ...SUMMARY, myBest: null });
    const token = await signSession({ userId: 7, role: "player" });

    const response = await GET(
      makeGetRequest("/api/daily/today", sessionCookieHeader(token)),
      undefined,
    );
    const text = JSON.stringify(await response.json());

    expect(text).not.toMatch(/colou?rs?|"h"|hue/i);
  });

  it("maps service errors to the standard envelope", async () => {
    mocks.getTodaySummary.mockRejectedValue(new AppError("SERVICE_UNAVAILABLE"));
    const token = await signSession({ userId: 7, role: "player" });

    const response = await GET(
      makeGetRequest("/api/daily/today", sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("dailyTodayResponseSchema", () => {
  it("accepts a null myBest and rejects unknown keys", () => {
    expect(dailyTodayResponseSchema.safeParse({ ...SUMMARY, myBest: null }).success).toBe(true);
    expect(dailyTodayResponseSchema.safeParse({ ...SUMMARY, colors: [] }).success).toBe(false);
    expect(
      dailyTodayResponseSchema.safeParse({ ...SUMMARY, streak: { current: -1, longest: 0 } })
        .success,
    ).toBe(false);
  });
});
