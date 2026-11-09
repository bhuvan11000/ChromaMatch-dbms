import { sql, type SQL } from "drizzle-orm";

import { getDb } from "../client";
import { mapPgError } from "../errors";

/**
 * Admin-only user readers — Architecture §5.7.7, §5.10.7.
 *
 * The list search is a parameterized, case-insensitive literal substring on
 * username and email. All PostgreSQL numeric/date mapping happens here so the
 * service only sees plain JavaScript values.
 */

export type AdminUserRole = "player" | "admin";

export interface AdminUserRecord {
  id: number;
  username: string;
  email: string;
  role: AdminUserRole;
  isBanned: boolean;
  createdAt: Date;
  globalBestScore: number | null;
  globalBestAchievedAt: Date | null;
  totalGamesPlayed: number;
  currentDailyStreak: number;
  longestDailyStreak: number;
  /** `YYYY-MM-DD` or null if the user never played a Daily. */
  lastDailyPlayedDate: string | null;
}

export interface AdminUserListInput {
  query?: string;
  banned?: boolean;
  limit: number;
  offset: number;
}

export interface AdminUserPage {
  users: AdminUserRecord[];
  total: number;
}

export interface AdminDailyBestRecord {
  date: string;
  bestScore: number;
  achievedAt: Date;
}

type AdminUserRow = {
  user_id: string | number;
  username: string;
  email: string;
  role: string;
  is_banned: boolean;
  created_at: Date | string;
  global_best_score: string | number | null;
  global_best_achieved_at: Date | string | null;
  total_games_played: string | number;
  current_daily_streak: string | number;
  longest_daily_streak: string | number;
  last_daily_played_date: string | null;
};

type DailyBestRow = {
  challenge_date: string;
  best_score: string | number;
  achieved_at: Date | string;
};

type CountRow = {
  total: string | number;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toRole(value: string): AdminUserRole {
  return value === "admin" ? "admin" : "player";
}

function mapUserRow(row: AdminUserRow): AdminUserRecord {
  return {
    id: Number(row.user_id),
    username: row.username,
    email: row.email,
    role: toRole(row.role),
    isBanned: row.is_banned,
    createdAt: toDate(row.created_at),
    globalBestScore: row.global_best_score === null ? null : Number(row.global_best_score),
    globalBestAchievedAt:
      row.global_best_achieved_at === null ? null : toDate(row.global_best_achieved_at),
    totalGamesPlayed: Number(row.total_games_played),
    currentDailyStreak: Number(row.current_daily_streak),
    longestDailyStreak: Number(row.longest_daily_streak),
    lastDailyPlayedDate: row.last_daily_played_date,
  };
}

function buildFilters(input: Pick<AdminUserListInput, "query" | "banned">): SQL {
  const conditions: SQL[] = [];
  const query = input.query?.trim();

  if (query) {
    conditions.push(sql`(
      strpos(lower("username"), lower(${query})) > 0
      or strpos(lower("email"), lower(${query})) > 0
    )`);
  }

  if (input.banned !== undefined) {
    conditions.push(sql`"is_banned" = ${input.banned}`);
  }

  return conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
}

/** One page of the admin player list plus the total matching the same filters. */
export async function listAdminUsers(input: AdminUserListInput): Promise<AdminUserPage> {
  try {
    const rows = await getDb().execute<AdminUserRow>(sql`
      select "user_id", "username", "email", "role", "is_banned", "created_at",
             "global_best_score", "global_best_achieved_at", "total_games_played",
             "current_daily_streak", "longest_daily_streak",
             "last_daily_played_date"::text as "last_daily_played_date"
      from "users"
      ${buildFilters(input)}
      order by "user_id" asc
      limit ${input.limit} offset ${input.offset}
    `);

    const counts = await getDb().execute<CountRow>(sql`
      select count(*) as "total"
      from "users"
      ${buildFilters(input)}
    `);

    return {
      users: rows.map(mapUserRow),
      total: Number(counts[0]?.total ?? 0),
    };
  } catch (error) {
    throw mapPgError(error);
  }
}

/** Full admin detail row without the password hash. */
export async function findAdminUser(userId: number): Promise<AdminUserRecord | null> {
  try {
    const rows = await getDb().execute<AdminUserRow>(sql`
      select "user_id", "username", "email", "role", "is_banned", "created_at",
             "global_best_score", "global_best_achieved_at", "total_games_played",
             "current_daily_streak", "longest_daily_streak",
             "last_daily_played_date"::text as "last_daily_played_date"
      from "users"
      where "user_id" = ${userId}::bigint
    `);

    const row = rows[0];
    return row ? mapUserRow(row) : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

/** The user's most recent Daily personal bests, newest challenge date first. */
export async function listDailyBestsForUser(
  userId: number,
  limit: number,
): Promise<AdminDailyBestRecord[]> {
  try {
    const rows = await getDb().execute<DailyBestRow>(sql`
      select c."challenge_date"::text as "challenge_date",
             b."best_score",
             b."achieved_at"
      from "daily_personal_bests" b
      join "daily_challenges" c
        on c."daily_challenge_id" = b."daily_challenge_id"
      where b."user_id" = ${userId}::bigint
      order by c."challenge_date" desc
      limit ${limit}
    `);

    return rows.map((row) => ({
      date: row.challenge_date,
      bestScore: Number(row.best_score),
      achievedAt: toDate(row.achieved_at),
    }));
  } catch (error) {
    throw mapPgError(error);
  }
}
