import { randomInt, randomUUID } from "node:crypto";

import type { getSqlClient } from "@/lib/db/pg/client";

export type SqlClient = ReturnType<typeof getSqlClient>;

export interface Fixtures {
  userIds: number[];
  roomIds: number[];
  achievementIds: number[];
  challengeIds: number[];
}

export function createFixtures(): Fixtures {
  return { userIds: [], roomIds: [], achievementIds: [], challengeIds: [] };
}

export function uniqueSuffix(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

export function uniqueRoomCode(): string {
  return `R${uniqueSuffix().slice(0, 7).toUpperCase()}`;
}

export async function createUser(sql: SqlClient, fixtures: Fixtures): Promise<number> {
  const suffix = uniqueSuffix();
  const rows = await sql<{ user_id: number }[]>`
    insert into users (username, email, password_hash)
    values (${`user_${suffix}`}, ${`user_${suffix}@example.test`}, 'test-hash')
    returning user_id
  `;
  const userId = Number(rows[0]?.user_id);
  if (!Number.isSafeInteger(userId)) {
    throw new Error("Failed to create test user");
  }
  fixtures.userIds.push(userId);
  return userId;
}

export interface CreateRoomOptions {
  creatorId: number;
  roomSize?: number;
  attemptsLimit?: 3 | 5;
  timerSeconds?: number | null;
  status?: "lobby" | "in_progress" | "finished" | "cancelled";
}

export async function createRoom(
  sql: SqlClient,
  fixtures: Fixtures,
  options: CreateRoomOptions,
): Promise<number> {
  const rows = await sql<{ room_id: number }[]>`
    insert into rooms (room_code, creator_id, room_size, timer_seconds, attempts_limit, status)
    values (
      ${uniqueRoomCode()},
      ${options.creatorId},
      ${options.roomSize ?? 2},
      ${options.timerSeconds ?? null},
      ${options.attemptsLimit ?? 3},
      'lobby'
    )
    returning room_id
  `;
  const roomId = Number(rows[0]?.room_id);
  if (!Number.isSafeInteger(roomId)) {
    throw new Error("Failed to create test room");
  }
  fixtures.roomIds.push(roomId);

  await sql`
    insert into room_players (room_id, user_id)
    values (${roomId}, ${options.creatorId})
  `;

  if (options.status === "in_progress") {
    await sql`
      update rooms
      set status = 'in_progress', started_at = now()
      where room_id = ${roomId}
    `;
  } else if (options.status === "finished") {
    await sql`
      update rooms
      set status = 'in_progress', started_at = now()
      where room_id = ${roomId}
    `;
    await sql`
      update rooms
      set status = 'finished', ended_at = now()
      where room_id = ${roomId}
    `;
  } else if (options.status === "cancelled") {
    await sql`
      update rooms
      set status = 'cancelled', ended_at = now()
      where room_id = ${roomId}
    `;
  }

  return roomId;
}

export async function addRoomPlayer(sql: SqlClient, roomId: number, userId: number): Promise<void> {
  await sql`
    insert into room_players (room_id, user_id)
    values (${roomId}, ${userId})
  `;
}

export interface ChallengeFixture {
  challengeId: number;
  date: string;
}

/**
 * Creates a challenge for a test-only past date (or the supplied date) with
 * three valid colors. If the random date already exists, it reuses that row and
 * does not register it for deletion.
 */
export async function createChallenge(
  sql: SqlClient,
  fixtures: Fixtures,
  date?: string,
): Promise<ChallengeFixture> {
  const offset = randomInt(0, 30_000);
  const dateExpression = date ? sql`${date}::date` : sql`date '1900-01-01' + ${offset}::integer`;

  const inserted = await sql<{ daily_challenge_id: number; challenge_date: string }[]>`
    insert into daily_challenges (challenge_date)
    values (${dateExpression})
    on conflict (challenge_date) do nothing
    returning daily_challenge_id, challenge_date::text
  `;

  let row = inserted[0];
  const created = row !== undefined;

  if (!row) {
    const selected = await sql<{ daily_challenge_id: number; challenge_date: string }[]>`
      select daily_challenge_id, challenge_date::text
      from daily_challenges
      where challenge_date = ${dateExpression}
    `;
    row = selected[0];
  }

  if (!row) {
    throw new Error("Failed to create or find test daily challenge");
  }

  const challengeId = Number(row.daily_challenge_id);
  if (!Number.isSafeInteger(challengeId)) {
    throw new Error("Failed to create test daily challenge");
  }

  if (created) {
    fixtures.challengeIds.push(challengeId);

    await sql`
      insert into challenge_colors (daily_challenge_id, round_number, hue, saturation, value)
      values
        (${challengeId}, 1, 12.0, 50.0, 50.0),
        (${challengeId}, 2, 120.0, 60.0, 70.0),
        (${challengeId}, 3, 300.0, 40.0, 30.0)
    `;
  }

  return { challengeId, date: row.challenge_date };
}

export type AchievementCriteriaType =
  "games_played" | "daily_streak" | "perfect_round" | "new_pb" | "first_daily" | "first_global";

export interface CreateAchievementOptions {
  criteriaType: AchievementCriteriaType;
  threshold?: number | null;
  namePrefix?: string;
}

export async function createAchievement(
  sql: SqlClient,
  fixtures: Fixtures,
  options: CreateAchievementOptions,
): Promise<number> {
  const suffix = uniqueSuffix();
  const name = `${options.namePrefix ?? options.criteriaType}_${suffix}`;

  const rows = await sql<{ achievement_id: number }[]>`
    insert into achievements (
      name, description, criteria_type, threshold, criteria_description
    )
    values (
      ${name},
      'test description',
      ${options.criteriaType},
      ${options.threshold ?? null},
      'test criteria'
    )
    returning achievement_id
  `;

  const achievementId = Number(rows[0]?.achievement_id);
  if (!Number.isSafeInteger(achievementId)) {
    throw new Error("Failed to create test achievement");
  }

  fixtures.achievementIds.push(achievementId);
  return achievementId;
}

export interface UserStats {
  globalBestScore: number | null;
  globalBestAchievedAt: Date | null;
  totalGamesPlayed: number;
  currentDailyStreak: number;
  longestDailyStreak: number;
  lastDailyPlayedDate: string | null;
}

export async function readUserStats(sql: SqlClient, userId: number): Promise<UserStats> {
  const rows = await sql<
    {
      global_best_score: string | null;
      global_best_achieved_at: Date | string | null;
      total_games_played: number;
      current_daily_streak: number;
      longest_daily_streak: number;
      last_daily_played_date: Date | string | null;
    }[]
  >`
    select
      global_best_score,
      global_best_achieved_at,
      total_games_played,
      current_daily_streak,
      longest_daily_streak,
      last_daily_played_date
    from users
    where user_id = ${userId}
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("Test user not found");
  }

  const lastPlayed = row.last_daily_played_date;

  return {
    globalBestScore: row.global_best_score === null ? null : Number(row.global_best_score),
    globalBestAchievedAt:
      row.global_best_achieved_at === null
        ? null
        : typeof row.global_best_achieved_at === "string"
          ? new Date(row.global_best_achieved_at)
          : row.global_best_achieved_at,
    totalGamesPlayed: Number(row.total_games_played),
    currentDailyStreak: Number(row.current_daily_streak),
    longestDailyStreak: Number(row.longest_daily_streak),
    lastDailyPlayedDate:
      lastPlayed === null
        ? null
        : typeof lastPlayed === "string"
          ? lastPlayed
          : lastPlayed.toISOString().slice(0, 10),
  };
}

export interface DailyBest {
  bestScore: number;
  achievedAt: Date;
}

export async function readDailyBest(
  sql: SqlClient,
  userId: number,
  challengeId: number,
): Promise<DailyBest | null> {
  const rows = await sql<{ best_score: string; achieved_at: Date | string }[]>`
    select best_score, achieved_at
    from daily_personal_bests
    where user_id = ${userId}
      and daily_challenge_id = ${challengeId}
  `;

  const row = rows[0];
  return row
    ? {
        bestScore: Number(row.best_score),
        achievedAt:
          typeof row.achieved_at === "string" ? new Date(row.achieved_at) : row.achieved_at,
      }
    : null;
}

export interface ChallengeColor {
  roundNumber: number;
  h: number;
  s: number;
  v: number;
}

export async function readChallengeColors(
  sql: SqlClient,
  challengeId: number,
): Promise<ChallengeColor[]> {
  const rows = await sql<
    { round_number: number; hue: string; saturation: string; value: string }[]
  >`
    select round_number, hue, saturation, value
    from challenge_colors
    where daily_challenge_id = ${challengeId}
    order by round_number
  `;

  return rows.map((row) => ({
    roundNumber: Number(row.round_number),
    h: Number(row.hue),
    s: Number(row.saturation),
    v: Number(row.value),
  }));
}

export async function cleanupFixtures(sql: SqlClient, fixtures: Fixtures): Promise<void> {
  for (const roomId of fixtures.roomIds) {
    await sql`delete from rooms where room_id = ${roomId}`;
  }
  for (const userId of fixtures.userIds) {
    await sql`delete from users where user_id = ${userId}`;
  }
  for (const challengeId of fixtures.challengeIds) {
    await sql`delete from daily_challenges where daily_challenge_id = ${challengeId}`;
  }
  for (const achievementId of fixtures.achievementIds) {
    await sql`delete from achievements where achievement_id = ${achievementId}`;
  }
}
