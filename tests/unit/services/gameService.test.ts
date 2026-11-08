import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitGameResult: vi.fn(),
  submitRoomAttempt: vi.fn(),
  insertGame: vi.fn(),
  getOrCreateToday: vi.fn(),
  findRoomByCode: vi.fn(),
  findRoomMember: vi.fn(),
  listRoomColors: vi.fn(),
}));

vi.mock("@/lib/db/pg/queries/rooms", () => ({
  findRoomByCode: mocks.findRoomByCode,
  findRoomMember: mocks.findRoomMember,
  listRoomColors: mocks.listRoomColors,
}));

vi.mock("@/lib/services/dailyChallengeService", () => ({
  getOrCreateToday: mocks.getOrCreateToday,
}));

vi.mock("@/lib/db/pg/functions", () => ({
  submitGameResult: mocks.submitGameResult,
  submitRoomAttempt: mocks.submitRoomAttempt,
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
        pb: { scope: "daily", previous: EXPECTED_TOTAL, current: 30, updated: true, beat_existing: true },
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

/* ------------------------------ Room mode ------------------------------ */

const ROOM_COLORS = [
  { h: 214.6, s: 62, v: 80.5 },
  { h: 12, s: 90, v: 70 },
  { h: 301.3, s: 45.5, v: 33 },
] as const;

function roomRecord(overrides: Record<string, unknown> = {}) {
  return {
    roomId: 7,
    code: "ABCD2345",
    creatorId: 1,
    roomSize: 4,
    timerSeconds: 10,
    attemptsLimit: 3,
    status: "in_progress",
    createdAt: new Date("2026-10-29T12:00:00.000Z"),
    startedAt: new Date("2026-10-29T12:01:00.000Z"),
    endedAt: null,
    ...overrides,
  };
}

function memberRecord(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    attemptsUsed: 0,
    bestScore: null,
    joinedAt: new Date("2026-10-29T12:00:00.000Z"),
    ...overrides,
  };
}

function roomSqlResult(overrides: Record<string, unknown> = {}) {
  return {
    attempt_number: 2,
    total_score: EXPECTED_TOTAL,
    best_score: 27.5,
    is_new_best: false,
    attempts_remaining: 1,
    member_status: "active",
    room_status: "in_progress",
    ...overrides,
  };
}

describe("startGame (Room)", () => {
  beforeEach(() => {
    mocks.findRoomByCode.mockResolvedValue(roomRecord());
    mocks.findRoomMember.mockResolvedValue(memberRecord());
    mocks.listRoomColors.mockResolvedValue([...ROOM_COLORS]);
  });

  it("signs a token with rid, tmr and a colour-number permutation", async () => {
    const result = await startGame(
      7,
      { mode: "room", roomCode: " abcd2345 " },
      GAME_TEST_NOW,
    );

    expect(mocks.findRoomByCode).toHaveBeenCalledWith("ABCD2345");
    expect(result).toMatchObject({
      mode: "room",
      revealMs: REVEAL_MS,
      timerSeconds: 10,
      roomCode: "ABCD2345",
      challengeDate: null,
    });

    const claims = await verifyGameToken(result.gameToken, {
      userId: 7,
      now: new Date(GAME_TEST_NOW.getTime() + 20_000),
    });

    expect(claims.mode).toBe("room");
    expect(claims.rid).toBe(7);
    expect(claims.tmr).toBe(10);
    expect(claims.cid).toBeUndefined();
    expect([...claims.rounds.map((round) => round.n)].sort()).toEqual([1, 2, 3]);

    claims.rounds.forEach((round, playIndex) => {
      expect({ h: round.h, s: round.s, v: round.v }).toEqual(ROOM_COLORS[(round.n ?? 0) - 1]);
      expect(result.rounds[playIndex]?.target).toEqual(ROOM_COLORS[(round.n ?? 0) - 1]);
    });
  });

  it("signs tmr null and returns timerSeconds null for untimed rooms", async () => {
    mocks.findRoomByCode.mockResolvedValue(roomRecord({ timerSeconds: null }));

    const result = await startGame(7, { mode: "room", roomCode: "ABCD2345" }, GAME_TEST_NOW);
    const claims = await verifyGameToken(result.gameToken, {
      userId: 7,
      now: new Date(GAME_TEST_NOW.getTime() + 20_000),
    });

    expect(result.timerSeconds).toBeNull();
    expect(claims.tmr).toBeNull();
  });

  it("checks in order: not found, non-member, status, member status, attempts", async () => {
    const start = () => startGame(7, { mode: "room", roomCode: "ABCD2345" }, GAME_TEST_NOW);

    mocks.findRoomByCode.mockResolvedValue(null);
    await expect(start()).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });

    // Non-members always get 403, even for a room that is not in progress.
    mocks.findRoomByCode.mockResolvedValue(roomRecord({ status: "finished" }));
    mocks.findRoomMember.mockResolvedValue(null);
    await expect(start()).rejects.toMatchObject({ code: "NOT_ROOM_MEMBER" });

    mocks.findRoomMember.mockResolvedValue(memberRecord());
    mocks.findRoomByCode.mockResolvedValue(roomRecord({ status: "lobby" }));
    await expect(start()).rejects.toMatchObject({ code: "ROOM_NOT_IN_PROGRESS" });

    mocks.findRoomByCode.mockResolvedValue(roomRecord());
    mocks.findRoomMember.mockResolvedValue(memberRecord({ status: "left" }));
    await expect(start()).rejects.toMatchObject({ code: "MEMBER_NOT_ACTIVE" });

    mocks.findRoomMember.mockResolvedValue(memberRecord({ attemptsUsed: 3 }));
    await expect(start()).rejects.toMatchObject({ code: "ATTEMPTS_EXHAUSTED" });

    expect(mocks.listRoomColors).not.toHaveBeenCalled();
    expect(mocks.submitRoomAttempt).not.toHaveBeenCalled();
  });

  it("does not consume an attempt at start", async () => {
    await startGame(7, { mode: "room", roomCode: "ABCD2345" }, GAME_TEST_NOW);

    expect(mocks.submitRoomAttempt).not.toHaveBeenCalled();
    expect(mocks.submitGameResult).not.toHaveBeenCalled();
  });
});

