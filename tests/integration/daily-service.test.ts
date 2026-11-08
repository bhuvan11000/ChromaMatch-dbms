import { Long } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getGameHistoryCollection, getMongoClient, getMongoDb } from "@/lib/db/mongo/client";
import { getSqlClient } from "@/lib/db/pg/client";
import { ensureDailyChallenge } from "@/lib/db/pg/functions";
import { scoreGame } from "@/lib/domain/scoring";
import { utcDateString } from "@/lib/domain/time";
import {
  getChallengeByDate,
  getOrCreateToday,
  getTodaySummary,
} from "@/lib/services/dailyChallengeService";
import { startGame, submitGame } from "@/lib/services/gameService";
import { signGameToken, verifyGameToken } from "@/lib/tokens/gameToken";

import { initMongo } from "../../scripts/init-mongo";

import {
  cleanupFixtures,
  createChallenge,
  createFixtures,
  createUser,
  readChallengeColors,
  readDailyBest,
  readUserStats,
} from "./support/fixtures";
import { cleanupHistory } from "./support/mongo";

/**
 * Daily mode against real Postgres + Mongo.
 *
 * `ensure_daily_challenge` only accepts the DB's current UTC date, so tests of
 * other days use pre-created fixture challenges (direct SQL) plus tokens signed
 * against them; they never call `ensure_daily_challenge` with a past date.
 */

const sql = getSqlClient();
const fixtures = createFixtures();
const collection = getGameHistoryCollection();
const userIds: number[] = [];

let todayExistedBefore = true;

const FIXTURE_COLORS = [
  { h: 12, s: 50, v: 50 },
  { h: 120, s: 60, v: 70 },
  { h: 300, s: 40, v: 30 },
] as const;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A random far-past base date so repeated runs do not collide. */
function randomPastBase(): string {
  const offset = Math.floor(Math.random() * 20_000);
  return addDays("1900-01-01", offset);
}

function issuedAt(now: Date): Date {
  return new Date(now.getTime() - 20_000);
}

async function newUser(): Promise<number> {
  const userId = await createUser(sql, fixtures);
  userIds.push(userId);
  return userId;
}

/** Plays a fixture challenge with a token whose play order is 3, 1, 2. */
async function playFixture(
  userId: number,
  challenge: { challengeId: number; date: string },
  guessesOffset: number,
  now: Date,
) {
  const order = [2, 0, 1];
  const rounds = order.map((index) => ({
    ...FIXTURE_COLORS[index]!,
    n: (index + 1) as 1 | 2 | 3,
  }));
  const signed = await signGameToken(
    {
      userId,
      mode: "daily",
      rounds,
      cid: challenge.challengeId,
      cdate: challenge.date,
    },
    issuedAt(now),
  );

  const guesses = rounds.map((round) => ({
    h: (round.h + guessesOffset) % 360,
    s: round.s,
    v: round.v,
  }));
  const expected = scoreGame(
    rounds as unknown as Parameters<typeof scoreGame>[0],
    guesses as unknown as Parameters<typeof scoreGame>[1],
  );
  const result = await submitGame(userId, { gameToken: signed.token, guesses }, now);

  return { result, expectedTotal: expected.total };
}

beforeAll(async () => {
  await initMongo(getMongoDb());

  const rows = await sql<{ daily_challenge_id: number }[]>`
    select daily_challenge_id
    from daily_challenges
    where challenge_date = (now() at time zone 'utc')::date
  `;
  todayExistedBefore = rows.length > 0;
});

afterAll(async () => {
  try {
    if (!todayExistedBefore) {
      const rows = await sql<{ daily_challenge_id: number }[]>`
        select daily_challenge_id
        from daily_challenges
        where challenge_date = (now() at time zone 'utc')::date
      `;
      for (const row of rows) {
        fixtures.challengeIds.push(Number(row.daily_challenge_id));
      }
    }
    await cleanupHistory(userIds);
    await cleanupFixtures(sql, fixtures);
  } finally {
    await Promise.allSettled([getMongoClient().close(), sql.end()]);
  }
});

