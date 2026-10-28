import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const collection = vi.fn((name: string) => ({ name }));
  const db = {
    collection,
    command: vi.fn(() => Promise.resolve({ ok: 1 })),
  };
  const client = { db: vi.fn(() => db) };
  const MongoClient = vi.fn(function () {
    return client;
  });

  return { collection, db, client, MongoClient };
});

vi.mock("mongodb", () => ({ MongoClient: mocks.MongoClient }));

const TEST_ENV = {
  DATABASE_URL: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  DATABASE_URL_DIRECT: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  MONGODB_URI: "mongodb://localhost:27017",
  MONGODB_DB_NAME: "chromamatch",
  SESSION_JWT_SECRET: "s".repeat(32),
  GAME_TOKEN_SECRET: "g".repeat(32),
  DAILY_SEED_SECRET: "daily-seed-secret",
  APP_ORIGIN: "http://localhost:3000",
  NODE_ENV: "test",
  LOG_LEVEL: "error",
} as const;

async function loadClient() {
  vi.resetModules();
  return import("@/lib/db/mongo/client");
}

describe("MongoDB client", () => {
  beforeEach(() => {
    delete (globalThis as typeof globalThis & { __chromamatchMongoClient?: unknown })
      .__chromamatchMongoClient;

    for (const [key, value] of Object.entries(TEST_ENV)) {
      vi.stubEnv(key, value);
    }
    mocks.MongoClient.mockClear();
    mocks.client.db.mockClear();
    mocks.collection.mockClear();
    mocks.db.command.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a small, fail-fast pool", async () => {
    const { getMongoClient } = await loadClient();

    getMongoClient();

    expect(mocks.MongoClient).toHaveBeenCalledTimes(1);
    expect(mocks.MongoClient).toHaveBeenCalledWith(TEST_ENV.MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });
  });

  it("caches the client on globalThis", async () => {
    const { getMongoClient } = await loadClient();

    const client = getMongoClient();
    expect(getMongoClient()).toBe(client);
    expect(mocks.MongoClient).toHaveBeenCalledTimes(1);
  });

  it("resolves the configured database and game history collection", async () => {
    const { getGameHistoryCollection } = await loadClient();

    expect(getGameHistoryCollection()).toEqual({ name: "game_history" });
    expect(mocks.client.db).toHaveBeenCalledWith(TEST_ENV.MONGODB_DB_NAME);
    expect(mocks.collection).toHaveBeenCalledWith("game_history");
  });

  it("pings the database", async () => {
    const { pingMongo } = await loadClient();

    await expect(pingMongo()).resolves.toBeUndefined();
    expect(mocks.db.command).toHaveBeenCalledWith({ ping: 1 });
  });
});
