import { Long } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getGameHistoryCollection, getMongoClient, getMongoDb } from "@/lib/db/mongo/client";
import { getSqlClient } from "@/lib/db/pg/client";
import { submitGame } from "@/lib/services/gameService";
import { signGameToken } from "@/lib/tokens/gameToken";

import { initMongo } from "../../scripts/init-mongo";

import { cleanupFixtures, createFixtures, createUser, readUserStats } from "./support/fixtures";
import { cleanupHistory } from "./support/mongo";

const sql = getSqlClient();
const fixtures = createFixtures();
const collection = getGameHistoryCollection();
const userIds: number[] = [];

const TARGETS = [
  { h: 214.6, s: 62.0, v: 80.5 },
  { h: 359.0, s: 50.0, v: 50.0 },
  { h: 100.0, s: 50.0, v: 50.0 },
] as const;

const FIRST_GUESSES = [
  { h: 209.0, s: 58.5, v: 77.0 },
  { h: 1.0, s: 50.0, v: 50.0 },
  { h: 190.0, s: 100.0, v: 75.0 },
];

const PERFECT_GUESSES = TARGETS.map(({ h, s, v }) => ({ h, s, v }));

const FIRST_NOW = new Date("2026-10-29T12:00:20.000Z");
const HIGHER_NOW = new Date("2026-10-29T13:00:20.000Z");
const EQUAL_NOW = new Date("2026-10-29T14:00:20.000Z");

function issuedAt(now: Date): Date {
  return new Date(now.getTime() - 20_000);
}

beforeAll(async () => {
  await initMongo(getMongoDb());
});

afterAll(async () => {
  try {
    await cleanupHistory(userIds);
    await cleanupFixtures(sql, fixtures);
  } finally {
    await Promise.allSettled([getMongoClient().close(), sql.end()]);
  }
});

describe("gameService Global submissions against real databases", () => {
  it("applies first, higher and equal PB results and stores §7.2 Global documents", async () => {
    const userId = await createUser(sql, fixtures);
    userIds.push(userId);

    const firstToken = await signGameToken(
      { userId, mode: "global", rounds: TARGETS },
      issuedAt(FIRST_NOW),
    );
    const first = await submitGame(
      userId,
      { gameToken: firstToken.token, guesses: FIRST_GUESSES },
      FIRST_NOW,
    );

    expect(first.totalScore).toBe(25.3);
    expect(first.totalGamesPlayed).toBe(1);
    expect(first.pb).toEqual({
      scope: "global",
      previous: null,
      current: 25.3,
      updated: true,
      beatExisting: false,
    });

    let stats = await readUserStats(sql, userId);
    expect(stats.globalBestScore).toBe(25.3);
    expect(stats.globalBestAchievedAt?.toISOString()).toBe(FIRST_NOW.toISOString());

    const higherToken = await signGameToken(
      { userId, mode: "global", rounds: TARGETS },
      issuedAt(HIGHER_NOW),
    );
    const higher = await submitGame(
      userId,
      { gameToken: higherToken.token, guesses: PERFECT_GUESSES },
      HIGHER_NOW,
    );

    expect(higher.totalScore).toBe(30);
    expect(higher.totalGamesPlayed).toBe(2);
    expect(higher.pb).toEqual({
      scope: "global",
      previous: 25.3,
      current: 30,
      updated: true,
      beatExisting: true,
    });

    stats = await readUserStats(sql, userId);
    expect(stats.globalBestScore).toBe(30);
    expect(stats.globalBestAchievedAt?.toISOString()).toBe(HIGHER_NOW.toISOString());

    const equalToken = await signGameToken(
      { userId, mode: "global", rounds: TARGETS },
      issuedAt(EQUAL_NOW),
    );
    const equal = await submitGame(
      userId,
      { gameToken: equalToken.token, guesses: PERFECT_GUESSES },
      EQUAL_NOW,
    );

    expect(equal.totalScore).toBe(30);
    expect(equal.totalGamesPlayed).toBe(3);
    expect(equal.pb).toEqual({
      scope: "global",
      previous: 30,
      current: 30,
      updated: false,
      beatExisting: false,
    });

    stats = await readUserStats(sql, userId);
    expect(stats.globalBestScore).toBe(30);
    expect(stats.globalBestAchievedAt?.toISOString()).toBe(HIGHER_NOW.toISOString());

    const documents = await collection
      .find({ user_id: Long.fromNumber(userId) })
      .sort({ played_at: 1 })
      .toArray();

    expect(documents).toHaveLength(3);

    for (const [index, document] of documents.entries()) {
      expect(document).toMatchObject({
        user_id: userId,
        mode: "global",
        total_score: index === 0 ? 25.3 : 30,
      });
      expect(document).not.toHaveProperty("daily_challenge_id");
      expect(document).not.toHaveProperty("room_id");
      expect(document).not.toHaveProperty("attempt_number");
      expect(document.rounds).toHaveLength(3);

      for (const round of document.rounds as Array<Record<string, unknown>>) {
        expect(round).not.toHaveProperty("color_number");
        expect(round).not.toHaveProperty("timed_out");
        expect(round.target).toEqual(expect.objectContaining({ h: expect.any(Number) }));
        expect(round.guess).toEqual(expect.objectContaining({ h: expect.any(Number) }));
        expect(round.score).toEqual(expect.any(Number));
      }
    }
  });
});