describe("dailyChallengeService against real databases", () => {
  // First on purpose: on a clean day this is the real creation race.
  it("two concurrent first calls yield one challenge with exactly 3 colours", async () => {
    const now = new Date();
    const [a, b] = await Promise.all([getOrCreateToday(now), getOrCreateToday(now)]);

    expect(a.challengeId).toBe(b.challengeId);
    expect(a.colors).toEqual(b.colors);
    expect(a.date).toBe(utcDateString(now));

    const challenges = await sql<{ n: string }[]>`
      select count(*)::text as n from daily_challenges where challenge_date = ${a.date}::date
    `;
    expect(Number(challenges[0]?.n)).toBe(1);

    const stored = await readChallengeColors(sql, a.challengeId);
    expect(stored).toHaveLength(3);
    expect(stored.map(({ h, s, v }) => ({ h, s, v }))).toEqual(a.colors);
  });

  it("repeated calls return identical stored colours", async () => {
    const now = new Date();
    const first = await getOrCreateToday(now);
    const second = await getOrCreateToday(now);

    expect(second).toEqual(first);
  });

  it("two users get the same 3 colours on the same day (order may differ)", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const now = new Date();

    const aliceGame = await startGame(alice, { mode: "daily" }, now);
    const bobGame = await startGame(bob, { mode: "daily" }, now);

    const verifyAt = new Date(now.getTime() + 20_000);
    const aliceClaims = await verifyGameToken(aliceGame.gameToken, { userId: alice, now: verifyAt });
    const bobClaims = await verifyGameToken(bobGame.gameToken, { userId: bob, now: verifyAt });

    expect(aliceClaims.cid).toBe(bobClaims.cid);
    expect(aliceClaims.cdate).toBe(utcDateString(now));
    expect(aliceGame.challengeDate).toBe(utcDateString(now));
    expect(aliceGame.timerSeconds).toBeNull();
    expect(aliceGame.roomCode).toBeNull();

    const byNumber = (rounds: typeof aliceClaims.rounds) =>
      [...rounds]
        .sort((x, y) => (x.n ?? 0) - (y.n ?? 0))
        .map(({ h, s, v, n }) => ({ h, s, v, n }));

    expect(byNumber(aliceClaims.rounds)).toEqual(byNumber(bobClaims.rounds));

    const stored = await readChallengeColors(sql, aliceClaims.cid ?? 0);
    expect(byNumber(aliceClaims.rounds).map(({ h, s, v }) => ({ h, s, v }))).toEqual(
      stored.map(({ h, s, v }) => ({ h, s, v })),
    );
  });

  it("plays today's real challenge, reports it in the summary and never creates from the summary", async () => {
    const userId = await newUser();
    const startedAt = new Date();

    const before = await getTodaySummary(userId, startedAt);
    expect(before.myBest).toBeNull();
    expect(before.streak).toEqual({ current: 0, longest: 0 });
    expect(before.resetsAt > before.serverTime).toBe(true);

    const game = await startGame(userId, { mode: "daily" }, startedAt);
    const guesses = game.rounds.map((round) => ({ ...round.target }));
    const submitAt = new Date(startedAt.getTime() + 20_000);

    const result = await submitGame(userId, { gameToken: game.gameToken, guesses }, submitAt);

    expect(result.mode).toBe("daily");
    expect(result.totalScore).toBe(30);
    expect(result.pb).toMatchObject({ scope: "daily", previous: null, current: 30, updated: true });
    expect(result.streak).toEqual({ current: 1, longest: 1 });
    expect(result.room).toBeNull();

    const after = await getTodaySummary(userId, submitAt);
    expect(after.myBest).toEqual({ score: 30, achievedAt: submitAt.toISOString() });
    expect(after.streak).toEqual({ current: 1, longest: 1 });

    // A lapsed streak is displayed as 0 while the longest streak is untouched.
    await sql`update users set last_daily_played_date = '1900-01-01' where user_id = ${userId}`;
    const lapsed = await getTodaySummary(userId, submitAt);
    expect(lapsed.streak).toEqual({ current: 0, longest: 1 });
  });

  it("stores Daily history with daily_challenge_id and color_number", async () => {
    const userId = await newUser();
    const base = randomPastBase();
    const challenge = await createChallenge(sql, fixtures, base);
    const now = new Date("2026-10-29T12:00:20.000Z");

    await playFixture(userId, challenge, 0, now);

    const documents = await collection.find({ user_id: Long.fromNumber(userId) }).toArray();
    expect(documents).toHaveLength(1);

    const document = documents[0]!;
    expect(document).toMatchObject({ mode: "daily", total_score: 30 });
    expect(Number(document.daily_challenge_id)).toBe(challenge.challengeId);
    expect(document).not.toHaveProperty("room_id");
    expect(document).not.toHaveProperty("attempt_number");

    const rounds = document.rounds as Array<Record<string, unknown>>;
    expect(rounds.map((round) => Number(round.color_number))).toEqual([3, 1, 2]);
    for (const round of rounds) {
      expect(round).not.toHaveProperty("timed_out");
    }
  });
});

