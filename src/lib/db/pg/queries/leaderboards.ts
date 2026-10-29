import { sql } from "drizzle-orm";

import { getDb } from "../client";
import { mapPgError } from "../errors";

/**
 * Read-only access to the leaderboard views — Architecture §5.8.5.
 *
 * The views already exclude banned players and attach deterministic ranks.
 * This module only paginates and normalizes PostgreSQL's numeric/bigint/date
 * representations at the data-access boundary.
 */

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  score: number;
  achievedAt: Date;
}

export interface DailyLeaderboardEntry extends LeaderboardEntry {
  dailyChallengeId: number;
  challengeDate: string;
}

export interface LeaderboardPage<T> {
  entries: T[];
  total: number;
}

type GlobalLeaderboardRow = {
  rank: string | number;
  user_id: string | number;
  username: string;
  score: string | number;
  achieved_at: Date | string;
};

type DailyLeaderboardRow = GlobalLeaderboardRow & {
  daily_challenge_id: string | number;
  challenge_date: Date | string;
};

type CountRow = {
  total: string | number;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toDateOnly(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapGlobalRow(row: GlobalLeaderboardRow): LeaderboardEntry {
  return {
    rank: Number(row.rank),
    userId: Number(row.user_id),
    username: row.username,
    score: Number(row.score),
    achievedAt: toDate(row.achieved_at),
  };
}

function mapDailyRow(row: DailyLeaderboardRow): DailyLeaderboardEntry {
  return {
    ...mapGlobalRow(row),
    dailyChallengeId: Number(row.daily_challenge_id),
    challengeDate: toDateOnly(row.challenge_date),
  };
}

export interface LeaderboardQuery {
  limit: number;
  offset: number;
}

/** Reads one page of `global_leaderboard` plus the total number of ranked players. */
export async function listGlobalLeaderboard(
  input: LeaderboardQuery,
): Promise<LeaderboardPage<LeaderboardEntry>> {
  try {
    const rows = await getDb().execute<GlobalLeaderboardRow>(sql`
      select "rank", "user_id", "username", "score", "achieved_at"
      from "global_leaderboard"
      order by "rank"
      limit ${input.limit} offset ${input.offset}
    `);

    const counts = await getDb().execute<CountRow>(sql`
      select count(*) as "total" from "global_leaderboard"
    `);

    return {
      entries: rows.map(mapGlobalRow),
      total: Number(counts[0]?.total ?? 0),
    };
  } catch (error) {
    throw mapPgError(error);
  }
}

/** Returns the viewer's own row from the same view, or null if absent. */
export async function findGlobalLeaderboardEntry(userId: number): Promise<LeaderboardEntry | null> {
  try {
    const rows = await getDb().execute<GlobalLeaderboardRow>(sql`
      select "rank", "user_id", "username", "score", "achieved_at"
      from "global_leaderboard"
      where "user_id" = ${userId}::bigint
    `);

    const row = rows[0];
    return row ? mapGlobalRow(row) : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface DailyLeaderboardQuery extends LeaderboardQuery {
  /** UTC challenge date, `YYYY-MM-DD`. */
  date: string;
}

/** Reads one page of `daily_leaderboard` for a date, plus the total for that day. */
export async function listDailyLeaderboard(
  input: DailyLeaderboardQuery,
): Promise<LeaderboardPage<DailyLeaderboardEntry>> {
  try {
    const rows = await getDb().execute<DailyLeaderboardRow>(sql`
      select "daily_challenge_id", "challenge_date", "rank", "user_id",
             "username", "score", "achieved_at"
      from "daily_leaderboard"
      where "challenge_date" = ${input.date}::date
      order by "rank"
      limit ${input.limit} offset ${input.offset}
    `);

    const counts = await getDb().execute<CountRow>(sql`
      select count(*) as "total"
      from "daily_leaderboard"
      where "challenge_date" = ${input.date}::date
    `);

    return {
      entries: rows.map(mapDailyRow),
      total: Number(counts[0]?.total ?? 0),
    };
  } catch (error) {
    throw mapPgError(error);
  }
}

/** Returns the viewer's own row for a daily challenge, or null if absent. */
export async function findDailyLeaderboardEntry(
  date: string,
  userId: number,
): Promise<DailyLeaderboardEntry | null> {
  try {
    const rows = await getDb().execute<DailyLeaderboardRow>(sql`
      select "daily_challenge_id", "challenge_date", "rank", "user_id",
             "username", "score", "achieved_at"
      from "daily_leaderboard"
      where "challenge_date" = ${date}::date
        and "user_id" = ${userId}::bigint
    `);

    const row = rows[0];
    return row ? mapDailyRow(row) : null;
  } catch (error) {
    throw mapPgError(error);
  }
}
