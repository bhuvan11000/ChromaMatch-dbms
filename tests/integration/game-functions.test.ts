import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";
import { submitGameResult, type SubmitGameResult } from "@/lib/db/pg/functions";

import {
  cleanupFixtures,
  createAchievement,
  createChallenge,
  createFixtures,
  createUser,
  readDailyBest,
  readUserStats,
} from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

const T1 = new Date("2026-01-01T10:00:00.000Z");
const T2 = new Date("2026-01-02T10:00:00.000Z");
const T3 = new Date("2026-01-03T10:00:00.000Z");
const T4 = new Date("2026-01-04T10:00:00.000Z");

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function expectDomainError(query: PromiseLike<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code: "CM000", message: code });
}

async function submitRaw(
  userId: number,
  mode: string,
  challengeId: number | null,
  scores: number[],
  playedAt: Date | null = new Date(),
): Promise<SubmitGameResult> {
  const rows = await sql<{ result: SubmitGameResult }[]>`
    select submit_game_result(
      ${userId}::bigint,
      ${mode}::text,
      ${challengeId}::bigint,
      array[${scores[0]}::numeric, ${scores[1]}::numeric, ${scores[2]}::numeric]::numeric[],
      ${playedAt === null ? null : playedAt.toISOString()}::timestamptz
    ) as result
  `;

  const result = rows[0]?.result;
  if (!result) throw new Error("submit_game_result returned no result");
  return result;
}

async function evaluateRaw(
  userId: number,
  mode: "global" | "daily",
  maxRound: number,
  beatExisting: boolean,
  firstInMode: boolean,
): Promise<Array<{ achievement_id: number; name: string; description: string }>> {
  const rows = await sql<
    { result: Array<{ achievement_id: number; name: string; description: string }> }[]
  >`
    select evaluate_achievements(
      ${userId}::bigint,
      ${mode}::text,
      ${maxRound}::numeric,
      ${beatExisting}::boolean,
      ${firstInMode}::boolean
    ) as result
  `;

  return rows[0]?.result ?? [];
}

function unlockedIds(result: SubmitGameResult): number[] {
  return result.unlocked.map((achievement) => achievement.achievement_id);
}

