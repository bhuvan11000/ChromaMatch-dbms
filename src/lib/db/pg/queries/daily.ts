import { sql } from "drizzle-orm";

import { AppError } from "@/lib/errors";

import { getDb } from "../client";
import { mapPgError } from "../errors";

/**
 * Read-only access to Daily challenge data — Architecture §5.7.2 / §5.8.
 *
 * Every reader is parameterized and normalizes PostgreSQL types at this
 * boundary: `DATE` → `YYYY-MM-DD` string, `NUMERIC`/`BIGINT` → number,
 * `TIMESTAMPTZ` → `Date`. Services never see driver-specific shapes.
 */

export interface DailyChallengeRecord {
  challengeId: number;
  /** `YYYY-MM-DD` (UTC). */
  date: string;
}

export interface DailyChallengeColor {
  h: number;
  s: number;
  v: number;
}

export interface DailyBestRecord {
  score: number;
  achievedAt: Date;
}

export interface UserDailyStreakRecord {
  current: number;
  longest: number;
  /** `YYYY-MM-DD` or null if the user never played a Daily. */
  lastPlayedDate: string | null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Looks up the challenge for a UTC date. Never creates one. */
export async function findChallengeByDate(date: string): Promise<DailyChallengeRecord | null> {
  try {
    const rows = await getDb().execute<{
      daily_challenge_id: string | number;
      challenge_date: string;
    }>(sql`
      select "daily_challenge_id", "challenge_date"::text as "challenge_date"
      from "daily_challenges"
      where "challenge_date" = ${date}::date
    `);

    const row = rows[0];
    return row ? { challengeId: Number(row.daily_challenge_id), date: row.challenge_date } : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

/** The three colours of a challenge in colour-number order (1, 2, 3). */
export async function listChallengeColors(
  challengeId: number,
): Promise<[DailyChallengeColor, DailyChallengeColor, DailyChallengeColor]> {
  let rows: Array<{ hue: string | number; saturation: string | number; value: string | number }>;

  try {
    rows = await getDb().execute<{
      hue: string | number;
      saturation: string | number;
      value: string | number;
    }>(sql`
      select "hue", "saturation", "value"
      from "challenge_colors"
      where "daily_challenge_id" = ${challengeId}::bigint
      order by "round_number" asc
    `);
  } catch (error) {
    throw mapPgError(error);
  }

  if (rows.length !== 3) {
    throw new AppError("INTERNAL_ERROR", "A daily challenge must have exactly 3 colors.");
  }

  const colors = rows.map((row): DailyChallengeColor => ({
    h: Number(row.hue),
    s: Number(row.saturation),
    v: Number(row.value),
  }));

  return [colors[0], colors[1], colors[2]];
}

/** The user's best score for one challenge, or null if they have not played it. */
export async function findDailyBest(
  userId: number,
  challengeId: number,
): Promise<DailyBestRecord | null> {
  try {
    const rows = await getDb().execute<{
      best_score: string | number;
      achieved_at: Date | string;
    }>(sql`
      select "best_score", "achieved_at"
      from "daily_personal_bests"
      where "user_id" = ${userId}::bigint
        and "daily_challenge_id" = ${challengeId}::bigint
    `);

    const row = rows[0];
    return row ? { score: Number(row.best_score), achievedAt: toDate(row.achieved_at) } : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

/** The stored (not display-adjusted) Daily streak columns of a user. */
export async function findUserDailyStreak(userId: number): Promise<UserDailyStreakRecord> {
  let row:
    | {
        current_daily_streak: string | number;
        longest_daily_streak: string | number;
        last_daily_played_date: string | null;
      }
    | undefined;

  try {
    const rows = await getDb().execute<{
      current_daily_streak: string | number;
      longest_daily_streak: string | number;
      last_daily_played_date: string | null;
    }>(sql`
      select "current_daily_streak",
             "longest_daily_streak",
             "last_daily_played_date"::text as "last_daily_played_date"
      from "users"
      where "user_id" = ${userId}::bigint
    `);
    row = rows[0];
  } catch (error) {
    throw mapPgError(error);
  }

  if (!row) {
    throw new AppError("USER_NOT_FOUND");
  }

  return {
    current: Number(row.current_daily_streak),
    longest: Number(row.longest_daily_streak),
    lastPlayedDate: row.last_daily_played_date,
  };
}
