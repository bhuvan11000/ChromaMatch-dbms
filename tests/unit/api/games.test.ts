import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startGame: vi.fn(),
  submitGame: vi.fn(),
}));

vi.mock("@/lib/services/gameService", () => ({
  startGame: mocks.startGame,
  submitGame: mocks.submitGame,
}));

import { POST as startRoute } from "@/app/api/games/start/route";
import { POST as submitRoute } from "@/app/api/games/submit/route";
import { signSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

import { makeJsonRequest, resetAuthEnv, sessionCookieHeader, stubAuthEnv } from "../support/auth";
import {
  EXPECTED_ROUND_SCORES,
  EXPECTED_TOTAL,
  FIXED_GUESSES,
  FIXED_TARGETS,
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
});

const START_RESPONSE = {
  gameToken: "signed-token",
  mode: "global" as const,
  revealMs: 5000,
  timerSeconds: null,
  expiresAt: "2026-10-29T14:00:00.000Z",
  challengeDate: null,
  roomCode: null,
  rounds: FIXED_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target,
  })),
};

const SUBMIT_RESPONSE = {
  mode: "global" as const,
  totalScore: EXPECTED_TOTAL,
  rounds: FIXED_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target,
    guess: FIXED_GUESSES[index],
    score: EXPECTED_ROUND_SCORES[index],
    diff: { h: 5.6, s: 3.5, v: 3.5 },
  })),
  totalGamesPlayed: 1,
  pb: {
    scope: "global" as const,
    previous: null,
    current: EXPECTED_TOTAL,
    updated: true,
    beatExisting: false,
  },
  streak: null,
  achievements: [],
  room: null,
};

function errorBody(body: unknown): { error: { code: string; message: string } } {
  return body as { error: { code: string; message: string } };
}

describe("POST /api/games/start", () => {
  it("returns 401 without a session and does not call the service", async () => {
    const response = await startRoute(
      makeJsonRequest("/api/games/start", "POST", { mode: "global" }),
      undefined,
    );

    expect(response.status).toBe(401);
    expect(errorBody(await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.startGame).not.toHaveBeenCalled();
  });

  it("returns the start response for an authenticated player", async () => {
    mocks.startGame.mockResolvedValue(START_RESPONSE);
    const token = await signSession({ userId: 7, role: "player" });

    const response = await startRoute(
      makeJsonRequest("/api/games/start", "POST", { mode: "global" }, sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(START_RESPONSE);
    expect(mocks.startGame).toHaveBeenCalledTimes(1);
    expect(mocks.startGame).toHaveBeenCalledWith(7, { mode: "global" }, expect.any(Date));
  });

  it("rejects unknown client keys before calling the service", async () => {
    const token = await signSession({ userId: 7, role: "player" });

    const response = await startRoute(
      makeJsonRequest(
        "/api/games/start",
        "POST",
        { mode: "global", targets: [] },
        sessionCookieHeader(token),
      ),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(errorBody(await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.startGame).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin", async () => {
    const token = await signSession({ userId: 7, role: "player" });

    const response = await startRoute(
      makeJsonRequest(
        "/api/games/start",
        "POST",
        { mode: "global" },
        { ...sessionCookieHeader(token), origin: "http://evil.example" },
      ),
      undefined,
    );

    expect(response.status).toBe(403);
    expect(errorBody(await response.json()).error.code).toBe("BAD_ORIGIN");
    expect(mocks.startGame).not.toHaveBeenCalled();
  });
});

describe("POST /api/games/submit", () => {
  it("returns 401 without a session and does not call the service", async () => {
    const response = await submitRoute(
      makeJsonRequest("/api/games/submit", "POST", {
        gameToken: "signed-token",
        guesses: FIXED_GUESSES,
      }),
      undefined,
    );

    expect(response.status).toBe(401);
    expect(errorBody(await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.submitGame).not.toHaveBeenCalled();
  });

  it("returns the submit response for an authenticated player", async () => {
    mocks.submitGame.mockResolvedValue(SUBMIT_RESPONSE);
    const token = await signSession({ userId: 7, role: "player" });
    const body = { gameToken: "signed-token", guesses: FIXED_GUESSES };

    const response = await submitRoute(
      makeJsonRequest("/api/games/submit", "POST", body, sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(SUBMIT_RESPONSE);
    expect(mocks.submitGame).toHaveBeenCalledTimes(1);
    expect(mocks.submitGame).toHaveBeenCalledWith(7, body, expect.any(Date));
  });

  it("rejects client-supplied targets before calling the service", async () => {
    const token = await signSession({ userId: 7, role: "player" });

    const response = await submitRoute(
      makeJsonRequest(
        "/api/games/submit",
        "POST",
        {
          gameToken: "signed-token",
          guesses: FIXED_GUESSES,
          targets: FIXED_TARGETS,
        },
        sessionCookieHeader(token),
      ),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(errorBody(await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.submitGame).not.toHaveBeenCalled();
  });

  it("rejects fewer than 3 guesses", async () => {
    const token = await signSession({ userId: 7, role: "player" });

    const response = await submitRoute(
      makeJsonRequest(
        "/api/games/submit",
        "POST",
        { gameToken: "signed-token", guesses: FIXED_GUESSES.slice(0, 2) },
        sessionCookieHeader(token),
      ),
      undefined,
    );

    expect(response.status).toBe(400);
    expect(errorBody(await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.submitGame).not.toHaveBeenCalled();
  });

  it.each([
    ["TOKEN_EXPIRED", 400],
    ["TOKEN_INVALID", 400],
    ["TOKEN_USER_MISMATCH", 400],
    ["SUBMISSION_TOO_FAST", 400],
  ] as const)("maps %s to %i", async (code, status) => {
    mocks.submitGame.mockRejectedValue(new AppError(code));
    const token = await signSession({ userId: 7, role: "player" });

    const response = await submitRoute(
      makeJsonRequest(
        "/api/games/submit",
        "POST",
        { gameToken: "signed-token", guesses: FIXED_GUESSES },
        sessionCookieHeader(token),
      ),
      undefined,
    );

    expect(response.status).toBe(status);
    expect(errorBody(await response.json()).error.code).toBe(code);
  });
});
