import { Long } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { getMongoClient, getGameHistoryCollection, getMongoDb } from "@/lib/db/mongo/client";
import {
  buildHistoryDocument,
  insertGame,
  listUserHistory,
  type GameMode,
  type HistoryHsv,
  type HistoryToken,
} from "@/lib/db/mongo/historyRepo";

import { initMongo } from "../../scripts/init-mongo";

import { cleanupHistory, hsv, makeHistoryDocument, uniqueNumericId } from "./support/mongo";

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

const playedAt = new Date("2026-10-17T14:32:08.000Z");
const guesses: HistoryHsv[] = [
  hsv(11.0, 21.0, 31.0),
  hsv(111.0, 41.0, 51.0),
  hsv(211.0, 61.0, 71.0),
];
const roundResults = [{ score: 9.1 }, { score: 8.2 }, { score: 7.3 }];

function tokenFor(mode: GameMode): HistoryToken {
  const rounds = [
    { h: 10.0, s: 20.0, v: 30.0, ...(mode === "global" ? {} : { n: 3 }) },
    { h: 110.0, s: 40.0, v: 50.0, ...(mode === "global" ? {} : { n: 1 }) },
    { h: 210.0, s: 60.0, v: 70.0, ...(mode === "global" ? {} : { n: 2 }) },
  ];

  return {
    mode,
    ...(mode === "daily" ? { cid: 118 } : {}),
    ...(mode === "room" ? { rid: 7 } : {}),
    rounds,
  };
}

function build(mode: GameMode, userId: number) {
  return buildHistoryDocument({
    token: tokenFor(mode),
    userId,
    guesses,
    roundResults,
    total: 24.6,
    playedAt,
    ...(mode === "room" ? { roomAttemptNumber: 2, timedOut: [false, true, false] } : {}),
  });
}

function globalDocument(userId: number, when: Date) {
  return makeHistoryDocument({
    userId,
    mode: "global",
    playedAt: when,
    totalScore: 24.6,
    rounds: [
      { target: hsv(10, 20, 30), guess: hsv(11, 21, 31), score: 9.1 },
      { target: hsv(110, 40, 50), guess: hsv(111, 41, 51), score: 8.2 },
      { target: hsv(210, 60, 70), guess: hsv(211, 61, 71), score: 7.3 },
    ],
  });
}

describe("MongoDB history document builder", () => {
  it("builds a Global document without Daily/Room fields", () => {
    const userId = uniqueNumericId();
    const document = build("global", userId);

    expect(document).toMatchObject({
      user_id: userId,
      mode: "global",
      played_at: playedAt,
      total_score: 24.6,
    });
    expect(document).not.toHaveProperty("daily_challenge_id");
    expect(document).not.toHaveProperty("room_id");
    expect(document).not.toHaveProperty("attempt_number");
    expect(document.rounds).toHaveLength(3);
    expect(document.rounds[0]).toMatchObject({
      round_number: 1,
      target: hsv(10, 20, 30),
      guess: hsv(11, 21, 31),
      score: 9.1,
    });
    expect(document.rounds[0]).not.toHaveProperty("color_number");
    expect(document.rounds[0]).not.toHaveProperty("timed_out");
  });

  it("builds a Daily document with the challenge id and color numbers", () => {
    const userId = uniqueNumericId();
    const document = build("daily", userId);

    expect(document.daily_challenge_id).toBe(118);
    expect(document.rounds.map((round) => round.color_number)).toEqual([3, 1, 2]);
    expect(document.rounds.every((round) => round.timed_out === undefined)).toBe(true);
  });

  it("builds a Room document with room id, attempt number and timeout flags", () => {
    const userId = uniqueNumericId();
    const document = build("room", userId);

    expect(document.room_id).toBe(7);
    expect(document.attempt_number).toBe(2);
    expect(document.rounds.map((round) => round.color_number)).toEqual([3, 1, 2]);
    expect(document.rounds.map((round) => round.timed_out)).toEqual([false, true, false]);
  });

  it("rejects an incomplete round list", () => {
    const token = tokenFor("global");
    const incomplete: HistoryToken = { ...token, rounds: token.rounds.slice(0, 2) };

    expect(() =>
      buildHistoryDocument({
        token: incomplete,
        userId: uniqueNumericId(),
        guesses,
        roundResults,
        total: 24.6,
        playedAt,
      }),
    ).toThrowError(AppError);
  });
});

describe("MongoDB history repository", () => {
  it("wraps Postgres ids as BSON Long on write", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const dailyId = await insertGame(build("daily", userId));
    const roomId = await insertGame(build("room", userId));

    const daily = await collection.findOne({ _id: dailyId }, { promoteLongs: false });
    const room = await collection.findOne({ _id: roomId }, { promoteLongs: false });

    expect(Long.isLong(daily?.user_id)).toBe(true);
    expect(Long.isLong(daily?.daily_challenge_id)).toBe(true);
    expect(daily?.user_id?.toNumber()).toBe(userId);
    expect(daily?.daily_challenge_id?.toNumber()).toBe(118);

    expect(Long.isLong(room?.user_id)).toBe(true);
    expect(Long.isLong(room?.room_id)).toBe(true);
    expect(room?.room_id?.toNumber()).toBe(7);
  });

  it("paginates newest first and tie-breaks on _id", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    const first = await insertGame(globalDocument(userId, new Date("2026-10-01T10:00:00.000Z")));
    const second = await insertGame(globalDocument(userId, new Date("2026-10-02T11:00:00.000Z")));
    const third = await insertGame(globalDocument(userId, new Date("2026-10-02T11:00:00.000Z")));

    const pageOne = await listUserHistory(userId, { limit: 1 });
    expect(pageOne.items.map((item) => item.id)).toEqual([third.toHexString()]);
    expect(pageOne.nextCursor).not.toBeNull();

    const pageTwo = await listUserHistory(userId, {
      limit: 1,
      cursor: pageOne.nextCursor ?? undefined,
    });
    expect(pageTwo.items.map((item) => item.id)).toEqual([second.toHexString()]);
    expect(pageTwo.nextCursor).not.toBeNull();

    const pageThree = await listUserHistory(userId, {
      limit: 1,
      cursor: pageTwo.nextCursor ?? undefined,
    });
    expect(pageThree.items.map((item) => item.id)).toEqual([first.toHexString()]);
    expect(pageThree.nextCursor).toBeNull();

    const allIds = [
      ...pageOne.items.map((item) => item.id),
      ...pageTwo.items.map((item) => item.id),
      ...pageThree.items.map((item) => item.id),
    ];
    expect(new Set(allIds).size).toBe(3);
  });

  it("returns all modes in a user's history", async () => {
    const userId = uniqueNumericId();
    userIds.push(userId);

    await insertGame(globalDocument(userId, new Date("2026-10-01T10:00:00.000Z")));
    await insertGame(build("daily", userId));
    await insertGame(build("room", userId));

    const page = await listUserHistory(userId, { limit: 10 });
    expect(new Set(page.items.map((item) => item.mode))).toEqual(
      new Set(["global", "daily", "room"]),
    );
    expect(page.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor and an invalid limit", async () => {
    const userId = uniqueNumericId();

    await expect(
      listUserHistory(userId, { limit: 10, cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(listUserHistory(userId, { limit: 0 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