async function countEarned(userId: number, achievementId: number): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    select count(*)
    from user_achievements
    where user_id = ${userId}
      and achievement_id = ${achievementId}
  `;
  return Number(rows[0]?.count);
}

async function submitGlobal(
  userId: number,
  scores: readonly [number, number, number] = [8, 8, 8],
  playedAt: Date = new Date(),
): Promise<SubmitGameResult> {
  return submitGameResult({
    userId,
    mode: "global",
    challengeId: null,
    roundScores: scores,
    playedAt,
  });
}

async function submitDaily(
  userId: number,
  challengeId: number,
  scores: readonly [number, number, number] = [8, 8, 8],
  playedAt: Date = new Date(),
): Promise<SubmitGameResult> {
  return submitGameResult({
    userId,
    mode: "daily",
    challengeId,
    roundScores: scores,
    playedAt,
  });
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 5: game functions", () => {
  it("installs evaluate_achievements and submit_game_result with the specified signatures", async () => {
    const rows = await sql<{ proname: string; args: string }[]>`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('evaluate_achievements', 'submit_game_result')
      order by p.proname
    `;

    const signatures = new Map(rows.map((row) => [row.proname, row.args]));

    expect(signatures.get("evaluate_achievements")).toBe(
      "p_user_id bigint, p_mode text, p_max_round_score numeric, p_beat_existing_pb boolean, p_first_in_mode boolean",
    );
    expect(signatures.get("submit_game_result")).toBe(
      "p_user_id bigint, p_mode text, p_challenge_id bigint, p_round_scores numeric[], p_played_at timestamp with time zone",
    );
  });

  it("sets the first Global PB with beat_existing=false, ignores equal/lower scores and updates on a higher score", async () => {
    const userId = await createUser(sql, fixtures);

    const first = await submitGameResult({
      userId,
      mode: "global",
      challengeId: null,
      roundScores: [7, 6.5, 6.5],
      playedAt: T1,
    });

    expect(first.total_score).toBe(20);
    expect(first.total_games_played).toBe(1);
    expect(first.pb).toEqual({
      scope: "global",
      previous: null,
      current: 20,
      updated: true,
      beat_existing: false,
    });
    expect(first.streak).toBeUndefined();

    let stats = await readUserStats(sql, userId);
    expect(stats.globalBestScore).toBe(20);
    expect(stats.globalBestAchievedAt?.toISOString()).toBe(T1.toISOString());
    expect(stats.totalGamesPlayed).toBe(1);

    const equal = await submitGameResult({
      userId,
      mode: "global",
      challengeId: null,
      roundScores: [10, 5, 5],
      playedAt: T2,
    });

    expect(equal.total_score).toBe(20);
    expect(equal.pb).toEqual({
      scope: "global",
      previous: 20,
      current: 20,
      updated: false,
      beat_existing: false,
    });

    stats = await readUserStats(sql, userId);
    expect(stats.globalBestAchievedAt?.toISOString()).toBe(T1.toISOString());
    expect(stats.totalGamesPlayed).toBe(2);

    const higher = await submitGameResult({
      userId,
      mode: "global",
      challengeId: null,
      roundScores: [9, 8, 8],
      playedAt: T3,
    });

    expect(higher.total_score).toBe(25);
    expect(higher.pb).toEqual({
      scope: "global",
      previous: 20,
      current: 25,
      updated: true,
      beat_existing: true,
    });

    const lower = await submitGameResult({
      userId,
      mode: "global",
      challengeId: null,
      roundScores: [7, 7, 7],
      playedAt: T4,
    });

    expect(lower.total_score).toBe(21);
    expect(lower.pb).toEqual({
      scope: "global",
      previous: 25,
      current: 25,
      updated: false,
      beat_existing: false,
    });

    stats = await readUserStats(sql, userId);
    expect(stats.globalBestScore).toBe(25);
    expect(stats.globalBestAchievedAt?.toISOString()).toBe(T3.toISOString());
    expect(stats.totalGamesPlayed).toBe(4);
  });

  it("creates the first Daily PB row and only updates it on a strictly higher score", async () => {
    const userId = await createUser(sql, fixtures);
    const challenge = await createChallenge(sql, fixtures);

    const first = await submitDaily(userId, challenge.challengeId, [6, 6, 6], T1);

    expect(first.total_score).toBe(18);
    expect(first.pb).toEqual({
      scope: "daily",
      previous: null,
      current: 18,
      updated: true,
      beat_existing: false,
    });
    expect(first.streak).toEqual({ current: 1, longest: 1 });

    let best = await readDailyBest(sql, userId, challenge.challengeId);
    expect(best?.bestScore).toBe(18);
    expect(best?.achievedAt.toISOString()).toBe(T1.toISOString());

    const equal = await submitDaily(userId, challenge.challengeId, [10, 4, 4], T2);

    expect(equal.total_score).toBe(18);
    expect(equal.pb).toEqual({
      scope: "daily",
      previous: 18,
      current: 18,
      updated: false,
      beat_existing: false,
    });
    expect(equal.streak).toEqual({ current: 1, longest: 1 });

    best = await readDailyBest(sql, userId, challenge.challengeId);
    expect(best?.bestScore).toBe(18);
    expect(best?.achievedAt.toISOString()).toBe(T1.toISOString());

    const higher = await submitDaily(userId, challenge.challengeId, [8, 8, 8], T3);

    expect(higher.total_score).toBe(24);
    expect(higher.pb).toEqual({
      scope: "daily",
      previous: 18,
      current: 24,
      updated: true,
      beat_existing: true,
    });
    expect(higher.streak).toEqual({ current: 1, longest: 1 });

    best = await readDailyBest(sql, userId, challenge.challengeId);
    expect(best?.bestScore).toBe(24);
    expect(best?.achievedAt.toISOString()).toBe(T3.toISOString());

    const lower = await submitDaily(userId, challenge.challengeId, [7, 7, 7], T4);

    expect(lower.total_score).toBe(21);
    expect(lower.pb).toEqual({
      scope: "daily",
      previous: 24,
      current: 24,
      updated: false,
      beat_existing: false,
    });

    const stats = await readUserStats(sql, userId);
    expect(stats.totalGamesPlayed).toBe(4);
    expect(stats.currentDailyStreak).toBe(1);
    expect(stats.longestDailyStreak).toBe(1);
    expect(stats.lastDailyPlayedDate).toBe(challenge.date);
  });

  it("increments total_games_played for every Global and Daily game", async () => {
    const userId = await createUser(sql, fixtures);
    const challenge = await createChallenge(sql, fixtures);

    const totals: number[] = [];

    totals.push((await submitGlobal(userId, [1, 1, 1])).total_games_played);
    totals.push((await submitGlobal(userId, [2, 2, 2])).total_games_played);
    totals.push((await submitGlobal(userId, [3, 3, 3])).total_games_played);
    totals.push((await submitDaily(userId, challenge.challengeId, [4, 4, 4])).total_games_played);
    totals.push((await submitDaily(userId, challenge.challengeId, [5, 5, 5])).total_games_played);

    expect(totals).toEqual([1, 2, 3, 4, 5]);
    expect((await readUserStats(sql, userId)).totalGamesPlayed).toBe(5);
  });

  describe("Daily streak", () => {
    it("starts at 1 on the first day", async () => {
      const userId = await createUser(sql, fixtures);
      const day1 = await createChallenge(sql, fixtures);

      const result = await submitDaily(userId, day1.challengeId);

      expect(result.streak).toEqual({ current: 1, longest: 1 });
      const stats = await readUserStats(sql, userId);
      expect(stats.currentDailyStreak).toBe(1);
      expect(stats.longestDailyStreak).toBe(1);
      expect(stats.lastDailyPlayedDate).toBe(day1.date);
    });

    it("stays unchanged on the same day", async () => {
      const userId = await createUser(sql, fixtures);
      const day1 = await createChallenge(sql, fixtures);

      await submitDaily(userId, day1.challengeId, [8, 8, 8], T1);
      const second = await submitDaily(userId, day1.challengeId, [7, 7, 7], T2);

      expect(second.streak).toEqual({ current: 1, longest: 1 });
      const stats = await readUserStats(sql, userId);
      expect(stats.currentDailyStreak).toBe(1);
      expect(stats.lastDailyPlayedDate).toBe(day1.date);
    });

    it("increments on the next day", async () => {
      const userId = await createUser(sql, fixtures);
      const day1 = await createChallenge(sql, fixtures);
      const day2 = await createChallenge(sql, fixtures, addDays(day1.date, 1));

      await submitDaily(userId, day1.challengeId, [8, 8, 8], T1);
      const second = await submitDaily(userId, day2.challengeId, [8, 8, 8], T2);

      expect(second.streak).toEqual({ current: 2, longest: 2 });
      const stats = await readUserStats(sql, userId);
      expect(stats.currentDailyStreak).toBe(2);
      expect(stats.longestDailyStreak).toBe(2);
      expect(stats.lastDailyPlayedDate).toBe(day2.date);
    });

    it("resets to 1 after a gap while keeping the longest streak", async () => {
      const userId = await createUser(sql, fixtures);
      const day1 = await createChallenge(sql, fixtures);
      const day2 = await createChallenge(sql, fixtures, addDays(day1.date, 1));
      const day4 = await createChallenge(sql, fixtures, addDays(day1.date, 3));

      await submitDaily(userId, day1.challengeId, [8, 8, 8], T1);
      await submitDaily(userId, day2.challengeId, [8, 8, 8], T2);
      const afterGap = await submitDaily(userId, day4.challengeId, [8, 8, 8], T3);

      expect(afterGap.streak).toEqual({ current: 1, longest: 2 });
      const stats = await readUserStats(sql, userId);
      expect(stats.currentDailyStreak).toBe(1);
      expect(stats.longestDailyStreak).toBe(2);
      expect(stats.lastDailyPlayedDate).toBe(day4.date);
    });

    it("leaves the streak and last date unchanged for an out-of-order older day", async () => {
      const userId = await createUser(sql, fixtures);
      const day1 = await createChallenge(sql, fixtures);
      const day2 = await createChallenge(sql, fixtures, addDays(day1.date, 1));
      const older = await createChallenge(sql, fixtures, addDays(day1.date, -1));

      await submitDaily(userId, day1.challengeId, [8, 8, 8], T1);
      await submitDaily(userId, day2.challengeId, [8, 8, 8], T2);
      const outOfOrder = await submitDaily(userId, older.challengeId, [8, 8, 8], T3);

      expect(outOfOrder.streak).toEqual({ current: 2, longest: 2 });
      const stats = await readUserStats(sql, userId);
      expect(stats.currentDailyStreak).toBe(2);
      expect(stats.longestDailyStreak).toBe(2);
      expect(stats.lastDailyPlayedDate).toBe(day2.date);
    });

    it("tracks the longest streak across a later reset", async () => {
      const userId = await createUser(sql, fixtures);
      const day1 = await createChallenge(sql, fixtures);
      const day2 = await createChallenge(sql, fixtures, addDays(day1.date, 1));
      const day3 = await createChallenge(sql, fixtures, addDays(day1.date, 2));
      const day6 = await createChallenge(sql, fixtures, addDays(day1.date, 5));

      await submitDaily(userId, day1.challengeId, [8, 8, 8], T1);
      await submitDaily(userId, day2.challengeId, [8, 8, 8], T2);
      const third = await submitDaily(userId, day3.challengeId, [8, 8, 8], T3);
      expect(third.streak).toEqual({ current: 3, longest: 3 });

      const afterGap = await submitDaily(userId, day6.challengeId, [8, 8, 8], T4);

      expect(afterGap.streak).toEqual({ current: 1, longest: 3 });
      const stats = await readUserStats(sql, userId);
      expect(stats.currentDailyStreak).toBe(1);
      expect(stats.longestDailyStreak).toBe(3);
      expect(stats.lastDailyPlayedDate).toBe(day6.date);
    });
  });

  describe("achievements", () => {
    it("awards games_played once, after the counter update", async () => {
      const userId = await createUser(sql, fixtures);
      const achievementId = await createAchievement(sql, fixtures, {
        criteriaType: "games_played",
        threshold: 2,
      });

      const first = await submitGlobal(userId);
      expect(unlockedIds(first)).not.toContain(achievementId);

      const second = await submitGlobal(userId);
      expect(unlockedIds(second)).toContain(achievementId);

      const third = await submitGlobal(userId);
      expect(unlockedIds(third)).not.toContain(achievementId);
      expect(await countEarned(userId, achievementId)).toBe(1);
    });

    it("awards daily_streak once, after the streak update", async () => {
      const userId = await createUser(sql, fixtures);
      const day1 = await createChallenge(sql, fixtures);
      const day2 = await createChallenge(sql, fixtures, addDays(day1.date, 1));
      const achievementId = await createAchievement(sql, fixtures, {
        criteriaType: "daily_streak",
        threshold: 2,
      });

      const first = await submitDaily(userId, day1.challengeId);
      expect(unlockedIds(first)).not.toContain(achievementId);

      const second = await submitDaily(userId, day2.challengeId);
      expect(unlockedIds(second)).toContain(achievementId);

      const repeat = await submitDaily(userId, day2.challengeId);
      expect(unlockedIds(repeat)).not.toContain(achievementId);
      expect(await countEarned(userId, achievementId)).toBe(1);
    });

    it("awards perfect_round from the maximum round score, exactly once", async () => {
      const userId = await createUser(sql, fixtures);
      const sharp = await createAchievement(sql, fixtures, {
        criteriaType: "perfect_round",
        threshold: 9.5,
      });
      const perfect = await createAchievement(sql, fixtures, {
        criteriaType: "perfect_round",
        threshold: 10.0,
      });

      const balanced = await submitGlobal(userId, [8, 8, 8]);
      expect(unlockedIds(balanced)).not.toContain(sharp);
      expect(unlockedIds(balanced)).not.toContain(perfect);

      const nearPerfect = await submitGlobal(userId, [9, 9.8, 6]);
      expect(unlockedIds(nearPerfect)).toContain(sharp);
      expect(unlockedIds(nearPerfect)).not.toContain(perfect);

      const repeat = await submitGlobal(userId, [9, 9.8, 6]);
      expect(unlockedIds(repeat)).not.toContain(sharp);
      expect(unlockedIds(repeat)).not.toContain(perfect);

      const exact = await submitGlobal(userId, [8, 10, 6]);
      expect(unlockedIds(exact)).toContain(perfect);

      expect(await countEarned(userId, sharp)).toBe(1);
      expect(await countEarned(userId, perfect)).toBe(1);
    });

    it("does not award new_pb for the first PB, only when an existing PB is beaten, exactly once", async () => {
      const userId = await createUser(sql, fixtures);
      const achievementId = await createAchievement(sql, fixtures, {
        criteriaType: "new_pb",
        threshold: null,
      });

      const first = await submitGlobal(userId, [7, 6.5, 6.5]);
      expect(unlockedIds(first)).not.toContain(achievementId);

      const beat = await submitGlobal(userId, [9, 8, 8]);
      expect(unlockedIds(beat)).toContain(achievementId);

      const repeat = await submitGlobal(userId, [9, 8, 8]);
      expect(unlockedIds(repeat)).not.toContain(achievementId);
      expect(await countEarned(userId, achievementId)).toBe(1);
    });

    it("awards first_global exactly once", async () => {
      const userId = await createUser(sql, fixtures);
      const achievementId = await createAchievement(sql, fixtures, {
        criteriaType: "first_global",
        threshold: null,
      });

      const first = await submitGlobal(userId);
      expect(unlockedIds(first)).toContain(achievementId);

      const second = await submitGlobal(userId);
      expect(unlockedIds(second)).not.toContain(achievementId);
      expect(await countEarned(userId, achievementId)).toBe(1);
    });

    it("awards first_daily exactly once", async () => {
      const userId = await createUser(sql, fixtures);
      const challenge = await createChallenge(sql, fixtures);
      const achievementId = await createAchievement(sql, fixtures, {
        criteriaType: "first_daily",
        threshold: null,
      });

      const first = await submitDaily(userId, challenge.challengeId);
      expect(unlockedIds(first)).toContain(achievementId);

      const second = await submitDaily(userId, challenge.challengeId);
      expect(unlockedIds(second)).not.toContain(achievementId);
      expect(await countEarned(userId, achievementId)).toBe(1);
    });
  });

  it("evaluate_achievements is idempotent when called directly", async () => {
    const userId = await createUser(sql, fixtures);
    const games = await createAchievement(sql, fixtures, {
      criteriaType: "games_played",
      threshold: 5,
    });
    const streak = await createAchievement(sql, fixtures, {
      criteriaType: "daily_streak",
      threshold: 2,
    });

    await sql`
      update users
      set total_games_played = 5,
          current_daily_streak = 2,
          longest_daily_streak = 2
      where user_id = ${userId}
    `;

    const first = await evaluateRaw(userId, "global", 10, false, false);
    const firstIds = first.map((achievement) => achievement.achievement_id);
    expect(firstIds).toContain(games);
    expect(firstIds).toContain(streak);

    const second = await evaluateRaw(userId, "global", 10, false, false);
    const secondIds = second.map((achievement) => achievement.achievement_id);
    expect(secondIds).not.toContain(games);
    expect(secondIds).not.toContain(streak);

    expect(await countEarned(userId, games)).toBe(1);
    expect(await countEarned(userId, streak)).toBe(1);
  });

  describe("validation and error mapping", () => {
    it("rejects invalid modes, score counts and score ranges", async () => {
      const userId = await createUser(sql, fixtures);

      await expectDomainError(
        sql`select submit_game_result(${userId}, 'invalid', null::bigint, array[${1}::numeric, ${2}::numeric, ${3}::numeric]::numeric[], now())`,
        "VALIDATION_ERROR",
      );
      await expectDomainError(
        sql`select submit_game_result(${userId}, 'global', null::bigint, array[${1}::numeric, ${2}::numeric]::numeric[], now())`,
        "VALIDATION_ERROR",
      );
      await expectDomainError(
        sql`select submit_game_result(${userId}, 'global', null::bigint, array[${1}::numeric, ${2}::numeric, ${10.1}::numeric]::numeric[], now())`,
        "VALIDATION_ERROR",
      );
      await expectDomainError(
        sql`select submit_game_result(${userId}, 'global', null::bigint, null::numeric[], now())`,
        "VALIDATION_ERROR",
      );
    });

    it("requires a Daily challenge id and refuses one for Global", async () => {
      const userId = await createUser(sql, fixtures);
      const challenge = await createChallenge(sql, fixtures);

      await expectDomainError(
        sql`select submit_game_result(${userId}, 'daily', null::bigint, array[${1}::numeric, ${2}::numeric, ${3}::numeric]::numeric[], now())`,
        "VALIDATION_ERROR",
      );
      await expectDomainError(
        sql`select submit_game_result(${userId}, 'global', ${challenge.challengeId}, array[${1}::numeric, ${2}::numeric, ${3}::numeric]::numeric[], now())`,
        "VALIDATION_ERROR",
      );
      await expectDomainError(
        sql`select submit_game_result(${userId}, 'daily', 999999999, array[${1}::numeric, ${2}::numeric, ${3}::numeric]::numeric[], now())`,
        "VALIDATION_ERROR",
      );
    });

    it("rejects a missing user and a null played_at", async () => {
      await expectDomainError(
        sql`select submit_game_result(999999999, 'global', null::bigint, array[${1}::numeric, ${2}::numeric, ${3}::numeric]::numeric[], now())`,
        "USER_NOT_FOUND",
      );

      const userId = await createUser(sql, fixtures);
      await expectDomainError(
        sql`select submit_game_result(${userId}, 'global', null::bigint, array[${1}::numeric, ${2}::numeric, ${3}::numeric]::numeric[], null::timestamptz)`,
        "VALIDATION_ERROR",
      );
    });

    it("maps a real CM000 failure through the typed wrapper", async () => {
      const userId = await createUser(sql, fixtures);
      const invalidMode = "global'; drop table users; --" as unknown as "global";

      await expect(
        submitGameResult({
          userId,
          mode: invalidMode,
          challengeId: null,
          roundScores: [1, 2, 3],
          playedAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

      // Parameter binding must have kept the table intact.
      await expect(sql`select count(*) from users`).resolves.toBeDefined();
    });

    it("returns the jsonb shape through the raw SQL call", async () => {
      const userId = await createUser(sql, fixtures);
      const result = await submitRaw(userId, "global", null, [10, 10, 10], T1);

      expect(result).toMatchObject({
        total_score: 30,
        mode: "global",
        total_games_played: 1,
        pb: {
          scope: "global",
          previous: null,
          current: 30,
          updated: true,
          beat_existing: false,
        },
        unlocked: expect.any(Array),
      });
    });
  });
});
