import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";
import {
  findDailyLeaderboardEntry,
  findGlobalLeaderboardEntry,
  listDailyLeaderboard,
  listGlobalLeaderboard,
} from "@/lib/db/pg/queries/leaderboards";
import { findRoomScoreboardEntry, listRoomScoreboard } from "@/lib/db/pg/queries/rooms";

import {
  addRoomPlayer,
  cleanupFixtures,
  createChallenge,
  createFixtures,
  createRoom,
  createUser,
} from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

async function setGlobalBest(userId: number, score: number, achievedAt: string): Promise<void> {
  await sql`
    update users
    set global_best_score = ${score},
        global_best_achieved_at = ${achievedAt}::timestamptz
    where user_id = ${userId}
  `;
}

async function addDailyBest(
  userId: number,
  challengeId: number,
  score: number,
  achievedAt: string,
): Promise<void> {
  await sql`
    insert into daily_personal_bests (user_id, daily_challenge_id, best_score, achieved_at)
    values (${userId}, ${challengeId}, ${score}, ${achievedAt}::timestamptz)
  `;
}

async function setRoomBest(
  roomId: number,
  userId: number,
  score: number,
  achievedAt: string,
): Promise<void> {
  await sql`
    update room_players
    set best_score = ${score},
        best_achieved_at = ${achievedAt}::timestamptz,
        attempts_used = 1
    where room_id = ${roomId}
      and user_id = ${userId}
  `;
}

async function banUser(userId: number): Promise<void> {
  await sql`update users set is_banned = true where user_id = ${userId}`;
}

interface GlobalViewRow {
  rank: string | number;
  user_id: string | number;
  username: string;
  score: string | number;
  achieved_at: Date | string;
}

async function readGlobalView(): Promise<GlobalViewRow[]> {
  return sql<GlobalViewRow[]>`
    select rank, user_id, username, score, achieved_at
    from global_leaderboard
    order by rank
  `;
}

interface DailyViewRow {
  daily_challenge_id: string | number;
  challenge_date: Date | string;
  rank: string | number;
  user_id: string | number;
  username: string;
  score: string | number;
  achieved_at: Date | string;
}

async function readDailyView(): Promise<DailyViewRow[]> {
  return sql<DailyViewRow[]>`
    select daily_challenge_id, challenge_date, rank, user_id, username, score, achieved_at
    from daily_leaderboard
    order by daily_challenge_id, rank
  `;
}

interface RoomViewRow {
  room_id: string | number;
  rank: string | number | null;
  user_id: string | number;
  username: string;
  member_status: string;
  attempts_used: number;
  best_score: string | number | null;
  best_achieved_at: Date | string | null;
}

