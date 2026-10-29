import { eq } from "drizzle-orm";

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
