import { REVEAL_MS, ROUNDS_PER_GAME } from "@/lib/config/constants";
import { buildHistoryDocument, insertGame, type HistoryDocument } from "@/lib/db/mongo/historyRepo";
import { submitGameResult } from "@/lib/db/pg/functions";
import { generateRandomColors } from "@/lib/domain/colors";
import { isValidHsv, normalizeHsv, type Hsv } from "@/lib/domain/hsv";
import { scoreGame, type GameResult } from "@/lib/domain/scoring";
import { randomPermutation } from "@/lib/domain/shuffle";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type {
  GameMode,
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

/**
 * Game use-cases — Architecture §5.7.3 and §5.12.1.
 *
 * Global and Daily are implemented. Room is still an explicit branch so a
 * later step can add it without changing the submit pipeline.
 */

interface StartContext {
  /** Targets in play order; Daily/Room rounds carry their 1-based colour number. */
  rounds: [GameTokenRound, GameTokenRound, GameTokenRound];
  timerSeconds: 5 | 10 | 15 | null;
  challengeDate: string | null;
  roomCode: string | null;
  /** Extra signed claims for the token (Daily `cid`/`cdate`). */
  tokenContext: { cid?: number; cdate?: string };
}

function notImplemented(mode: GameMode): never {
  throw new AppError("INTERNAL_ERROR", `NOT_IMPLEMENTED: ${mode} mode is not available yet.`);
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

async function startContextForMode(
  input: GameStartRequest,
  now: Date,
): Promise<StartContext> {
  switch (input.mode) {
    case "global":
      return startGlobal();
    case "daily":
      return startDaily(now);
    case "room":
      return notImplemented(input.mode);
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

function normalizeTimedOut(
  mode: GameMode,
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

  if (mode !== "room" && timedOut.some(Boolean)) {
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

/** Starts a game and returns the display targets plus a signed game token. */
export async function startGame(
  userId: number,
  input: GameStartRequest,
  now: Date,
): Promise<GameStartResponse> {
  const context = await startContextForMode(input, now);
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
 * Verifies and scores one completed game, writes Postgres first, then Mongo
 * best-effort. Targets and play order come only from the verified token.
 */
export async function submitGame(
  userId: number,
  input: GameSubmitRequest,
  now: Date,
): Promise<GameSubmitResponse> {
  const claims = await verifyGameToken(input.gameToken, { userId, now });

  if (claims.mode === "room") {
    notImplemented(claims.mode);
  }

  const guesses = normalizeGuesses(input.guesses);
  const timedOut = normalizeTimedOut(claims.mode, input.timedOut);
  const game = scoreGame(claims.rounds, guesses);

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
