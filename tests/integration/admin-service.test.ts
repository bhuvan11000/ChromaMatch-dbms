import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getMongoClient, getMongoDb } from "@/lib/db/mongo/client";
import { insertGame } from "@/lib/db/mongo/historyRepo";
import { getSqlClient } from "@/lib/db/pg/client";
import { findAdminUser } from "@/lib/db/pg/queries/admin";
import { getDaily, getGlobal } from "@/lib/services/leaderboardService";
import {
  getUser,
  getUserHistory,
  listUsers,
  setBan,
  updateUserStats,
} from "@/lib/services/adminService";
import { getHistory } from "@/lib/services/statsService";

import { initMongo } from "../../scripts/init-mongo";

import {
  addDailyBest,
  cleanupFixtures,
  createAchievement,
  createChallenge,
  createFixtures,
  createUser,
  readDailyBest,
  readUserStats,
  setGlobalBest,
  uniqueSuffix,
} from "./support/fixtures";
import { cleanupHistory, hsv, makeHistoryDocument } from "./support/mongo";

const sql = getSqlClient();
const fixtures = createFixtures();
const userIds: number[] = [];
const NOW = new Date("2026-10-31T12:00:00.000Z");

async function makeAdmin(userId: number): Promise<void> {
  await sql`update users set role = 'admin' where user_id = ${userId}`;
}

function rounds(score: number) {
  return [1, 2, 3].map((roundNumber) => ({
    target: hsv(30 * roundNumber, 50, 50),
    guess: hsv(30 * roundNumber + 5, 55, 55),
    score,
  }));
}

async function expectAppError(query: PromiseLike<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code, status: expect.any(Number) });
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