async function readRoomView(roomId: number): Promise<RoomViewRow[]> {
  return sql<RoomViewRow[]>`
    select room_id, rank, user_id, username, member_status, attempts_used,
           best_score, best_achieved_at
    from room_scoreboard
    where room_id = ${roomId}
    order by rank asc nulls last, user_id asc
  `;
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 9: leaderboard views", () => {
  it("defines the documented columns on all three views", async () => {
    const rows = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('global_leaderboard', 'daily_leaderboard', 'room_scoreboard')
      order by table_name, ordinal_position
    `;

    const columns = new Map<string, string[]>();
    for (const row of rows) {
      columns.set(row.table_name, [...(columns.get(row.table_name) ?? []), row.column_name]);
    }

    expect(columns.get("global_leaderboard")).toEqual([
      "rank",
      "user_id",
      "username",
      "score",
      "achieved_at",
    ]);
    expect(columns.get("daily_leaderboard")).toEqual([
      "daily_challenge_id",
      "challenge_date",
      "rank",
      "user_id",
      "username",
      "score",
      "achieved_at",
    ]);
    expect(columns.get("room_scoreboard")).toEqual([
      "room_id",
      "rank",
      "user_id",
      "username",
      "member_status",
      "attempts_used",
      "best_score",
      "best_achieved_at",
    ]);
  });

  describe("global_leaderboard", () => {
    it("orders by score, then earliest achieved_at, then lowest user_id, and excludes banned/no-PB users", async () => {
      const top = await createUser(sql, fixtures);
      const earlier = await createUser(sql, fixtures);
      const firstTie = await createUser(sql, fixtures);
      const secondTie = await createUser(sql, fixtures);
      const later = await createUser(sql, fixtures);
      const banned = await createUser(sql, fixtures);
      const noPb = await createUser(sql, fixtures);

      await setGlobalBest(top, 30, "2026-01-01T09:00:00.000Z");
      await setGlobalBest(earlier, 25, "2026-01-01T08:00:00.000Z");
      await setGlobalBest(firstTie, 25, "2026-01-01T10:00:00.000Z");
      await setGlobalBest(secondTie, 25, "2026-01-01T10:00:00.000Z");
      await setGlobalBest(later, 25, "2026-01-01T11:00:00.000Z");
      await setGlobalBest(banned, 30, "2026-01-01T07:00:00.000Z");
      await banUser(banned);

      const ids = new Set([top, earlier, firstTie, secondTie, later, banned, noPb]);
      const rows = (await readGlobalView()).filter((row) => ids.has(Number(row.user_id)));

      expect(rows.map((row) => Number(row.user_id))).toEqual([
        top,
        earlier,
        firstTie,
        secondTie,
        later,
      ]);

      const ranks = rows.map((row) => Number(row.rank));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(new Set(ranks).size).toBe(ranks.length);

      const topEntry = await findGlobalLeaderboardEntry(top);
      expect(topEntry).toMatchObject({
        rank: ranks[0],
        userId: top,
        score: 30,
      });
      expect(topEntry?.achievedAt.toISOString()).toBe("2026-01-01T09:00:00.000Z");

      expect(await findGlobalLeaderboardEntry(banned)).toBeNull();
      expect(await findGlobalLeaderboardEntry(noPb)).toBeNull();

      const page = await listGlobalLeaderboard({ limit: 100, offset: 0 });
      expect(page.total).toBeGreaterThanOrEqual(5);
      expect(page.entries.map((entry) => entry.rank)).toEqual(
        [...page.entries.map((entry) => entry.rank)].sort((a, b) => a - b),
      );

      const pageIds = page.entries.map((entry) => entry.userId);
      expect(pageIds.indexOf(top)).toBeLessThan(pageIds.indexOf(earlier));
      expect(pageIds.indexOf(earlier)).toBeLessThan(pageIds.indexOf(firstTie));
      expect(pageIds.indexOf(firstTie)).toBeLessThan(pageIds.indexOf(secondTie));
      expect(pageIds.indexOf(secondTie)).toBeLessThan(pageIds.indexOf(later));

      const secondPage = await listGlobalLeaderboard({ limit: 2, offset: 1 });
      expect(secondPage.entries).toEqual(page.entries.slice(1, 3));
    });
  });

  describe("daily_leaderboard", () => {
    it("ranks per challenge with the deterministic tie-break and excludes banned users", async () => {
      const day = await createChallenge(sql, fixtures);
      const otherDay = await createChallenge(sql, fixtures);

      const earlier = await createUser(sql, fixtures);
      const tieA = await createUser(sql, fixtures);
      const tieB = await createUser(sql, fixtures);
      const later = await createUser(sql, fixtures);
      const banned = await createUser(sql, fixtures);
      const otherPlayer = await createUser(sql, fixtures);

      await addDailyBest(earlier, day.challengeId, 20, "2026-02-01T08:00:00.000Z");
      await addDailyBest(tieA, day.challengeId, 20, "2026-02-01T10:00:00.000Z");
      await addDailyBest(tieB, day.challengeId, 20, "2026-02-01T10:00:00.000Z");
      await addDailyBest(later, day.challengeId, 20, "2026-02-01T11:00:00.000Z");
      await addDailyBest(banned, day.challengeId, 30, "2026-02-01T07:00:00.000Z");
      await banUser(banned);
      await addDailyBest(otherPlayer, otherDay.challengeId, 5, "2026-02-02T08:00:00.000Z");

      const ids = new Set([earlier, tieA, tieB, later, banned, otherPlayer]);
      const rows = (await readDailyView()).filter((row) => ids.has(Number(row.user_id)));

      const dayRows = rows.filter((row) => Number(row.daily_challenge_id) === day.challengeId);
      expect(dayRows.map((row) => Number(row.user_id))).toEqual([earlier, tieA, tieB, later]);
      expect(dayRows.map((row) => Number(row.rank))).toEqual([1, 2, 3, 4]);

      const otherDayRows = rows.filter(
        (row) => Number(row.daily_challenge_id) === otherDay.challengeId,
      );
      expect(otherDayRows.map((row) => Number(row.user_id))).toEqual([otherPlayer]);
      expect(otherDayRows.map((row) => Number(row.rank))).toEqual([1]);

      const page = await listDailyLeaderboard({
        date: day.date,
        limit: 50,
        offset: 0,
      });

      expect(page.total).toBe(4);
      expect(page.entries.map((entry) => entry.userId)).toEqual([earlier, tieA, tieB, later]);
      expect(page.entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
      expect(page.entries[0]).toMatchObject({
        dailyChallengeId: day.challengeId,
        challengeDate: day.date,
        score: 20,
      });

      const mine = await findDailyLeaderboardEntry(day.date, later);
      expect(mine).toMatchObject({ rank: 4, userId: later, score: 20 });

      const missingDay = await listDailyLeaderboard({
        date: "2999-01-01",
        limit: 50,
        offset: 0,
      });
      expect(missingDay).toEqual({ entries: [], total: 0 });
    });
  });

  describe("room_scoreboard", () => {
    it("includes banned members, ranks scored members, and leaves no-score members unranked last", async () => {
      const creator = await createUser(sql, fixtures);
      const earlyTie = await createUser(sql, fixtures);
      const tieA = await createUser(sql, fixtures);
      const tieB = await createUser(sql, fixtures);
      const banned = await createUser(sql, fixtures);
      const noScore = await createUser(sql, fixtures);

      const roomId = await createRoom(sql, fixtures, {
        creatorId: creator,
        roomSize: 6,
      });

      await addRoomPlayer(sql, roomId, earlyTie);
      await addRoomPlayer(sql, roomId, tieA);
      await addRoomPlayer(sql, roomId, tieB);
      await addRoomPlayer(sql, roomId, banned);
      await addRoomPlayer(sql, roomId, noScore);

      await sql`
        update rooms
        set status = 'in_progress', started_at = now()
        where room_id = ${roomId}
      `;

      await setRoomBest(roomId, creator, 10, "2026-03-01T08:00:00.000Z");
      await setRoomBest(roomId, earlyTie, 24, "2026-03-01T09:00:00.000Z");
      await setRoomBest(roomId, tieA, 24, "2026-03-01T10:00:00.000Z");
      await setRoomBest(roomId, tieB, 24, "2026-03-01T10:00:00.000Z");
      await setRoomBest(roomId, banned, 30, "2026-03-01T07:00:00.000Z");
      await banUser(banned);

      const rows = await readRoomView(roomId);

      expect(rows.map((row) => Number(row.user_id))).toEqual([
        banned,
        earlyTie,
        tieA,
        tieB,
        creator,
        noScore,
      ]);
      expect(rows.map((row) => (row.rank === null ? null : Number(row.rank)))).toEqual([
        1,
        2,
        3,
        4,
        5,
        null,
      ]);
      expect(rows[5]).toMatchObject({
        best_score: null,
        best_achieved_at: null,
        member_status: "active",
      });

      const scoreboard = await listRoomScoreboard(roomId);
      expect(scoreboard.map((entry) => entry.userId)).toEqual([
        banned,
        earlyTie,
        tieA,
        tieB,
        creator,
        noScore,
      ]);
      expect(scoreboard.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, null]);
      expect(scoreboard[0]).toMatchObject({
        roomId,
        userId: banned,
        bestScore: 30,
      });
      expect(scoreboard[0]?.bestAchievedAt?.toISOString()).toBe("2026-03-01T07:00:00.000Z");

      const mine = await findRoomScoreboardEntry(roomId, noScore);
      expect(mine).toMatchObject({
        rank: null,
        bestScore: null,
        bestAchievedAt: null,
        memberStatus: "active",
      });
    });
  });
});