describe("submitGame (Room)", () => {
  beforeEach(() => {
    mocks.submitRoomAttempt.mockResolvedValue(roomSqlResult());
  });

  it("calls submit_room_attempt exactly once and never submit_game_result", async () => {
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: null });

    await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(mocks.submitRoomAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.submitRoomAttempt).toHaveBeenCalledWith({
      userId: 7,
      roomId: 7,
      roundScores: [...EXPECTED_ROUND_SCORES],
    });
    expect(mocks.submitGameResult).not.toHaveBeenCalled();
  });

  it("returns the room response with null pb/streak/totalGamesPlayed and timedOut on every round", async () => {
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: null });

    const result = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(result).toMatchObject({
      mode: "room",
      totalScore: EXPECTED_TOTAL,
      totalGamesPlayed: null,
      pb: null,
      streak: null,
      achievements: [],
      room: {
        attemptNumber: 2,
        bestScore: 27.5,
        isNewBest: false,
        attemptsRemaining: 1,
        memberStatus: "active",
        roomStatus: "in_progress",
      },
    });
    expect(result.rounds.map((round) => round.timedOut)).toEqual([false, false, false]);
    expect(result.rounds.map((round) => round.score)).toEqual([...EXPECTED_ROUND_SCORES]);
  });

  it("writes the Mongo room document with room_id, attempt_number and timed_out", async () => {
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: 10 });

    await submitGame(
      7,
      { gameToken: token, guesses: FIXED_GUESSES, timedOut: [false, true, false] },
      GAME_TEST_NOW,
    );

    expect(mocks.insertGame).toHaveBeenCalledTimes(1);
    const document = mocks.insertGame.mock.calls[0]?.[0];

    expect(document).toMatchObject({
      user_id: 7,
      mode: "room",
      room_id: 7,
      attempt_number: 2,
      played_at: GAME_TEST_NOW,
    });
    expect(document).not.toHaveProperty("daily_challenge_id");
    expect(document.rounds.map((round: { color_number: number }) => round.color_number)).toEqual([
      3, 1, 2,
    ]);
    expect(document.rounds.map((round: { timed_out: boolean }) => round.timed_out)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("defaults timed_out to all false when the client sends none", async () => {
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: 10 });

    await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    const document = mocks.insertGame.mock.calls[0]?.[0];
    expect(document.rounds.map((round: { timed_out: boolean }) => round.timed_out)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("allows timedOut flags for timed rooms", async () => {
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: 5 });

    const result = await submitGame(
      7,
      { gameToken: token, guesses: FIXED_GUESSES, timedOut: [true, true, false] },
      GAME_TEST_NOW,
    );

    expect(result.rounds.map((round) => round.timedOut)).toEqual([true, true, false]);
  });

  it("rejects timedOut=true for untimed rooms but accepts all-false", async () => {
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: null });

    await expect(
      submitGame(
        7,
        { gameToken: token, guesses: FIXED_GUESSES, timedOut: [false, true, false] },
        GAME_TEST_NOW,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.submitRoomAttempt).not.toHaveBeenCalled();

    await expect(
      submitGame(
        7,
        { gameToken: token, guesses: FIXED_GUESSES, timedOut: [false, false, false] },
        GAME_TEST_NOW,
      ),
    ).resolves.toMatchObject({ mode: "room" });
  });

  it("rejects a timedOut array of the wrong length", async () => {
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: 10 });

    await expect(
      submitGame(
        7,
        { gameToken: token, guesses: FIXED_GUESSES, timedOut: [true] } as unknown as GameSubmitRequest,
        GAME_TEST_NOW,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("does not write Mongo when the room SQL function throws", async () => {
    mocks.submitRoomAttempt.mockRejectedValue(new AppError("ROOM_NOT_IN_PROGRESS"));
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: null });

    await expect(
      submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW),
    ).rejects.toMatchObject({ code: "ROOM_NOT_IN_PROGRESS" });
    expect(mocks.insertGame).not.toHaveBeenCalled();
  });

  it("still succeeds when Mongo fails", async () => {
    mocks.insertGame.mockRejectedValue(new Error("mongo down"));
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: null });

    const result = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(result.room?.attemptNumber).toBe(2);
    expect(mocks.insertGame).toHaveBeenCalledTimes(2);
  });

  it("reflects a finished room in the response", async () => {
    mocks.submitRoomAttempt.mockResolvedValue(
      roomSqlResult({
        attempts_remaining: 0,
        member_status: "finished",
        room_status: "finished",
        is_new_best: true,
      }),
    );
    const { token } = await mintGameToken({ mode: "room", rid: 7, tmr: null });

    const result = await submitGame(7, { gameToken: token, guesses: FIXED_GUESSES }, GAME_TEST_NOW);

    expect(result.room).toMatchObject({
      attemptsRemaining: 0,
      memberStatus: "finished",
      roomStatus: "finished",
      isNewBest: true,
    });
  });
});