describe("adminService against real databases", () => {
  it("lists players with search, banned filter and pagination", async () => {
    const admin = await createUser(sql, fixtures);
    await makeAdmin(admin);

    const suffix = uniqueSuffix();
    const ids: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const rows = await sql<{ user_id: number }[]>`
        insert into users (username, email, password_hash)
        values (
          ${`player_${suffix}_${index}`},
          ${`player_${suffix}_${index}@example.test`},
          'test-hash'
        )
        returning user_id
      `;
      const id = Number(rows[0]?.user_id);
      ids.push(id);
      fixtures.userIds.push(id);
    }
    userIds.push(...ids);

    await setBan(admin, ids[1], true);

    const all = await listUsers({ query: suffix, limit: 10, offset: 0 });
    expect(all.total).toBe(3);
    expect(all.users.map((user) => user.id)).toEqual(ids);
    expect(all.users.find((user) => user.id === ids[1])?.isBanned).toBe(true);

    const banned = await listUsers({ query: suffix, banned: true, limit: 10, offset: 0 });
    expect(banned.total).toBe(1);
    expect(banned.users.map((user) => user.id)).toEqual([ids[1]]);

    const active = await listUsers({ query: suffix, banned: false, limit: 10, offset: 0 });
    expect(active.total).toBe(2);

    const page = await listUsers({ query: suffix, limit: 1, offset: 1 });
    expect(page.users.map((user) => user.id)).toEqual([ids[1]]);
    expect(page.total).toBe(3);
  });

  it("returns user detail with recent daily bests and earned achievements only", async () => {
    const target = await createUser(sql, fixtures);
    userIds.push(target);

    const challenge = await createChallenge(sql, fixtures);
    await setGlobalBest(sql, target, 24.6, "2026-05-01T12:00:00.000Z");
    await sql`
      update users
      set total_games_played = 12,
          current_daily_streak = 3,
          longest_daily_streak = 7,
          last_daily_played_date = ${challenge.date}::date
      where user_id = ${target}
    `;
    await addDailyBest(sql, target, challenge.challengeId, 25.3, "2026-05-01T13:00:00.000Z");

    const earned = await createAchievement(sql, fixtures, {
      criteriaType: "first_global",
      namePrefix: "admin_earned",
    });
    await createAchievement(sql, fixtures, {
      criteriaType: "games_played",
      threshold: 100,
      namePrefix: "admin_locked",
    });
    await sql`
      insert into user_achievements (user_id, achievement_id, earned_at)
      values (${target}, ${earned}, '2026-05-01T12:00:00.000Z'::timestamptz)
    `;

    const detail = await getUser(target);

    expect(detail.user).toMatchObject({
      id: target,
      globalBestScore: 24.6,
      totalGamesPlayed: 12,
      currentDailyStreak: 3,
      longestDailyStreak: 7,
      lastDailyPlayedDate: challenge.date,
    });
    expect(detail.dailyBests).toEqual([
      {
        date: challenge.date,
        bestScore: 25.3,
        achievedAt: "2026-05-01T13:00:00.000Z",
      },
    ]);
    expect(detail.achievements).toHaveLength(1);
    expect(detail.achievements[0]).toMatchObject({ id: earned, earned: true });

    await expectAppError(getUser(999_999_999), "USER_NOT_FOUND");
  });

  it("returns a player's history through the shared reader", async () => {
    const target = await createUser(sql, fixtures);
    userIds.push(target);

    const challenge = await createChallenge(sql, fixtures);
    await insertGame(
      makeHistoryDocument({
        userId: target,
        mode: "global",
        playedAt: new Date("2026-05-01T08:00:00.000Z"),
        totalScore: 20,
        rounds: rounds(6.7),
      }),
    );
    await insertGame(
      makeHistoryDocument({
        userId: target,
        mode: "daily",
        playedAt: new Date("2026-05-01T09:00:00.000Z"),
        totalScore: 22,
        dailyChallengeId: challenge.challengeId,
        rounds: rounds(7.3).map((round, index) => ({
          ...round,
          colorNumber: index + 1,
        })),
      }),
    );
    await insertGame(
      makeHistoryDocument({
        userId: target,
        mode: "global",
        playedAt: new Date("2026-05-01T10:00:00.000Z"),
        totalScore: 24,
        rounds: rounds(8),
      }),
    );

    const first = await getUserHistory(target, { limit: 2 });
    expect(first.items.map((item) => item.totalScore)).toEqual([24, 22]);
    expect(first.nextCursor).not.toBeNull();

    const second = await getUserHistory(target, {
      limit: 2,
      ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
    });
    expect(second.items.map((item) => item.totalScore)).toEqual([20]);

    const direct = await getHistory(target, { limit: 10 });
    expect(direct.items).toHaveLength(3);

    await expectAppError(getUserHistory(999_999_999, { limit: 10 }), "USER_NOT_FOUND");
  });

  it("hides a banned player from both boards while keeping their data, then restores them", async () => {
    const admin = await createUser(sql, fixtures);
    await makeAdmin(admin);
    const target = await createUser(sql, fixtures);
    userIds.push(target);

    const challenge = await createChallenge(sql, fixtures);
    await setGlobalBest(sql, target, 30, "2000-01-01T00:00:00.000Z");
    await addDailyBest(sql, target, challenge.challengeId, 30, "2000-01-01T00:00:00.000Z");

    const beforeGlobal = await getGlobal({ limit: 100, offset: 0 }, target);
    const beforeDaily = await getDaily(
      { date: challenge.date, limit: 100, offset: 0 },
      target,
      NOW,
    );
    expect(beforeGlobal.entries.some((entry) => entry.userId === target)).toBe(true);
    expect(beforeGlobal.me?.score).toBe(30);
    expect(beforeDaily.entries.some((entry) => entry.userId === target)).toBe(true);
    expect(beforeDaily.me?.score).toBe(30);

    const banned = await setBan(admin, target, true);
    expect(banned.user.isBanned).toBe(true);

    const bannedGlobal = await getGlobal({ limit: 100, offset: 0 }, target);
    const bannedDaily = await getDaily(
      { date: challenge.date, limit: 100, offset: 0 },
      target,
      NOW,
    );
    expect(bannedGlobal.entries.some((entry) => entry.userId === target)).toBe(false);
    expect(bannedGlobal.me).toBeNull();
    expect(bannedDaily.entries.some((entry) => entry.userId === target)).toBe(false);
    expect(bannedDaily.me).toBeNull();

    // The ban hides the player, but nothing is deleted.
    const stats = await readUserStats(sql, target);
    expect(stats).toMatchObject({
      globalBestScore: 30,
      totalGamesPlayed: 0,
    });
    expect(await readDailyBest(sql, target, challenge.challengeId)).not.toBeNull();
    expect(await findAdminUser(target)).toMatchObject({ isBanned: true });

    await setBan(admin, target, false);

    const restoredGlobal = await getGlobal({ limit: 100, offset: 0 }, target);
    const restoredDaily = await getDaily(
      { date: challenge.date, limit: 100, offset: 0 },
      target,
      NOW,
    );
    expect(restoredGlobal.entries.some((entry) => entry.userId === target)).toBe(true);
    expect(restoredGlobal.me?.score).toBe(30);
    expect(restoredDaily.entries.some((entry) => entry.userId === target)).toBe(true);
    expect(restoredDaily.me?.score).toBe(30);
  });

  it("rejects banning self or another admin", async () => {
    const admin = await createUser(sql, fixtures);
    await makeAdmin(admin);
    const otherAdmin = await createUser(sql, fixtures);
    await makeAdmin(otherAdmin);
    const player = await createUser(sql, fixtures);

    await expectAppError(setBan(admin, admin, true), "CANNOT_BAN_ADMIN");
    await expectAppError(setBan(admin, otherAdmin, true), "CANNOT_BAN_ADMIN");
    await expectAppError(setBan(admin, 999_999_999, true), "USER_NOT_FOUND");

    const self = await findAdminUser(admin);
    expect(self?.isBanned).toBe(false);

    const nonAdmin = await createUser(sql, fixtures);
    await expectAppError(setBan(nonAdmin, player, true), "FORBIDDEN");
  });

  it("applies a valid stats patch and maps constraint failures to VALIDATION_ERROR", async () => {
    const admin = await createUser(sql, fixtures);
    await makeAdmin(admin);
    const target = await createUser(sql, fixtures);

    const saved = await updateUserStats(admin, target, {
      globalBestScore: 24.5,
      globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
      totalGamesPlayed: 12,
      currentDailyStreak: 3,
      longestDailyStreak: 7,
      lastDailyPlayedDate: "2026-05-01",
    });
    expect(saved.user).toMatchObject({
      id: target,
      globalBestScore: 24.5,
      globalBestAchievedAt: "2026-05-01T12:34:56.000Z",
      totalGamesPlayed: 12,
      currentDailyStreak: 3,
      longestDailyStreak: 7,
      lastDailyPlayedDate: "2026-05-01",
    });

    await expectAppError(
      updateUserStats(admin, target, { globalBestScore: 31 }),
      "VALIDATION_ERROR",
    );
    await expectAppError(
      updateUserStats(admin, target, { currentDailyStreak: 8, longestDailyStreak: 7 }),
      "VALIDATION_ERROR",
    );
    await expectAppError(
      updateUserStats(admin, target, { role: "admin" } as unknown as { totalGamesPlayed: number }),
      "INVALID_PATCH",
    );

    const stats = await readUserStats(sql, target);
    expect(stats).toMatchObject({
      globalBestScore: 24.5,
      totalGamesPlayed: 12,
      currentDailyStreak: 3,
      longestDailyStreak: 7,
    });
  });
});
