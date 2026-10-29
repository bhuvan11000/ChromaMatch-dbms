import { randomUUID } from "node:crypto";

import { errors, jwtVerify, SignJWT, type JWTPayload } from "jose";

import { GAME_MIN_ELAPSED_SECONDS, GAME_TOKEN_TTL_SECONDS } from "@/lib/config/constants";
import { getEnv } from "@/lib/config/env";
import { isValidHsv, type Hsv } from "@/lib/domain/hsv";
import { isPermutationOf123 } from "@/lib/domain/shuffle";
import { AppError } from "@/lib/errors";
import type { GameMode } from "@/lib/schemas/game";

/**
 * Signed game tokens — Architecture §5.6.
 *
 * A token carries the server-issued targets for exactly one game. It is signed
 * with GAME_TOKEN_SECRET (separate from the session secret) and is never
 * encrypted: the client may read it, but cannot change it.
 */

export const GAME_TOKEN_AUDIENCE = "chromamatch-game" as const;
export const GAME_TOKEN_TYPE = "game" as const;
export const GAME_TOKEN_ALGORITHM = "HS256" as const;

export interface GameTokenRound extends Hsv {
  /** Color number 1–3 for Daily/Room; omitted for Global. */
  n?: 1 | 2 | 3;
}

export interface GameTokenClaims {
  typ: typeof GAME_TOKEN_TYPE;
  aud: typeof GAME_TOKEN_AUDIENCE;
  sub: string;
  mode: GameMode;
  /** Daily only. */
  cid?: number;
  /** Daily only; informational. */
  cdate?: string;
  /** Room only. */
  rid?: number;
  /** Room only; null means no timer. */
  tmr?: number | null;
  /** Targets in play order. */
  rounds: [GameTokenRound, GameTokenRound, GameTokenRound];
  jti: string;
  iat: number;
  exp: number;
}

export interface SignGameTokenInput {
  userId: number;
  mode: GameMode;
  rounds: readonly GameTokenRound[];
  cid?: number;
  cdate?: string;
  rid?: number;
  tmr?: number | null;
  jti?: string;
}

export interface SignedGameToken {
  token: string;
  claims: GameTokenClaims;
}

export interface VerifyGameTokenOptions {
  userId: number;
  now: Date;
}

type ModeContext = Pick<GameTokenClaims, "cid" | "cdate" | "rid" | "tmr">;

function getGameTokenSecret(): Uint8Array {
  return new TextEncoder().encode(getEnv().GAME_TOKEN_SECRET);
}

function tokenInvalid(message?: string): AppError {
  return new AppError("TOKEN_INVALID", message);
}

function signingError(message: string): AppError {
  return new AppError("INTERNAL_ERROR", message);
}

function isSafeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isColorNumber(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isTimerSeconds(value: unknown): value is 5 | 10 | 15 | null {
  return value === null || value === 5 || value === 10 || value === 15;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildRounds(
  mode: GameMode,
  rounds: readonly GameTokenRound[],
): [GameTokenRound, GameTokenRound, GameTokenRound] {
  if (!Array.isArray(rounds) || rounds.length !== 3) {
    throw signingError("A game token requires exactly 3 rounds.");
  }

  const built = rounds.map((round, index): GameTokenRound => {
    const colorNumber = (round as { n?: unknown }).n;

    if (!isValidHsv(round)) {
      throw signingError(`Round ${index + 1} has an invalid target color.`);
    }

    const color: GameTokenRound = { h: round.h, s: round.s, v: round.v };

    if (mode === "global") {
      if (colorNumber !== undefined) {
        throw signingError("Global rounds must not carry a color number.");
      }
      return color;
    }

    if (!isColorNumber(colorNumber)) {
      throw signingError("Daily and room rounds require a color number.");
    }

    color.n = colorNumber;
    return color;
  });

  if (mode !== "global" && !isPermutationOf123(built.map((round) => round.n as number))) {
    throw signingError("Daily and room rounds must be a permutation of 1, 2 and 3.");
  }

  return [built[0], built[1], built[2]];
}

function buildModeContext(input: SignGameTokenInput): ModeContext {
  if (input.mode === "global") {
    if (
      input.cid !== undefined ||
      input.cdate !== undefined ||
      input.rid !== undefined ||
      input.tmr !== undefined
    ) {
      throw signingError("Global tokens must not carry daily or room context.");
    }
    return {};
  }

  if (input.mode === "daily") {
    if (!isSafeId(input.cid)) {
      throw signingError("Daily tokens require a challenge id.");
    }
    if (input.cdate !== undefined && !isIsoDate(input.cdate)) {
      throw signingError("Daily tokens require a valid challenge date.");
    }
    if (input.rid !== undefined || input.tmr !== undefined) {
      throw signingError("Daily tokens must not carry room context.");
    }

    return {
      cid: input.cid,
      ...(input.cdate !== undefined ? { cdate: input.cdate } : {}),
    };
  }

  if (!isSafeId(input.rid)) {
    throw signingError("Room tokens require a room id.");
  }
  if (input.cid !== undefined || input.cdate !== undefined) {
    throw signingError("Room tokens must not carry daily context.");
  }

  const tmr = input.tmr === undefined ? null : input.tmr;
  if (!isTimerSeconds(tmr)) {
    throw signingError("Room tokens require a valid timer value.");
  }

  return { rid: input.rid, tmr };
}

/** Signs one game token and returns the token plus its trusted claims. */
export async function signGameToken(
  input: SignGameTokenInput,
  now: Date = new Date(),
): Promise<SignedGameToken> {
  if (!isSafeId(input.userId)) {
    throw signingError("A valid user id is required to sign a game token.");
  }

  if (input.mode !== "global" && input.mode !== "daily" && input.mode !== "room") {
    throw signingError("Invalid game mode.");
  }

  const rounds = buildRounds(input.mode, input.rounds);
  const context = buildModeContext(input);
  const jti = input.jti ?? randomUUID();

  if (typeof jti !== "string" || jti.length === 0) {
    throw signingError("A valid token id is required.");
  }

  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + GAME_TOKEN_TTL_SECONDS;

  const claims: GameTokenClaims = {
    typ: GAME_TOKEN_TYPE,
    aud: GAME_TOKEN_AUDIENCE,
    sub: String(input.userId),
    mode: input.mode,
    ...context,
    rounds,
    jti,
    iat,
    exp,
  };

  const token = await new SignJWT({
    typ: claims.typ,
    mode: claims.mode,
    ...(claims.cid !== undefined ? { cid: claims.cid } : {}),
    ...(claims.cdate !== undefined ? { cdate: claims.cdate } : {}),
    ...(claims.rid !== undefined ? { rid: claims.rid } : {}),
    ...(claims.tmr !== undefined ? { tmr: claims.tmr } : {}),
    rounds: claims.rounds,
  })
    .setProtectedHeader({ alg: GAME_TOKEN_ALGORITHM })
    .setSubject(claims.sub)
    .setAudience(GAME_TOKEN_AUDIENCE)
    .setJti(claims.jti)
    .setIssuedAt(claims.iat)
    .setExpirationTime(claims.exp)
    .sign(getGameTokenSecret());

  return { token, claims };
}

function parseRounds(
  mode: GameMode,
  value: unknown,
): [GameTokenRound, GameTokenRound, GameTokenRound] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw tokenInvalid("A game token requires exactly 3 rounds.");
  }

  const rounds = value.map((round, index): GameTokenRound => {
    if (!isValidHsv(round)) {
      throw tokenInvalid(`Round ${index + 1} has an invalid target color.`);
    }

    const color: GameTokenRound = { h: round.h, s: round.s, v: round.v };

    if (mode === "global") {
      if ((round as { n?: unknown }).n !== undefined) {
        throw tokenInvalid("Global rounds must not carry a color number.");
      }
      return color;
    }

    const n = (round as { n?: unknown }).n;
    if (!isColorNumber(n)) {
      throw tokenInvalid("Daily and room rounds require a color number.");
    }

    color.n = n;
    return color;
  });

  if (mode !== "global" && !isPermutationOf123(rounds.map((round) => round.n as number))) {
    throw tokenInvalid("Daily and room rounds must be a permutation of 1, 2 and 3.");
  }

  return [rounds[0], rounds[1], rounds[2]];
}

