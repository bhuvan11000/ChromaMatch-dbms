import { randomUUID } from "node:crypto";

import type { getSqlClient } from "@/lib/db/pg/client";

export type SqlClient = ReturnType<typeof getSqlClient>;

export interface Fixtures {
  userIds: number[];
  roomIds: number[];
  achievementIds: number[];
}

export function createFixtures(): Fixtures {
  return { userIds: [], roomIds: [], achievementIds: [] };
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

export async function cleanupFixtures(sql: SqlClient, fixtures: Fixtures): Promise<void> {
  for (const roomId of fixtures.roomIds) {
    await sql`delete from rooms where room_id = ${roomId}`;
  }
  for (const userId of fixtures.userIds) {
    await sql`delete from users where user_id = ${userId}`;
  }
  for (const achievementId of fixtures.achievementIds) {
    await sql`delete from achievements where achievement_id = ${achievementId}`;
  }
}
