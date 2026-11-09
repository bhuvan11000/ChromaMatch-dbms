import { eq, sql } from "drizzle-orm";

import { AppError } from "@/lib/errors";

import { getDb } from "../client";
import { mapPgError } from "../errors";
import { users } from "../schema";

/**
 * User persistence — Architecture §5.7.1 and §5.5.1.
 *
 * All queries are parameterized by Drizzle. PostgreSQL type mapping and role
 * narrowing happen at this boundary; services only see plain objects.
 */

export type UserRole = "player" | "admin";

export interface PublicUserRecord {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  isBanned: boolean;
  createdAt: Date;
}

export interface UserRecord extends PublicUserRecord {
  passwordHash: string;
}

export interface NewUser {
  username: string;
  email: string;
  passwordHash: string;
}

const publicColumns = {
  userId: users.userId,
  username: users.username,
  email: users.email,
  role: users.role,
  isBanned: users.isBanned,
  createdAt: users.createdAt,
} as const;

type PublicRow = {
  userId: number;
  username: string;
  email: string;
  role: string;
  isBanned: boolean;
  createdAt: Date | string;
};

type UserRow = PublicRow & {
  passwordHash: string;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toRole(value: string): UserRole {
  return value === "admin" ? "admin" : "player";
}

function mapPublicRow(row: PublicRow): PublicUserRecord {
  return {
    id: Number(row.userId),
    username: row.username,
    email: row.email,
    role: toRole(row.role),
    isBanned: row.isBanned,
    createdAt: toDate(row.createdAt),
  };
}

function mapUserRow(row: UserRow): UserRecord {
  return {
    ...mapPublicRow(row),
    passwordHash: row.passwordHash,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Inserts a player account and returns the public representation (never the hash). */
export async function insertUser(input: NewUser): Promise<PublicUserRecord> {
  try {
    const rows = await getDb()
      .insert(users)
      .values({
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
      })
      .returning(publicColumns);

    const row = rows[0];
    if (!row) {
      throw new Error("insertUser returned no row");
    }

    return mapPublicRow(row);
  } catch (error) {
    throw mapPgError(error);
  }
}

/** Finds an account by normalized email, including its password hash for login. */
export async function findByEmail(email: string): Promise<UserRecord | null> {
  try {
    const rows = await getDb()
      .select({
        ...publicColumns,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);

    const row = rows[0];
    return row ? mapUserRow(row) : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

/** Finds an account by id, excluding the password hash. */
export async function findById(userId: number): Promise<PublicUserRecord | null> {
  try {
    const rows = await getDb()
      .select(publicColumns)
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    const row = rows[0];
    return row ? mapPublicRow(row) : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface UserStatsRecord {
  globalBestScore: number | null;
  globalBestAchievedAt: Date | null;
  totalGamesPlayed: number;
  currentDailyStreak: number;
  longestDailyStreak: number;
  /** `YYYY-MM-DD` or null if the user never played a Daily. */
  lastDailyPlayedDate: string | null;
}

/** Reads the counters shown on the profile; the same values the game functions maintain. */
export async function findUserStats(userId: number): Promise<UserStatsRecord> {
  let row:
    | {
        global_best_score: string | number | null;
        global_best_achieved_at: Date | string | null;
        total_games_played: string | number;
        current_daily_streak: string | number;
        longest_daily_streak: string | number;
        last_daily_played_date: string | null;
      }
    | undefined;

  try {
    const rows = await getDb().execute<{
      global_best_score: string | number | null;
      global_best_achieved_at: Date | string | null;
      total_games_played: string | number;
      current_daily_streak: string | number;
      longest_daily_streak: string | number;
      last_daily_played_date: string | null;
    }>(sql`
      select "global_best_score",
             "global_best_achieved_at",
             "total_games_played",
             "current_daily_streak",
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
    globalBestScore: row.global_best_score === null ? null : Number(row.global_best_score),
    globalBestAchievedAt:
      row.global_best_achieved_at === null
        ? null
        : row.global_best_achieved_at instanceof Date
          ? row.global_best_achieved_at
          : new Date(row.global_best_achieved_at),
    totalGamesPlayed: Number(row.total_games_played),
    currentDailyStreak: Number(row.current_daily_streak),
    longestDailyStreak: Number(row.longest_daily_streak),
    lastDailyPlayedDate: row.last_daily_played_date,
  };
}
