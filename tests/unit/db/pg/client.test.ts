import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = vi.fn(() => Promise.resolve([{ "?column?": 1 }]));

  return {
    sql,
    postgres: vi.fn(() => sql),
    drizzle: vi.fn(() => ({ kind: "database" })),
  };
});

vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));

const TEST_ENV = {
  DATABASE_URL: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  DATABASE_URL_DIRECT: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  MONGODB_URI: "mongodb://localhost:27017",
  MONGODB_DB_NAME: "chromamatch",
  SESSION_JWT_SECRET: "s".repeat(32),
  GAME_TOKEN_SECRET: "g".repeat(32),
  DAILY_SEED_SECRET: "daily-seed-secret",
  APP_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "error",
} as const;

function stubEnv(nodeEnv: "development" | "test" | "production"): void {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    vi.stubEnv(key, value);
  }
  vi.stubEnv("NODE_ENV", nodeEnv);
}

async function loadClient() {
  vi.resetModules();
  return import("@/lib/db/pg/client");
}

describe("PostgreSQL client", () => {
  beforeEach(() => {
    mocks.postgres.mockClear();
    mocks.drizzle.mockClear();
    mocks.sql.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a lazy, non-prepared pool for local development", async () => {
    stubEnv("test");
    const { getSqlClient } = await loadClient();

    getSqlClient();

    expect(mocks.postgres).toHaveBeenCalledTimes(1);
    expect(mocks.postgres).toHaveBeenCalledWith(TEST_ENV.DATABASE_URL, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: false,
    });
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
  });

  it("reuses one client and Drizzle instance", async () => {
    stubEnv("test");
    const { getDb, getSqlClient } = await loadClient();

    const sql = getSqlClient();
    expect(getSqlClient()).toBe(sql);
    const db = getDb();
    expect(getDb()).toBe(db);

    expect(mocks.postgres).toHaveBeenCalledTimes(1);
    expect(mocks.drizzle).toHaveBeenCalledTimes(1);
  });

  it("uses a single SSL-required connection in production", async () => {
    stubEnv("production");
    const { getSqlClient } = await loadClient();

    getSqlClient();

    expect(mocks.postgres).toHaveBeenCalledWith(
      TEST_ENV.DATABASE_URL,
      expect.objectContaining({ max: 1, ssl: "require" }),
    );
  });

  it("runs a trivial liveness query", async () => {
    stubEnv("test");
    const { pingPostgres } = await loadClient();

    await expect(pingPostgres()).resolves.toBeUndefined();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
});
