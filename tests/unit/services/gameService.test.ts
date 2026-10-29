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

import { GAME_TOKEN_TTL_SECONDS, REVEAL_MS } from "@/lib/config/constants";
import { isValidHsv } from "@/lib/domain/hsv";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { GameSubmitRequest } from "@/lib/schemas/game";
import { startGame, submitGame } from "@/lib/services/gameService";
import { verifyGameToken } from "@/lib/tokens/gameToken";

import { resetAuthEnv, stubAuthEnv } from "../support/auth";
import {
  EXPECTED_ROUND_SCORES,
  EXPECTED_TOTAL,
  FIXED_GUESSES,
  FIXED_TARGETS,
  GAME_TEST_NOW,
  makeGlobalPb,
  makeSubmitGameResult,
  mintGameToken,
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
  mocks.insertGame.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function tokenTargets() {
  return FIXED_TARGETS.map(({ h, s, v }) => ({ h, s, v }));
}

describe("startGame", () => {
  it("returns 3 valid Global targets and a verifiable token", async () => {
    const result = await startGame(7, { mode: "global" }, GAME_TEST_NOW);

    expect(result).toMatchObject({
      mode: "global",
      revealMs: REVEAL_MS,
      timerSeconds: null,
      challengeDate: null,
      roomCode: null,
    });
    expect(result.rounds).toHaveLength(3);
    result.rounds.forEach((round, index) => {
      expect(round.roundNumber).toBe(index + 1);
      expect(isValidHsv(round.target)).toBe(true);
    });

    const claims = await verifyGameToken(result.gameToken, {
      userId: 7,
      now: new Date(GAME_TEST_NOW.getTime() + 20_000),
    });

    expect(claims.mode).toBe("global");
    expect(claims.exp - claims.iat).toBe(GAME_TOKEN_TTL_SECONDS);
    expect(claims.rounds.map(({ h, s, v }) => ({ h, s, v }))).toEqual(
      result.rounds.map((round) => round.target),
    );
    expect(result.expiresAt).toBe(new Date(claims.exp * 1000).toISOString());
  });

  it("rejects Daily and Room with a clear NOT_IMPLEMENTED internal error", async () => {
    await expect(startGame(7, { mode: "daily" }, GAME_TEST_NOW)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.stringContaining("NOT_IMPLEMENTED"),
    });

    await expect(
      startGame(7, { mode: "room", roomCode: "ABCD2345" }, GAME_TEST_NOW),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.stringContaining("NOT_IMPLEMENTED"),
    });
  });
});

