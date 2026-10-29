import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitGameResult: vi.fn(),
  insertGame: vi.fn(),
}));

vi.mock("@/lib/db/pg/functions", () => ({
  submitGameResult: mocks.submitGameResult,
}));

vi.mock("@/lib/db/mongo/historyRepo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/mongo/historyRepo")>();
  return { ...actual, insertGame: mocks.insertGame };
});

import { POST as submitRoute } from "@/app/api/games/submit/route";
import { signSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { signGameToken } from "@/lib/tokens/gameToken";

import { makeJsonRequest, resetAuthEnv, sessionCookieHeader, stubAuthEnv } from "../support/auth";
import {
  EXPECTED_TOTAL,
  FIXED_GUESSES,
  FIXED_TARGETS,
  makeSubmitGameResult,
} from "../support/game";

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
  mocks.submitGameResult.mockResolvedValue(makeSubmitGameResult());
  mocks.insertGame.mockRejectedValue(new Error("mongo down"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/games/submit with a Mongo outage", () => {
  it("returns 200, retries once, and logs the insert failure", async () => {
    const sessionToken = await signSession({ userId: 7, role: "player" });
    const gameToken = await signGameToken(
      { userId: 7, mode: "global", rounds: FIXED_TARGETS },
      new Date(Date.now() - 20_000),
    );

    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    const response = await submitRoute(
      makeJsonRequest(
        "/api/games/submit",
        "POST",
        { gameToken: gameToken.token, guesses: FIXED_GUESSES },
        sessionCookieHeader(sessionToken),
      ),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "global",
      totalScore: EXPECTED_TOTAL,
      totalGamesPlayed: 1,
      streak: null,
      room: null,
    });
    expect(mocks.insertGame).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      "mongo_history_insert_failed",
      expect.objectContaining({ userId: 7, mode: "global", attempt: 1 }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "mongo_history_insert_failed",
      expect.objectContaining({ userId: 7, mode: "global", attempt: 2 }),
    );
  });
});
