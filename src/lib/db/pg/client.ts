import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getEnv } from "@/lib/config/env";

import * as schema from "./schema";

/**
 * PostgreSQL connection — Architecture §5.8.1.
 *
 * One postgres.js client (and Drizzle instance) per process. `prepare: false`
 * is required for Supabase's transaction-mode pooler. In development the
 * connection is cached on `globalThis` so hot reloads do not leak clients.
 */

type SqlClient = ReturnType<typeof postgres>;
export type Database = PostgresJsDatabase<typeof schema>;

interface PgConnection {
  sql: SqlClient;
  db: Database;
}

const globalForPg = globalThis as typeof globalThis & {
  __chromamatchPg?: PgConnection;
};

let productionConnection: PgConnection | undefined;

function createConnection(): PgConnection {
  const env = getEnv();
  const isProduction = env.NODE_ENV === "production";

  const sql = postgres(env.DATABASE_URL, {
    // Required for transaction-mode poolers (Supabase).
    prepare: false,
    // Production deploys to Vercel (serverless), where each instance handles
    // one request at a time. Local development can keep a small pool.
    max: isProduction ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isProduction ? "require" : false,
  });

  return { sql, db: drizzle(sql, { schema }) };
}

function getConnection(): PgConnection {
  const env = getEnv();

  if (env.NODE_ENV === "development") {
    globalForPg.__chromamatchPg ??= createConnection();
    return globalForPg.__chromamatchPg;
  }

  productionConnection ??= createConnection();
  return productionConnection;
}

/** Shared postgres.js client (for queries that need the raw driver). */
export function getSqlClient(): SqlClient {
  return getConnection().sql;
}

/** Drizzle instance bound to the shared client. */
export function getDb(): Database {
  return getConnection().db;
}

/** Trivial liveness query used by the health endpoint. */
export async function pingPostgres(): Promise<void> {
  await getSqlClient()`select 1`;
}