function parseModeContext(mode: GameMode, payload: JWTPayload): ModeContext {
  const { cid, cdate, rid, tmr } = payload;

  if (mode === "global") {
    if (cid !== undefined || cdate !== undefined || rid !== undefined || tmr !== undefined) {
      throw tokenInvalid("Global tokens must not carry daily or room context.");
    }
    return {};
  }

  if (mode === "daily") {
    if (!isSafeId(cid)) {
      throw tokenInvalid("Daily tokens require a challenge id.");
    }
    if (cdate !== undefined && !isIsoDate(cdate)) {
      throw tokenInvalid("Daily tokens require a valid challenge date.");
    }
    if (rid !== undefined || tmr !== undefined) {
      throw tokenInvalid("Daily tokens must not carry room context.");
    }

    return {
      cid,
      ...(cdate !== undefined ? { cdate } : {}),
    };
  }

  if (!isSafeId(rid)) {
    throw tokenInvalid("Room tokens require a room id.");
  }
  if (cid !== undefined || cdate !== undefined) {
    throw tokenInvalid("Room tokens must not carry daily context.");
  }
  if (!isTimerSeconds(tmr)) {
    throw tokenInvalid("Room tokens require a valid timer value.");
  }

  return { rid, tmr };
}

function isExpiredJwt(error: unknown): boolean {
  return (
    error instanceof errors.JWTExpired ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ERR_JWT_EXPIRED")
  );
}

/**
 * Verifies a game token and applies every §5.6.3 check:
 * signature/typ/aud/exp, user binding, exactly 3 rounds and elapsed time.
 */
export async function verifyGameToken(
  token: string,
  options: VerifyGameTokenOptions,
): Promise<GameTokenClaims> {
  if (!isSafeId(options.userId)) {
    throw tokenInvalid();
  }

  let payload: JWTPayload;

  try {
    const result = await jwtVerify(token, getGameTokenSecret(), {
      algorithms: [GAME_TOKEN_ALGORITHM],
      audience: GAME_TOKEN_AUDIENCE,
      requiredClaims: ["typ", "sub", "mode", "rounds", "jti", "iat", "exp"],
      currentDate: options.now,
    });
    payload = result.payload;
  } catch (error) {
    if (isExpiredJwt(error)) {
      throw new AppError("TOKEN_EXPIRED");
    }
    throw tokenInvalid();
  }

  if (payload.typ !== GAME_TOKEN_TYPE) {
    throw tokenInvalid();
  }

  if (typeof payload.sub !== "string" || !/^\d+$/.test(payload.sub)) {
    throw tokenInvalid();
  }

  const tokenUserId = Number(payload.sub);
  if (!Number.isSafeInteger(tokenUserId) || tokenUserId <= 0) {
    throw tokenInvalid();
  }

  if (tokenUserId !== options.userId) {
    throw new AppError("TOKEN_USER_MISMATCH");
  }

  const { mode } = payload;
  if (mode !== "global" && mode !== "daily" && mode !== "room") {
    throw tokenInvalid();
  }

  const rounds = parseRounds(mode, payload.rounds);
  const context = parseModeContext(mode, payload);

  if (typeof payload.jti !== "string" || payload.jti.length === 0) {
    throw tokenInvalid();
  }
  if (
    typeof payload.iat !== "number" ||
    !Number.isFinite(payload.iat) ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp)
  ) {
    throw tokenInvalid();
  }

  const elapsedSeconds = options.now.getTime() / 1000 - payload.iat;
  if (elapsedSeconds < GAME_MIN_ELAPSED_SECONDS) {
    throw new AppError("SUBMISSION_TOO_FAST");
  }

  return {
    typ: GAME_TOKEN_TYPE,
    aud: GAME_TOKEN_AUDIENCE,
    sub: payload.sub,
    mode,
    ...context,
    rounds,
    jti: payload.jti,
    iat: payload.iat,
    exp: payload.exp,
  };
}