describe("Daily personal best and streak (fixture challenges)", () => {
  it("applies first, higher and equal daily personal bests", async () => {
    const userId = await newUser();
    const challenge = await createChallenge(sql, fixtures, randomPastBase());
    const t0 = new Date("2026-10-29T12:00:20.000Z");
    const t1 = new Date("2026-10-29T13:00:20.000Z");
    const t2 = new Date("2026-10-29T14:00:20.000Z");

    const first = await playFixture(userId, challenge, 30, t0);
    expect(first.result.pb).toEqual({
      scope: "daily",
      previous: null,
      current: first.expectedTotal,
      updated: true,
      beatExisting: false,
    });

    const higher = await playFixture(userId, challenge, 0, t1);
    expect(higher.result.totalScore).toBe(30);
    expect(higher.result.pb).toEqual({
      scope: "daily",
      previous: first.expectedTotal,
      current: 30,
      updated: true,
      beatExisting: true,
    });

    const equal = await playFixture(userId, challenge, 0, t2);
    expect(equal.result.pb).toEqual({
      scope: "daily",
      previous: 30,
      current: 30,
      updated: false,
      beatExisting: false,
    });

    const best = await readDailyBest(sql, userId, challenge.challengeId);
    expect(best?.bestScore).toBe(30);
    // An equal score does not move achieved_at.
    expect(best?.achievedAt.toISOString()).toBe(t1.toISOString());

    const stats = await readUserStats(sql, userId);
    expect(stats.totalGamesPlayed).toBe(3);
    // Daily games do not touch the Global personal best.
    expect(stats.globalBestScore).toBeNull();
  });

  it("handles first, same-day, consecutive, gap and out-of-order streaks", async () => {
    const userId = await newUser();
    const base = randomPastBase();
    const [d0, d1, d2, d3] = await Promise.all(
      [0, 1, 2, 3].map((offset) => createChallenge(sql, fixtures, addDays(base, offset))),
    );
    const now = new Date("2026-10-29T12:00:20.000Z");

    // First ever daily -> 1.
    const first = await playFixture(userId, d0!, 0, now);
    expect(first.result.streak).toEqual({ current: 1, longest: 1 });

    // Same day again -> unchanged.
    const same = await playFixture(userId, d0!, 0, now);
    expect(same.result.streak).toEqual({ current: 1, longest: 1 });

    // Next day -> +1.
    const consecutive = await playFixture(userId, d1!, 0, now);
    expect(consecutive.result.streak).toEqual({ current: 2, longest: 2 });

    // Gap of more than one day -> reset to 1, longest kept.
    const gap = await playFixture(userId, d3!, 0, now);
    expect(gap.result.streak).toEqual({ current: 1, longest: 2 });

    // Older day finished late -> unchanged; last_daily_played_date only moves forward.
    const outOfOrder = await playFixture(userId, d2!, 0, now);
    expect(outOfOrder.result.streak).toEqual({ current: 1, longest: 2 });

    const stats = await readUserStats(sql, userId);
    expect(stats.currentDailyStreak).toBe(1);
    expect(stats.longestDailyStreak).toBe(2);
    expect(stats.lastDailyPlayedDate).toBe(d3!.date);
  });
});

describe("Past days are read-only", () => {
  it("never creates a past challenge", async () => {
    const pastDate = "1899-12-30";
    const before = await sql<{ n: string }[]>`
      select count(*)::text as n from daily_challenges where challenge_date = ${pastDate}::date
    `;

    await expect(
      ensureDailyChallenge(pastDate, [
        { h: 1, s: 1, v: 1 },
        { h: 2, s: 2, v: 2 },
        { h: 3, s: 3, v: 3 },
      ]),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });

    await expect(getChallengeByDate(pastDate, new Date())).resolves.toBeNull();

    const after = await sql<{ n: string }[]>`
      select count(*)::text as n from daily_challenges where challenge_date = ${pastDate}::date
    `;
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  it("rejects future and malformed dates", async () => {
    const now = new Date();
    await expect(getChallengeByDate(addDays(utcDateString(now), 1), now)).rejects.toMatchObject({
      code: "INVALID_DATE",
    });
    await expect(getChallengeByDate("2026-02-31", now)).rejects.toMatchObject({
      code: "INVALID_DATE",
    });
  });

  it("returns a fixture past challenge read-only with its colours", async () => {
    const challenge = await createChallenge(sql, fixtures, randomPastBase());

    const found = await getChallengeByDate(challenge.date, new Date());

    expect(found?.challengeId).toBe(challenge.challengeId);
    expect(found?.colors).toEqual([...FIXTURE_COLORS]);
  });
});
