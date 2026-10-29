import { SignJWT } from "jose";

import { GAME_TOKEN_TTL_SECONDS } from "@/lib/config/constants";
import type { SubmitGameResult } from "@/lib/db/pg/functions";
import type { GameMode } from "@/lib/schemas/game";
import {
  GAME_TOKEN_AUDIENCE,
  GAME_TOKEN_TYPE,
  signGameToken,
  type GameTokenRound,
} from "@/lib/tokens/gameToken";

import { AUTH_TEST_ENV } from "./auth";

/** Shared fixtures for game token/service/API unit tests. */

export const GAME_TEST_NOW = new Date("2026-10-29T12:00:20.000Z");
export const GAME_TEST_ISSUED_AT = new Date(GAME_TEST_NOW.getTime() - 20_000);

export const FIXED_TARGETS: [GameTokenRound, GameTokenRound, GameTokenRound] = [
  { h: 214.6, s: 62.0, v: 80.5 },
  { h: 359.0, s: 50.0, v: 50.0 },
  { h: 100.0, s: 50.0, v: 50.0 },
];

export const FIXED_SHARED_TARGETS: [GameTokenRound, GameTokenRound, GameTokenRound] = [
  { h: 214.6, s: 62.0, v: 80.5, n: 3 },
  { h: 359.0, s: 50.0, v: 50.0, n: 1 },
  { h: 100.0, s: 50.0, v: 50.0, n: 2 },
];

export const FIXED_GUESSES = [
  { h: 209.0, s: 58.5, v: 77.0 },
  { h: 1.0, s: 50.0, v: 50.0 },
  { h: 190.0, s: 100.0, v: 75.0 },
];

/** §5.4.1 vectors: 9.7 + 9.9 + 5.7 = 25.3. */
export const EXPECTED_ROUND_SCORES = [9.7, 9.9, 5.7] as const;
export const EXPECTED_TOTAL = 25.3 as const;

export interface MintGameTokenOptions {
  userId?: number;
  mode?: GameMode;
  rounds?: readonly GameTokenRound[];
  issuedAt?: Date;
  cid?: number;
  cdate?: string;
  rid?: number;
  tmr?: number | null;
  jti?: string;
}

export async function mintGameToken(
  options: MintGameTokenOptions = {},
): Promise<{ token: string; claims: Awaited<ReturnType<typeof signGameToken>>["claims"] }> {
  const mode = options.mode ?? "global";
  const rounds = options.rounds ?? (mode === "global" ? FIXED_TARGETS : FIXED_SHARED_TARGETS);

  const cid = options.cid ?? (mode === "daily" ? 118 : undefined);
  const cdate = options.cdate ?? (mode === "daily" ? "2026-10-29" : undefined);
  const rid = options.rid ?? (mode === "room" ? 7 : undefined);
  const tmr = mode === "room" ? (options.tmr === undefined ? null : options.tmr) : undefined;

  return signGameToken(
    {
      userId: options.userId ?? 7,
      mode,
      rounds,
      ...(cid !== undefined ? { cid } : {}),
      ...(cdate !== undefined ? { cdate } : {}),
      ...(rid !== undefined ? { rid } : {}),
      ...(tmr !== undefined ? { tmr } : {}),
      ...(options.jti !== undefined ? { jti: options.jti } : {}),
    },
    options.issuedAt ?? GAME_TEST_ISSUED_AT,
  );
}

export interface RawGameTokenOptions {
  sub?: string;
  audience?: string;
  typ?: string;
  mode?: string;
  rounds?: unknown;
  iat?: number;
  exp?: number | null;
  jti?: string;
  extra?: Record<string, unknown>;
}

/** Mints a token with deliberately wrong claims for negative verification tests. */
export async function mintRawGameToken(options: RawGameTokenOptions = {}): Promise<string> {
  const iat = options.iat ?? Math.floor(GAME_TEST_ISSUED_AT.getTime() / 1000);
  const exp = options.exp === undefined ? iat + GAME_TOKEN_TTL_SECONDS : options.exp;

  let jwt = new SignJWT({
    typ: options.typ ?? GAME_TOKEN_TYPE,
    mode: options.mode ?? "global",
    rounds: options.rounds ?? FIXED_TARGETS,
    ...options.extra,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(options.sub ?? "7")
    .setAudience(options.audience ?? GAME_TOKEN_AUDIENCE)
    .setJti(options.jti ?? "raw-game-jti")
    .setIssuedAt(iat);

  if (exp !== null) {
    jwt = jwt.setExpirationTime(exp);
  }

  return jwt.sign(new TextEncoder().encode(AUTH_TEST_ENV.GAME_TOKEN_SECRET));
}

export interface SubmitGameResultOverrides extends Partial<Omit<SubmitGameResult, "pb">> {
  pb?: SubmitGameResult["pb"];
}

export function makeSubmitGameResult(overrides: SubmitGameResultOverrides = {}): SubmitGameResult {
  return {
    total_score: EXPECTED_TOTAL,
    mode: "global",
    total_games_played: 1,
    pb: {
      scope: "global",
      previous: null,
      current: EXPECTED_TOTAL,
      updated: true,
      beat_existing: false,
    },
    unlocked: [],
    ...overrides,
  };
}

export function makeGlobalPb(
  previous: number | null,
  current: number,
  updated: boolean,
  beatExisting: boolean,
): SubmitGameResult["pb"] {
  return {
    scope: "global",
    previous,
    current,
    updated,
    beat_existing: beatExisting,
  };
}