describe("submitGame", () => {
  it("scores against token targets and calls Postgres exactly once", async () => {
    const { token } = await mintGameToken();

    const result = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(mocks.submitGameResult).toHaveBeenCalledTimes(1);
    expect(mocks.submitGameResult).toHaveBeenCalledWith({
      userId: 7,
      mode: "global",
      challengeId: null,
      roundScores: [...EXPECTED_ROUND_SCORES],
      playedAt: GAME_TEST_NOW,
    });

    expect(result).toMatchObject({
      mode: "global",
      totalScore: EXPECTED_TOTAL,
      totalGamesPlayed: 1,
      streak: null,
      room: null,
      achievements: [],
      pb: {
        scope: "global",
        previous: null,
        current: EXPECTED_TOTAL,
        updated: true,
        beatExisting: false,
      },
    });
    expect(result.rounds.map((round) => round.score)).toEqual([...EXPECTED_ROUND_SCORES]);
    expect(result.rounds.map((round) => round.target)).toEqual(tokenTargets());
    expect(result.rounds.map((round) => round.guess)).toEqual(FIXED_GUESSES);
    expect(result.rounds[0]?.diff).toEqual({ h: 5.6, s: 3.5, v: 3.5 });
  });

  it("writes the Database Design §7.2 Global history document", async () => {
    const { token } = await mintGameToken();

    await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(mocks.insertGame).toHaveBeenCalledTimes(1);
    const document = mocks.insertGame.mock.calls[0]?.[0];

    expect(document).toMatchObject({
      user_id: 7,
      mode: "global",
      played_at: GAME_TEST_NOW,
      total_score: EXPECTED_TOTAL,
    });
    expect(document).not.toHaveProperty("daily_challenge_id");
    expect(document).not.toHaveProperty("room_id");
    expect(document).not.toHaveProperty("attempt_number");

    expect(document.rounds).toHaveLength(3);
    document.rounds.forEach((round: Record<string, unknown>, index: number) => {
      expect(round).toMatchObject({
        round_number: index + 1,
        target: tokenTargets()[index],
        guess: FIXED_GUESSES[index],
        score: EXPECTED_ROUND_SCORES[index],
      });
      expect(round).not.toHaveProperty("color_number");
      expect(round).not.toHaveProperty("timed_out");
    });
  });

  it("ignores client-supplied targets and scores", async () => {
    const { token } = await mintGameToken();
    const body = {
      gameToken: token,
      guesses: FIXED_GUESSES,
      targets: [
        { h: 0, s: 0, v: 0 },
        { h: 0, s: 0, v: 0 },
        { h: 0, s: 0, v: 0 },
      ],
      totalScore: 30,
    } as unknown as GameSubmitRequest;

    const result = await submitGame(7, body, GAME_TEST_NOW);

    expect(result.rounds.map((round) => round.target)).toEqual(tokenTargets());
    expect(result.totalScore).toBe(EXPECTED_TOTAL);
    expect(mocks.submitGameResult).toHaveBeenCalledWith(
      expect.objectContaining({ roundScores: [...EXPECTED_ROUND_SCORES] }),
    );
  });

  it("maps first, higher and equal personal-best results", async () => {
    const { token } = await mintGameToken();

    mocks.submitGameResult
      .mockResolvedValueOnce(
        makeSubmitGameResult({
          total_games_played: 1,
          pb: makeGlobalPb(null, EXPECTED_TOTAL, true, false),
        }),
      )
      .mockResolvedValueOnce(
        makeSubmitGameResult({
          total_score: 30,
          total_games_played: 2,
          pb: makeGlobalPb(EXPECTED_TOTAL, 30, true, true),
        }),
      )
      .mockResolvedValueOnce(
        makeSubmitGameResult({
          total_score: 30,
          total_games_played: 3,
          pb: makeGlobalPb(30, 30, false, false),
        }),
      );

    const first = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);
    expect(first.pb).toEqual({
      scope: "global",
      previous: null,
      current: EXPECTED_TOTAL,
      updated: true,
      beatExisting: false,
    });

    const higher = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);
    expect(higher.pb).toEqual({
      scope: "global",
      previous: EXPECTED_TOTAL,
      current: 30,
      updated: true,
      beatExisting: true,
    });

    const equal = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);
    expect(equal.pb).toEqual({
      scope: "global",
      previous: 30,
      current: 30,
      updated: false,
      beatExisting: false,
    });

    expect(mocks.submitGameResult).toHaveBeenCalledTimes(3);
  });

  it("returns success and logs when the Mongo insert fails", async () => {
    const { token } = await mintGameToken();
    mocks.insertGame.mockRejectedValue(new Error("mongo down"));

    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    const result = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(result.totalScore).toBe(EXPECTED_TOTAL);
    expect(mocks.insertGame).toHaveBeenCalledTimes(2);

    expect(warnSpy).toHaveBeenCalledWith(
      "mongo_history_insert_failed",
      expect.objectContaining({
        userId: 7,
        mode: "global",
        jti: expect.any(String),
        attempt: 1,
        err: expect.any(Error),
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "mongo_history_insert_failed",
      expect.objectContaining({
        userId: 7,
        mode: "global",
        jti: expect.any(String),
        attempt: 2,
        err: expect.any(Error),
      }),
    );
  });

  it("does not write Mongo when Postgres fails", async () => {
    const { token } = await mintGameToken();
    mocks.submitGameResult.mockRejectedValue(new AppError("SERVICE_UNAVAILABLE"));

    await expect(
      submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });

    expect(mocks.insertGame).not.toHaveBeenCalled();
  });

  it("rejects timedOut=true for Global", async () => {
    const { token } = await mintGameToken();

    await expect(
      submitGame(
        7,
        {
          gameToken: token,
          guesses: FIXED_GUESSES,
          timedOut: [true, false, false],
        },
        GAME_TEST_NOW,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(mocks.submitGameResult).not.toHaveBeenCalled();
  });

  it("rejects Daily and Room submissions with NOT_IMPLEMENTED", async () => {
    const daily = await mintGameToken({ mode: "daily" });

    await expect(
      submitGame(7, { gameToken: daily.token, guesses: FIXED_GUESSES }, GAME_TEST_NOW),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.stringContaining("NOT_IMPLEMENTED"),
    });

    expect(mocks.submitGameResult).not.toHaveBeenCalled();
  });
});
