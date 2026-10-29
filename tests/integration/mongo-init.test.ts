import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getMongoClient, getMongoDb, getGameHistoryCollection } from "@/lib/db/mongo/client";
import { insertGame, toStoredHistoryDocument } from "@/lib/db/mongo/historyRepo";

import { GAME_HISTORY_COLLECTION, HISTORY_INDEXES, initMongo } from "../../scripts/init-mongo";

import {
  cleanupHistory,
  hsv,
  makeHistoryDocument,
  uniqueNumericId,
  type HistoryDocumentSpec,
} from "./support/mongo";

const db = getMongoDb();
const collection = getGameHistoryCollection();
const userIds: number[] = [];

beforeAll(async () => {
  await initMongo(db);
});

afterAll(async () => {
  try {
    await cleanupHistory(userIds);
  } finally {
    await getMongoClient().close();
  }
});

function validDocument(mode: "global" | "daily" | "room", userId: number): HistoryDocumentSpec {
  const withSharedFields = mode !== "global";

  return {
    userId,
    mode,
    playedAt: new Date("2026-10-17T14:32:08.000Z"),
    totalScore: 26.6,
    ...(mode === "daily" ? { dailyChallengeId: 118 } : {}),
    ...(mode === "room" ? { roomId: 7, attemptNumber: 2 } : {}),
    rounds: [
      {
        target: hsv(214.6, 62.0, 80.5),
        guess: hsv(209.0, 58.5, 77.0),
        score: 9.7,
        ...(withSharedFields ? { colorNumber: 3 } : {}),
        ...(mode === "room" ? { timedOut: false } : {}),
      },
      {
        target: hsv(12.0, 90.0, 70.0),
        guess: hsv(15.5, 88.0, 70.5),
        score: 8.9,
        ...(withSharedFields ? { colorNumber: 1 } : {}),
        ...(mode === "room" ? { timedOut: true } : {}),
      },
      {
        target: hsv(301.3, 45.5, 33.0),
        guess: hsv(300.0, 50.0, 30.0),
        score: 8.0,
        ...(withSharedFields ? { colorNumber: 2 } : {}),
        ...(mode === "room" ? { timedOut: false } : {}),
      },
    ],
  };
}

async function insertRaw(spec: HistoryDocumentSpec): Promise<unknown> {
  return collection.insertOne(toStoredHistoryDocument(makeHistoryDocument(spec)));
}

describe("MongoDB initialization (validator and indexes)", () => {
  it("creates the collection with the strict error validator", async () => {
    const info = await db
      .listCollections({ name: GAME_HISTORY_COLLECTION }, { nameOnly: false })
      .next();

    expect(info).not.toBeNull();
    expect(info?.options?.validationLevel).toBe("strict");
    expect(info?.options?.validationAction).toBe("error");
    expect(info?.options?.validator?.$jsonSchema).toBeDefined();
  });

  it("creates the four documented indexes with the correct partial filters", async () => {
    const indexes = await collection.indexes();
    const byName = new Map(indexes.map((index) => [index.name, index]));

    for (const expected of HISTORY_INDEXES) {
      const actual = byName.get(expected.name);
      expect(actual, `missing index ${expected.name}`).toBeDefined();
      expect(actual?.key).toEqual(expected.key);
      expect(actual?.partialFilterExpression).toEqual(expected.partialFilterExpression);
    }

    expect(indexes.filter((index) => index.name !== "_id_")).toHaveLength(HISTORY_INDEXES.length);
  });

  it("is idempotent", async () => {
    await initMongo(db);
    await initMongo(db);

    const indexes = await collection.indexes();
    expect(indexes.filter((index) => index.name !== "_id_")).toHaveLength(HISTORY_INDEXES.length);
  });

  it("accepts valid global, daily and room documents", async () => {
    for (const mode of ["global", "daily", "room"] as const) {
      const userId = uniqueNumericId();
      userIds.push(userId);

      const document = makeHistoryDocument(validDocument(mode, userId));
      await expect(insertGame(document)).resolves.toBeDefined();
    }
  });

  it("rejects a document with only two rounds", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const spec = validDocument("global", userId);
    const invalid = { ...spec, rounds: spec.rounds.slice(0, 2) };

    await expect(insertRaw(invalid)).rejects.toMatchObject({ code: 121 });
  });

  it("rejects a hue outside 0–360", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const spec = validDocument("global", userId);
    const invalid = {
      ...spec,
      rounds: [
        {
          ...spec.rounds[0],
          target: hsv(361.0, 50.0, 50.0),
        },
        ...spec.rounds.slice(1),
      ],
    };

    await expect(insertRaw(invalid)).rejects.toMatchObject({ code: 121 });
  });

  it("rejects a daily document without daily_challenge_id", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const spec = validDocument("daily", userId);
    const invalid = { ...spec, dailyChallengeId: undefined };

    await expect(insertRaw(invalid)).rejects.toMatchObject({ code: 121 });
  });

  it("rejects a daily round without color_number", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const spec = validDocument("daily", userId);
    const invalid = {
      ...spec,
      rounds: [{ ...spec.rounds[0], colorNumber: undefined }, ...spec.rounds.slice(1)],
    };

    await expect(insertRaw(invalid)).rejects.toMatchObject({ code: 121 });
  });

  it("rejects a room document without room_id", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const spec = validDocument("room", userId);
    const invalid = { ...spec, roomId: undefined };

    await expect(insertRaw(invalid)).rejects.toMatchObject({ code: 121 });
  });

  it("rejects a room round without color_number", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const spec = validDocument("room", userId);
    const invalid = {
      ...spec,
      rounds: [{ ...spec.rounds[0], colorNumber: undefined }, ...spec.rounds.slice(1)],
    };

    await expect(insertRaw(invalid)).rejects.toMatchObject({ code: 121 });
  });

  it("rejects a room document without attempt_number", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const spec = validDocument("room", userId);
    const invalid = { ...spec, attemptNumber: undefined };

    await expect(insertRaw(invalid)).rejects.toMatchObject({ code: 121 });
  });
});
