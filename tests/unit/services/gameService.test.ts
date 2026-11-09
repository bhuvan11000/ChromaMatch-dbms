import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitGameResult: vi.fn(),
  insertGame: vi.fn(),
  getOrCreateToday: vi.fn(),
}));

vi.mock("@/lib/services/dailyChallengeService", () => ({
  getOrCreateToday: mocks.getOrCreateToday,
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

  it("keeps Room as a clear NOT_IMPLEMENTED internal error (Daily is implemented)", async () => {
    await expect(
      startGame(7, { mode: "room", roomCode: "ABCD2345" }, GAME_TEST_NOW),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.stringContaining("NOT_IMPLEMENTED"),
    });
  });
});

const DAILY_COLORS = [
  { h: 214.6, s: 62, v: 80.5 },
  { h: 12, s: 90, v: 70 },
  { h: 301.3, s: 45.5, v: 33 },
] as const;

describe("startGame (Daily)", () => {
  beforeEach(() => {
    mocks.getOrCreateToday.mockResolvedValue({
      challengeId: 118,
      date: "2026-10-29",
      colors: [...DAILY_COLORS],
    });
  });

  it("returns the stored colours in a permuted order with the right claims", async () => {
    const result = await startGame(7, { mode: "daily" }, GAME_TEST_NOW);

    expect(mocks.getOrCreateToday).toHaveBeenCalledWith(GAME_TEST_NOW);
    expect(result).toMatchObject({
      mode: "daily",
      revealMs: REVEAL_MS,
      timerSeconds: null,
      roomCode: null,
      challengeDate: "2026-10-29",
    });
    expect(result.rounds).toHaveLength(3);

    const claims = await verifyGameToken(result.gameToken, {
      userId: 7,
      now: new Date(GAME_TEST_NOW.getTime() + 20_000),
    });

    expect(claims.mode).toBe("daily");
    expect(claims.cid).toBe(118);
    expect(claims.cdate).toBe("2026-10-29");
    expect(claims.rid).toBeUndefined();
    expect(claims.tmr).toBeUndefined();

    // `n` is the 1-based index of the stored colour, whatever the play order.
    const numbers = claims.rounds.map((round) => round.n);
    expect([...numbers].sort()).toEqual([1, 2, 3]);

    claims.rounds.forEach((round, playIndex) => {
      const stored = DAILY_COLORS[(round.n ?? 0) - 1];
      expect({ h: round.h, s: round.s, v: round.v }).toEqual(stored);
      expect(result.rounds[playIndex]?.roundNumber).toBe(playIndex + 1);
      expect(result.rounds[playIndex]?.target).toEqual(stored);
    });
  });

  it("does not leak colour numbers in the start response", async () => {
    const result = await startGame(7, { mode: "daily" }, GAME_TEST_NOW);

    for (const round of result.rounds) {
      expect(Object.keys(round).sort()).toEqual(["roundNumber", "target"]);
    }
  });

  it("propagates failures from the Daily challenge service", async () => {
    mocks.getOrCreateToday.mockRejectedValue(new AppError("SERVICE_UNAVAILABLE"));

    await expect(startGame(7, { mode: "daily" }, GAME_TEST_NOW)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
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

  it("keeps Room submissions as NOT_IMPLEMENTED (Daily is implemented)", async () => {
    const room = await mintGameToken({ mode: "room" });

    await expect(
      submitGame(7, { gameToken: room.token, guesses: FIXED_GUESSES }, GAME_TEST_NOW),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.stringContaining("NOT_IMPLEMENTED"),
    });

    expect(mocks.submitGameResult).not.toHaveBeenCalled();
  });
});

describe("submitGame (Daily)", () => {
  function dailySqlResult(overrides: Parameters<typeof makeSubmitGameResult>[0] = {}) {
    return makeSubmitGameResult({
      mode: "daily",
      pb: {
        scope: "daily",
        previous: null,
        current: EXPECTED_TOTAL,
        updated: true,
        beat_existing: false,
      },
      streak: { current: 3, longest: 7 },
      ...overrides,
    });
  }

  it("calls submit_game_result exactly once with the token's challenge id", async () => {
    mocks.submitGameResult.mockResolvedValue(dailySqlResult());
    const { token } = await mintGameToken({ mode: "daily", cid: 118, cdate: "2026-10-29" });

    const result = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(mocks.submitGameResult).toHaveBeenCalledTimes(1);
    expect(mocks.submitGameResult).toHaveBeenCalledWith({
      userId: 7,
      mode: "daily",
      challengeId: 118,
      roundScores: [...EXPECTED_ROUND_SCORES],
      playedAt: GAME_TEST_NOW,
    });

    expect(result).toMatchObject({
      mode: "daily",
      totalScore: EXPECTED_TOTAL,
      totalGamesPlayed: 1,
      streak: { current: 3, longest: 7 },
      room: null,
      achievements: [],
      pb: { scope: "daily", previous: null, current: EXPECTED_TOTAL, updated: true },
    });
    // Daily rounds never carry `timedOut`.
    for (const round of result.rounds) {
      expect(round).not.toHaveProperty("timedOut");
    }
  });

  it("writes a Daily history document with daily_challenge_id and color_number", async () => {
    mocks.submitGameResult.mockResolvedValue(dailySqlResult());
    const { token } = await mintGameToken({ mode: "daily", cid: 118, cdate: "2026-10-29" });

    await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(mocks.insertGame).toHaveBeenCalledTimes(1);
    const document = mocks.insertGame.mock.calls[0]?.[0];

    expect(document).toMatchObject({
      user_id: 7,
      mode: "daily",
      daily_challenge_id: 118,
      played_at: GAME_TEST_NOW,
      total_score: EXPECTED_TOTAL,
    });
    expect(document).not.toHaveProperty("room_id");
    expect(document).not.toHaveProperty("attempt_number");
    expect(document.rounds.map((round: { color_number: number }) => round.color_number)).toEqual([
      3, 1, 2,
    ]);
    for (const round of document.rounds as Array<Record<string, unknown>>) {
      expect(round).not.toHaveProperty("timed_out");
    }
  });

  it("maps a higher daily personal best", async () => {
    mocks.submitGameResult.mockResolvedValue(
      dailySqlResult({
        total_score: 30,
        pb: {
          scope: "daily",
          previous: EXPECTED_TOTAL,
          current: 30,
          updated: true,
          beat_existing: true,
        },
      }),
    );
    const { token } = await mintGameToken({ mode: "daily" });

    const result = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(result.pb).toEqual({
      scope: "daily",
      previous: EXPECTED_TOTAL,
      current: 30,
      updated: true,
      beatExisting: true,
    });
  });

  it("ignores a client-supplied challenge id", async () => {
    mocks.submitGameResult.mockResolvedValue(dailySqlResult());
    const { token } = await mintGameToken({ mode: "daily", cid: 118 });
    const body = {
      gameToken: token,
      guesses: FIXED_GUESSES,
      cid: 1,
      challengeId: 1,
    } as unknown as GameSubmitRequest;

    await submitGame(7, body, GAME_TEST_NOW);

    expect(mocks.submitGameResult).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: 118 }),
    );
  });

  it("rejects timedOut=true for Daily", async () => {
    const { token } = await mintGameToken({ mode: "daily" });

    await expect(
      submitGame(
        7,
        { gameToken: token, guesses: FIXED_GUESSES, timedOut: [false, true, false] },
        GAME_TEST_NOW,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.submitGameResult).not.toHaveBeenCalled();
  });

  it("does not write Mongo when Postgres fails", async () => {
    mocks.submitGameResult.mockRejectedValue(new AppError("SERVICE_UNAVAILABLE"));
    const { token } = await mintGameToken({ mode: "daily" });

    await expect(
      submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mocks.insertGame).not.toHaveBeenCalled();
  });
});
