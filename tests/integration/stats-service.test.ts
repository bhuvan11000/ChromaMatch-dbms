import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getMongoClient, getMongoDb } from "@/lib/db/mongo/client";
import { insertGame } from "@/lib/db/mongo/historyRepo";
import { getSqlClient } from "@/lib/db/pg/client";
import { getAchievements, getHistory, getMyStats } from "@/lib/services/statsService";

import { initMongo } from "../../scripts/init-mongo";

import {
  addDailyBest,
  cleanupFixtures,
  createAchievement,
  createChallenge,
  createFixtures,
  createUser,
  setGlobalBest,
} from "./support/fixtures";
import { cleanupHistory, hsv, makeHistoryDocument, uniqueNumericId } from "./support/mongo";

const sql = getSqlClient();
const fixtures = createFixtures();
const userIds: number[] = [];

function rounds(score: number, options: { colorNumber?: boolean; timedOut?: boolean } = {}) {
  return [1, 2, 3].map((roundNumber) => ({
    target: hsv(30 * roundNumber, 50, 50),
    guess: hsv(30 * roundNumber + 5, 55, 55),
    score,
    ...(options.colorNumber ? { colorNumber: roundNumber } : {}),
    ...(options.timedOut ? { timedOut: roundNumber === 2 } : {}),
  }));
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

describe("statsService against real databases", () => {
  it("combines Postgres counters with room-free Mongo history and paginates newest first", async () => {
    const userId = await createUser(sql, fixtures);
    userIds.push(userId);

    const challenge = await createChallenge(sql, fixtures);
    const now = new Date(`${challenge.date}T12:00:00.000Z`);
    const globalAt = new Date(`${challenge.date}T08:00:00.000Z`);
    const dailyAt = new Date(`${challenge.date}T09:00:00.000Z`);
    const roomAt = new Date(`${challenge.date}T10:00:00.000Z`);

    await setGlobalBest(sql, userId, 24.6, globalAt.toISOString());
    await sql`
      update users
      set total_games_played = 42,
          current_daily_streak = 3,
          longest_daily_streak = 7,
          last_daily_played_date = ${challenge.date}::date
      where user_id = ${userId}
    `;
    await addDailyBest(sql, userId, challenge.challengeId, 21.5, dailyAt.toISOString());

    const earnedAchievement = await createAchievement(sql, fixtures, {
      criteriaType: "first_global",
      namePrefix: "first_global",
    });
    await createAchievement(sql, fixtures, {
      criteriaType: "games_played",
      threshold: 100,
      namePrefix: "centurion",
    });
    await sql`
      insert into user_achievements (user_id, achievement_id, earned_at)
      values (${userId}, ${earnedAchievement}, ${globalAt.toISOString()}::timestamptz)
    `;

    const roomId = uniqueNumericId();
    await insertGame(
      makeHistoryDocument({
        userId,
        mode: "global",
        playedAt: globalAt,
        totalScore: 24.6,
        rounds: rounds(8.2),
      }),
    );
    await insertGame(
      makeHistoryDocument({
        userId,
        mode: "daily",
        playedAt: dailyAt,
        totalScore: 18,
        dailyChallengeId: challenge.challengeId,
        rounds: rounds(6, { colorNumber: true }),
      }),
    );
    await insertGame(
      makeHistoryDocument({
        userId,
        mode: "room",
        playedAt: roomAt,
        totalScore: 12,
        roomId,
        attemptNumber: 1,
        rounds: rounds(4, { colorNumber: true, timedOut: true }),
      }),
    );

    const stats = await getMyStats(userId, now);

    expect(stats.global.bestScore).toBe(24.6);
    expect(stats.global.achievedAt).toBe(globalAt.toISOString());
    expect(stats.totalGamesPlayed).toBe(42);
    expect(stats.daily).toEqual({
      currentStreak: 3,
      longestStreak: 7,
      lastPlayedDate: challenge.date,
      todayBest: 21.5,
    });
    expect(stats.achievementsEarned).toBe(1);
    expect(stats.historyAvailable).toBe(true);
    expect(stats.history?.byMode.map((entry) => entry.mode)).toEqual(["daily", "global"]);
    expect(stats.history?.byMode.map((entry) => entry.mode)).not.toContain("room");
    expect(stats.history?.channelAccuracy.rounds).toBe(6);
    expect(stats.history?.trend.length).toBeGreaterThan(0);
    expect(stats.history?.hueRegions.length).toBeGreaterThan(0);

    const achievements = await getAchievements(userId);
    expect(
      achievements.achievements.find((achievement) => achievement.id === earnedAchievement)?.earned,
    ).toBe(true);
    expect(
      achievements.achievements.find((achievement) => achievement.name.startsWith("centurion_"))
        ?.earned,
    ).toBe(false);

    const firstPage = await getHistory(userId, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.mode).toBe("room");
    expect(firstPage.items[0]?.attemptNumber).toBe(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await getHistory(userId, {
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items[0]?.mode).toBe("daily");

    const thirdPage = await getHistory(userId, {
      limit: 1,
      cursor: secondPage.nextCursor ?? undefined,
    });
    expect(thirdPage.items[0]?.mode).toBe("global");
    expect(thirdPage.nextCursor).toBeNull();
  });
});
