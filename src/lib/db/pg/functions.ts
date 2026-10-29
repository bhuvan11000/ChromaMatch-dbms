import { sql } from "drizzle-orm";

import { AppError } from "@/lib/errors";

import { getDb } from "./client";
import { mapPgError } from "./errors";

/**
 * Typed wrappers around the PostgreSQL game/daily functions.
 * Architecture §5.8.3 and §5.8.8.
 *
 * Function names and argument order live only here. All values are bound
 * through Drizzle's `sql` template; no SQL is string-built from request data.
 */

export type GameResultMode = "global" | "daily";

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface SubmitGameResultInput {
  userId: number;
  mode: GameResultMode;
  challengeId: number | null;
  roundScores: readonly [number, number, number];
  playedAt: Date;
}

export interface SubmitGameResult {
  total_score: number;
  mode: GameResultMode;
  total_games_played: number;
  pb: {
    scope: GameResultMode;
    previous: number | null;
    current: number;
    updated: boolean;
    beat_existing: boolean;
  };
  /** Daily only; omitted for Global. */
  streak?: {
    current: number;
    longest: number;
  };
  unlocked: Array<{
    achievement_id: number;
    name: string;
    description: string;
  }>;
}

function parseJsonb<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Calls `submit_game_result` and returns its jsonb payload. */
export async function submitGameResult(input: SubmitGameResultInput): Promise<SubmitGameResult> {
  const scoreList = sql.join(
    input.roundScores.map((score) => sql`${score}::numeric`),
    sql`, `,
  );

  try {
    const rows = await getDb().execute<{ result: unknown }>(sql`
      select "submit_game_result"(
        ${input.userId}::bigint,
        ${input.mode}::text,
        ${input.challengeId}::bigint,
        array[${scoreList}]::numeric[],
        ${input.playedAt.toISOString()}::timestamptz
      ) as "result"
    `);

    const raw = rows[0]?.result;
    if (raw === undefined || raw === null) {
      throw new AppError("INTERNAL_ERROR");
    }

    return parseJsonb<SubmitGameResult>(raw);
  } catch (error) {
    throw mapPgError(error);
  }
}

/**
 * Calls `ensure_daily_challenge` and returns the challenge id as a JS number.
 * The SQL function rejects dates other than the current UTC date.
 */
export async function ensureDailyChallenge(
  date: string,
  colors: readonly [HsvColor, HsvColor, HsvColor],
): Promise<number> {
  try {
    const rows = await getDb().execute<{ challenge_id: unknown }>(sql`
      select "ensure_daily_challenge"(
        ${date}::date,
        ${JSON.stringify(colors)}::jsonb
      ) as "challenge_id"
    `);

    const challengeId = Number(rows[0]?.challenge_id);
    if (!Number.isSafeInteger(challengeId)) {
      throw new AppError("INTERNAL_ERROR");
    }

    return challengeId;
  } catch (error) {
    throw mapPgError(error);
  }
}
