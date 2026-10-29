import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { MongoClient, type Db, type Document } from "mongodb";

/**
 * Creates/updates the MongoDB game history collection — Architecture §5.9.2.
 *
 * The script is idempotent: the collection is created with the JSON Schema
 * validator on first run, updated with `collMod` afterwards, and the four
 * indexes are created with stable names. Existing documents are never dropped.
 */

export const GAME_HISTORY_COLLECTION = "game_history";

const hsvSchema: Document = {
  bsonType: "object",
  required: ["h", "s", "v"],
  properties: {
    h: { bsonType: "number", minimum: 0, maximum: 360 },
    s: { bsonType: "number", minimum: 0, maximum: 100 },
    v: { bsonType: "number", minimum: 0, maximum: 100 },
  },
};

const roundSchema: Document = {
  bsonType: "object",
  required: ["round_number", "target", "guess", "score"],
  properties: {
    round_number: { bsonType: "int", minimum: 1, maximum: 3 },
    color_number: { bsonType: "int", minimum: 1, maximum: 3 },
    target: hsvSchema,
    guess: hsvSchema,
    score: { bsonType: "number", minimum: 0, maximum: 10 },
    timed_out: { bsonType: "bool" },
  },
};

/** JSON Schema validator from Database Design §7.6. */
export const HISTORY_VALIDATOR: Document = {
  bsonType: "object",
  required: ["user_id", "mode", "played_at", "total_score", "rounds"],
  properties: {
    _id: { bsonType: "objectId" },
    user_id: { bsonType: "long" },
    mode: { enum: ["global", "daily", "room"] },
    daily_challenge_id: { bsonType: "long" },
    room_id: { bsonType: "long" },
    attempt_number: { bsonType: "int", minimum: 1, maximum: 5 },
    played_at: { bsonType: "date" },
    total_score: { bsonType: "number", minimum: 0, maximum: 30 },
    rounds: {
      bsonType: "array",
      minItems: 3,
      maxItems: 3,
      items: roundSchema,
    },
  },
  oneOf: [
    {
      properties: { mode: { enum: ["global"] } },
    },
    {
      properties: {
        mode: { enum: ["daily"] },
        rounds: { items: { required: ["color_number"] } },
      },
      required: ["daily_challenge_id"],
    },
    {
      properties: {
        mode: { enum: ["room"] },
        rounds: { items: { required: ["color_number"] } },
      },
      required: ["room_id", "attempt_number"],
    },
  ],
};

export interface HistoryIndexSpec {
  name: string;
  key: Document;
  partialFilterExpression?: Document;
}

/** Indexes from Database Design §7.4. */
export const HISTORY_INDEXES: readonly HistoryIndexSpec[] = [
  {
    name: "game_history_user_played_at",
    key: { user_id: 1, played_at: -1 },
  },
  {
    name: "game_history_mode_played_at",
    key: { mode: 1, played_at: -1 },
  },
  {
    name: "game_history_daily_challenge_user",
    key: { daily_challenge_id: 1, user_id: 1 },
    partialFilterExpression: { mode: "daily" },
  },
  {
    name: "game_history_room_user_attempt",
    key: { room_id: 1, user_id: 1, attempt_number: 1 },
    partialFilterExpression: { mode: "room" },
  },
];

/** Creates the collection/validator if needed and ensures all indexes exist. */
export async function initMongo(db: Db): Promise<void> {
  const existing = await db
    .listCollections({ name: GAME_HISTORY_COLLECTION }, { nameOnly: true })
    .toArray();

  if (existing.length === 0) {
    await db.createCollection(GAME_HISTORY_COLLECTION, {
      validator: { $jsonSchema: HISTORY_VALIDATOR },
      validationLevel: "strict",
      validationAction: "error",
    });
  } else {
    await db.command({
      collMod: GAME_HISTORY_COLLECTION,
      validator: { $jsonSchema: HISTORY_VALIDATOR },
      validationLevel: "strict",
      validationAction: "error",
    });
  }

  const collection = db.collection(GAME_HISTORY_COLLECTION);
  for (const index of HISTORY_INDEXES) {
    await collection.createIndex(index.key, {
      name: index.name,
      ...(index.partialFilterExpression
        ? { partialFilterExpression: index.partialFilterExpression }
        : {}),
    });
  }
}

function getMongoConfig(): { uri: string; dbName: string } | null {
  if (!process.env.MONGODB_URI && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.trim() === "") {
    return null;
  }

  return {
    uri,
    dbName: process.env.MONGODB_DB_NAME?.trim() || "chromamatch",
  };
}

async function main(): Promise<void> {
  const config = getMongoConfig();
  if (!config) {
    console.error("MONGODB_URI is required to initialize MongoDB.");
    process.exitCode = 1;
    return;
  }

  const client = new MongoClient(config.uri, { serverSelectionTimeoutMS: 5000 });

  try {
    await client.connect();
    await initMongo(client.db(config.dbName));
    console.log(
      `Initialized ${config.dbName}.${GAME_HISTORY_COLLECTION} with ${HISTORY_INDEXES.length} indexes.`,
    );
  } catch (error) {
    console.error(
      "Failed to initialize MongoDB:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
