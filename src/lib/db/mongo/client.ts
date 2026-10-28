import { MongoClient, type Collection, type Db, type Document } from "mongodb";

import { getEnv } from "@/lib/config/env";

/**
 * MongoDB connection — Architecture §5.9.1.
 *
 * A single client per process, cached on `globalThis` so Next.js hot reloads
 * and route modules share one connection pool. `serverSelectionTimeoutMS` is
 * kept short so a Mongo outage fails fast instead of hanging a request.
 */

export const GAME_HISTORY_COLLECTION = "game_history";

const globalForMongo = globalThis as typeof globalThis & {
  __chromamatchMongoClient?: MongoClient;
};

function createClient(): MongoClient {
  const env = getEnv();
  return new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });
}

/** Shared MongoClient. The driver connects lazily on first operation. */
export function getMongoClient(): MongoClient {
  globalForMongo.__chromamatchMongoClient ??= createClient();
  return globalForMongo.__chromamatchMongoClient;
}

export function getMongoDb(): Db {
  return getMongoClient().db(getEnv().MONGODB_DB_NAME);
}

/** The insert-only game history collection (validator/indexes arrive later). */
export function getGameHistoryCollection(): Collection<Document> {
  return getMongoDb().collection(GAME_HISTORY_COLLECTION);
}

/** Trivial liveness command used by the health endpoint. */
export async function pingMongo(): Promise<void> {
  await getMongoDb().command({ ping: 1 });
}
