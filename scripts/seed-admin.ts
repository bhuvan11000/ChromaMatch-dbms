import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

/**
 * Promotes an existing account to admin (Architecture §5.5.6, §5.8.7).
 *
 * Usage: npm run db:seed-admin -- <email>
 * Uses the direct/session connection (`DATABASE_URL_DIRECT`).
 */

type SqlClient = ReturnType<typeof postgres>;

export interface PromotedAdmin {
  userId: number;
  username: string;
}

export async function promoteAdmin(sql: SqlClient, email: string): Promise<PromotedAdmin | null> {
  const normalizedEmail = email.trim();
  if (normalizedEmail === "") return null;

  const rows = await sql<{ user_id: number; username: string }[]>`
    update users
       set role = 'admin'
     where lower(email) = lower(${normalizedEmail})
     returning user_id, username
  `;

  const row = rows[0];
  if (!row) return null;

  const userId = Number(row.user_id);
  if (!Number.isSafeInteger(userId)) {
    throw new Error("Database returned an invalid user id");
  }

  return { userId, username: row.username };
}

function getDirectDatabaseUrl(): string | null {
  if (!process.env.DATABASE_URL_DIRECT && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const url = process.env.DATABASE_URL_DIRECT;
  return url && url.trim() !== "" ? url : null;
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("Usage: npm run db:seed-admin -- <email>");
    process.exitCode = 1;
    return;
  }

  const url = getDirectDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL_DIRECT is required to promote an admin.");
    process.exitCode = 1;
    return;
  }

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: process.env.NODE_ENV === "production" ? "require" : false,
  });

  try {
    const promoted = await promoteAdmin(sql, email);
    if (!promoted) {
      console.error(`No user found with email ${email}. Register the account first.`);
      process.exitCode = 1;
      return;
    }

    console.log(`Promoted ${promoted.username} (user ${promoted.userId}) to admin.`);
  } catch (error) {
    console.error(
      "Failed to promote admin:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
