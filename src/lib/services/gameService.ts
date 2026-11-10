import { REVEAL_MS, ROUNDS_PER_GAME } from "@/lib/config/constants";
import { buildHistoryDocument, insertGame, type HistoryDocument } from "@/lib/db/mongo/historyRepo";
import { submitGameResult, submitRoomAttempt } from "@/lib/db/pg/functions";
import { findRoomByCode, findRoomMember, listRoomColors } from "@/lib/db/pg/queries/rooms";
import { generateRandomColors } from "@/lib/domain/colors";
import { isValidHsv, normalizeHsv, type Hsv } from "@/lib/domain/hsv";
import { scoreGame, scoreRound, type GameResult } from "@/lib/domain/scoring";
import { randomPermutation } from "@/lib/domain/shuffle";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type {
  GameMode,
  GameRoundScoreRequest,
  GameRoundScoreResponse,
  GameStartRequest,
  GameStartResponse,
  GameSubmitRequest,
  GameSubmitResponse,
} from "@/lib/schemas/game";
import {
  signGameToken,
  verifyGameToken,
  type GameTokenClaims,
  type GameTokenRound,
} from "@/lib/tokens/gameToken";

import { getOrCreateToday } from "./dailyChallengeService";

// Room reads use the data-access readers directly: gameService must not import
// roomService (same layer; avoids a cycle).

/**
 * Game use-cases — Architecture §5.7.3 and §5.12.1.
 *
 * Global, Daily and Room share one start/submit pipeline; each mode only
 * differs in where its targets come from and which SQL function records it.
 */

interface StartContext {
  /** Targets in play order; Daily/Room rounds carry their 1-based colour number. */
  rounds: [GameTokenRound, GameTokenRound, GameTokenRound];
  timerSeconds: 5 | 10 | 15 | null;
  challengeDate: string | null;
  roomCode: string | null;
  /** Extra signed claims for the token (Daily `cid`/`cdate`, Room `rid`/`tmr`). */
  tokenContext: { cid?: number; cdate?: string; rid?: number; tmr?: number | null };
}

function startGlobal(): StartContext {
  const [first, second, third] = generateRandomColors(ROUNDS_PER_GAME);

  if (!first || !second || !third) {
    throw new AppError("INTERNAL_ERROR", "Could not generate Global colors.");
  }

  return {
    rounds: [first, second, third],
    timerSeconds: null,
    challengeDate: null,
    roomCode: null,
    tokenContext: {},
  };
}

/**
 * Daily: the stored challenge row is the source of truth. The play order is a
 * fresh crypto shuffle per game; `n` is the 1-based colour number of the
 * stored colour (the shuffle helper returns 0-based indices — U-027).
 */
async function startDaily(now: Date): Promise<StartContext> {
  const challenge = await getOrCreateToday(now);
  const order = randomPermutation(ROUNDS_PER_GAME);

  const rounds = order.map((originalIndex): GameTokenRound => {
    const color = challenge.colors[originalIndex];
    if (!color) {
      throw new AppError("INTERNAL_ERROR", "Could not order the Daily colors.");
    }
    return { h: color.h, s: color.s, v: color.v, n: (originalIndex + 1) as 1 | 2 | 3 };
  });

  return {
    rounds: [rounds[0], rounds[1], rounds[2]],
    timerSeconds: null,
    challengeDate: challenge.date,
    roomCode: null,
    tokenContext: { cid: challenge.challengeId, cdate: challenge.date },
  };
}

/** Room codes are matched exactly by SQL; normalize like roomService does (U-016). */
function normalizeRoomCode(code: string | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/**
 * Room: checks run in a fixed order so a non-member always gets 403 before any
 * status information is revealed. Attempts are consumed at submit, not here.
 */
async function startRoomGame(
  userId: number,
  roomCodeInput: string | undefined,
): Promise<StartContext> {
  const code = normalizeRoomCode(roomCodeInput);

  const room = await findRoomByCode(code);
  if (!room) {
    throw new AppError("ROOM_NOT_FOUND");
  }

  const member = await findRoomMember(room.roomId, userId);
  if (!member) {
    throw new AppError("NOT_ROOM_MEMBER");
  }

  if (room.status !== "in_progress") {
    throw new AppError("ROOM_NOT_IN_PROGRESS");
  }
  if (member.status !== "active") {
    throw new AppError("MEMBER_NOT_ACTIVE");
  }
  if (member.attemptsUsed >= room.attemptsLimit) {
    throw new AppError("ATTEMPTS_EXHAUSTED");
  }

  const colors = await listRoomColors(room.roomId);
  const order = randomPermutation(ROUNDS_PER_GAME);

  const rounds = order.map((originalIndex): GameTokenRound => {
    const color = colors[originalIndex];
    if (!color) {
      throw new AppError("INTERNAL_ERROR", "Could not order the room colors.");
    }
    return { h: color.h, s: color.s, v: color.v, n: (originalIndex + 1) as 1 | 2 | 3 };
  });

  return {
    rounds: [rounds[0], rounds[1], rounds[2]],
    timerSeconds: room.timerSeconds,
    challengeDate: null,
    roomCode: code,
    tokenContext: { rid: room.roomId, tmr: room.timerSeconds },
  };
}

async function startContextForMode(
  userId: number,
  input: GameStartRequest,
  now: Date,
): Promise<StartContext> {
  switch (input.mode) {
    case "global":
      return startGlobal();
    case "daily":
      return startDaily(now);
    case "room":
      return startRoomGame(userId, input.roomCode);
  }
}

function normalizeGuesses(guesses: readonly Hsv[]): [Hsv, Hsv, Hsv] {
  if (!Array.isArray(guesses) || guesses.length !== ROUNDS_PER_GAME) {
    throw new AppError("VALIDATION_ERROR", `Exactly ${ROUNDS_PER_GAME} guesses are required.`);
  }

  const normalized = guesses.map((guess, index) => {
    if (!isValidHsv(guess)) {
      throw new AppError("VALIDATION_ERROR", `Guess ${index + 1} must be a valid HSV color.`);
    }
    return normalizeHsv(guess);
  });

  return [normalized[0], normalized[1], normalized[2]];
}

/**
 * `timedOut` is only meaningful for timed rooms (§5.7.3): for every other
 * token it must be absent or all `false`.
 */
function normalizeTimedOut(
  claims: GameTokenClaims,
  timedOut: readonly boolean[] | undefined,
): boolean[] | undefined {
  if (timedOut === undefined) {
    return undefined;
  }

  if (!Array.isArray(timedOut) || timedOut.length !== ROUNDS_PER_GAME) {
    throw new AppError(
      "VALIDATION_ERROR",
      `timedOut must contain exactly ${ROUNDS_PER_GAME} entries.`,
    );
  }

  const timedRoom = claims.mode === "room" && claims.tmr !== null && claims.tmr !== undefined;

  if (!timedRoom && timedOut.some(Boolean)) {
    throw new AppError("VALIDATION_ERROR", "timedOut is only allowed for timed room games.");
  }

  return [...timedOut];
}

interface HistoryContext {
  userId: number;
  mode: GameMode;
  jti: string;
}

/**
 * Mongo is best-effort: Postgres already committed the result. Log failures,
 * retry exactly once, and never fail the request.
 */
async function insertHistoryBestEffort(
  document: HistoryDocument,
  context: HistoryContext,
): Promise<void> {
  try {
    await insertGame(document);
    return;
  } catch (firstError) {
    logger.warn("mongo_history_insert_failed", {
      ...context,
      attempt: 1,
      err: firstError,
    });
  }

  try {
    await insertGame(document);
  } catch (error) {
    logger.error("mongo_history_insert_failed", {
      ...context,
      attempt: 2,
      err: error,
    });
  }
}

function buildSubmitResponse(
  claims: GameTokenClaims,
  guesses: readonly [Hsv, Hsv, Hsv],
  game: GameResult,
  sqlResult: Awaited<ReturnType<typeof submitGameResult>>,
  timedOut: readonly boolean[] | undefined,
): GameSubmitResponse {
  const rounds = claims.rounds.map((target, index) => {
    const round = {
      roundNumber: index + 1,
      target: { h: target.h, s: target.s, v: target.v },
      guess: { ...guesses[index] },
      score: game.rounds[index].score,
      diff: { ...game.rounds[index].diff },
      ...(claims.mode === "room" && timedOut !== undefined ? { timedOut: timedOut[index] } : {}),
    };

    return round;
  });

  return {
    mode: claims.mode,
    totalScore: sqlResult.total_score,
    rounds: [rounds[0], rounds[1], rounds[2]],
    totalGamesPlayed: sqlResult.total_games_played,
    pb: {
      scope: sqlResult.pb.scope,
      previous: sqlResult.pb.previous,
      current: sqlResult.pb.current,
      updated: sqlResult.pb.updated,
      beatExisting: sqlResult.pb.beat_existing,
    },
    streak: sqlResult.streak ?? null,
    achievements: sqlResult.unlocked.map((achievement) => ({
      id: achievement.achievement_id,
      name: achievement.name,
      description: achievement.description,
    })),
    room: null,
  };
}

function buildRoomResponse(
  claims: GameTokenClaims,
  guesses: readonly [Hsv, Hsv, Hsv],
  game: GameResult,
  sqlResult: Awaited<ReturnType<typeof submitRoomAttempt>>,
  timedOut: readonly boolean[],
): GameSubmitResponse {
  const rounds = claims.rounds.map((target, index) => ({
    roundNumber: index + 1,
    target: { h: target.h, s: target.s, v: target.v },
    guess: { ...guesses[index] },
    score: game.rounds[index].score,
    diff: { ...game.rounds[index].diff },
    // Room rounds always report `timedOut` (false when the client sent none).
    timedOut: timedOut[index] ?? false,
  }));

  return {
    mode: "room",
    totalScore: sqlResult.total_score,
    rounds: [rounds[0], rounds[1], rounds[2]],
    totalGamesPlayed: null,
    pb: null,
    streak: null,
    achievements: [],
    room: {
      attemptNumber: sqlResult.attempt_number,
      bestScore: sqlResult.best_score,
      isNewBest: sqlResult.is_new_best,
      attemptsRemaining: sqlResult.attempts_remaining,
      memberStatus: sqlResult.member_status,
      roomStatus: sqlResult.room_status,
    },
  };
}

/**
 * Room attempt: exactly one `submit_room_attempt` call (which consumes the
 * attempt and may finish the room). Users, PBs, streaks and achievements are
 * never touched. Mongo uses the service's `now` because the SQL function has no
 * `played_at` parameter (it stamps `best_achieved_at` with the DB clock).
 */
async function submitRoomGame(
  userId: number,
  claims: GameTokenClaims,
  guesses: [Hsv, Hsv, Hsv],
  game: GameResult,
  timedOut: boolean[] | undefined,
  now: Date,
): Promise<GameSubmitResponse> {
  if (claims.rid === undefined) {
    throw new AppError("TOKEN_INVALID", "Room tokens require a room id.");
  }

  const sqlResult = await submitRoomAttempt({
    userId,
    roomId: claims.rid,
    roundScores: [game.rounds[0].score, game.rounds[1].score, game.rounds[2].score],
  });

  const roomTimedOut = timedOut ?? Array.from({ length: ROUNDS_PER_GAME }, () => false);

  const historyDocument = buildHistoryDocument({
    token: claims,
    userId,
    guesses,
    roundResults: game.rounds,
    total: game.total,
    playedAt: now,
    roomAttemptNumber: sqlResult.attempt_number,
    timedOut: roomTimedOut,
  });

  await insertHistoryBestEffort(historyDocument, {
    userId,
    mode: claims.mode,
    jti: claims.jti,
  });

  return buildRoomResponse(claims, guesses, game, sqlResult, roomTimedOut);
}

/** Starts a game and returns the display targets plus a signed game token. */
export async function startGame(
  userId: number,
  input: GameStartRequest,
  now: Date,
): Promise<GameStartResponse> {
  const context = await startContextForMode(userId, input, now);
  const signed = await signGameToken(
    {
      userId,
      mode: input.mode,
      rounds: context.rounds,
      ...context.tokenContext,
    },
    now,
  );

  return {
    gameToken: signed.token,
    mode: input.mode,
    revealMs: REVEAL_MS,
    timerSeconds: context.timerSeconds,
    expiresAt: new Date(signed.claims.exp * 1000).toISOString(),
    challengeDate: context.challengeDate,
    roomCode: context.roomCode,
    rounds: context.rounds.map((target, index) => ({
      roundNumber: index + 1,
      target: { h: target.h, s: target.s, v: target.v },
    })),
  };
}

/**
 * Scores one round for immediate feedback without writing anything.
 *
 * This is deliberately stateless: the signed token carries the target, and
 * the `SUBMISSION_TOO_FAST` floor is waived because a first guess can happen
 * before 13 seconds. The final `submitGame` call remains the only persistence
 * path and still enforces the floor.
 */
export async function scoreRoundPreview(
  userId: number,
  input: GameRoundScoreRequest,
  now: Date,
): Promise<GameRoundScoreResponse> {
  const claims = await verifyGameToken(input.gameToken, {
    userId,
    now,
    enforceMinimumElapsed: false,
  });

  const target = claims.rounds[input.roundNumber - 1];
  if (!target) {
    throw new AppError("VALIDATION_ERROR", "That round does not exist in this game.");
  }
  if (!isValidHsv(input.guess)) {
    throw new AppError("VALIDATION_ERROR", "The guess must be a valid HSV color.");
  }

  const guess = normalizeHsv(input.guess);
  const round = scoreRound(target, guess);

  return {
    roundNumber: input.roundNumber,
    target: { h: target.h, s: target.s, v: target.v },
    guess,
    score: round.score,
    diff: round.diff,
  };
}

/**
 * Verifies and scores one completed game, writes Postgres first, then Mongo
 * best-effort. Targets and play order come only from the verified token.
 */
export async function submitGame(
  userId: number,
  input: GameSubmitRequest,
  now: Date,
): Promise<GameSubmitResponse> {
  const claims = await verifyGameToken(input.gameToken, { userId, now });

  const guesses = normalizeGuesses(input.guesses);
  const timedOut = normalizeTimedOut(claims, input.timedOut);
  const game = scoreGame(claims.rounds, guesses);

  if (claims.mode === "room") {
    return submitRoomGame(userId, claims, guesses, game, timedOut, now);
  }

  // Daily tokens always carry `cid` (verifyGameToken enforces it); the id comes
  // only from the signed token, never from the request body.
  if (claims.mode === "daily" && claims.cid === undefined) {
    throw new AppError("TOKEN_INVALID", "Daily tokens require a challenge id.");
  }

  const sqlResult = await submitGameResult({
    userId,
    mode: claims.mode,
    challengeId: claims.mode === "daily" ? (claims.cid ?? null) : null,
    roundScores: [game.rounds[0].score, game.rounds[1].score, game.rounds[2].score],
    playedAt: now,
  });

  const historyDocument = buildHistoryDocument({
    token: claims,
    userId,
    guesses,
    roundResults: game.rounds,
    total: game.total,
    playedAt: now,
    ...(timedOut !== undefined ? { timedOut } : {}),
  });

  await insertHistoryBestEffort(historyDocument, {
    userId,
    mode: claims.mode,
    jti: claims.jti,
  });

  return buildSubmitResponse(claims, guesses, game, sqlResult, timedOut);
}
