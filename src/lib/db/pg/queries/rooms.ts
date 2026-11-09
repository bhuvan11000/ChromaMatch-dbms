import { sql } from "drizzle-orm";

import { AppError } from "@/lib/errors";

import { getDb } from "../client";
import { mapPgError } from "../errors";
import type { RoomMemberStatus, RoomStatus } from "../functions";

/**
 * Read-only access to `room_scoreboard` — Architecture §5.8.5.
 * Banned players are intentionally included (§6 default).
 */

export type RoomScoreboardMemberStatus = "active" | "finished" | "left";

export interface RoomScoreboardEntry {
  roomId: number;
  /** null when the member has no completed attempt yet. */
  rank: number | null;
  userId: number;
  username: string;
  memberStatus: RoomScoreboardMemberStatus;
  attemptsUsed: number;
  bestScore: number | null;
  bestAchievedAt: Date | null;
}

type RoomScoreboardRow = {
  room_id: string | number;
  rank: string | number | null;
  user_id: string | number;
  username: string;
  member_status: string;
  attempts_used: string | number;
  best_score: string | number | null;
  best_achieved_at: Date | string | null;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapRow(row: RoomScoreboardRow): RoomScoreboardEntry {
  return {
    roomId: Number(row.room_id),
    rank: row.rank === null ? null : Number(row.rank),
    userId: Number(row.user_id),
    username: row.username,
    memberStatus: row.member_status as RoomScoreboardMemberStatus,
    attemptsUsed: Number(row.attempts_used),
    bestScore: row.best_score === null ? null : Number(row.best_score),
    bestAchievedAt: row.best_achieved_at === null ? null : toDate(row.best_achieved_at),
  };
}

/** Full scoreboard for a room, ranked; members without a score come last. */
export async function listRoomScoreboard(roomId: number): Promise<RoomScoreboardEntry[]> {
  try {
    const rows = await getDb().execute<RoomScoreboardRow>(sql`
      select "room_id", "rank", "user_id", "username", "member_status",
             "attempts_used", "best_score", "best_achieved_at"
      from "room_scoreboard"
      where "room_id" = ${roomId}::bigint
      order by "rank" asc nulls last, "user_id" asc
    `);

    return rows.map(mapRow);
  } catch (error) {
    throw mapPgError(error);
  }
}

/** The viewer's own scoreboard row, or null if they are not a member. */
export async function findRoomScoreboardEntry(
  roomId: number,
  userId: number,
): Promise<RoomScoreboardEntry | null> {
  try {
    const rows = await getDb().execute<RoomScoreboardRow>(sql`
      select "room_id", "rank", "user_id", "username", "member_status",
             "attempts_used", "best_score", "best_achieved_at"
      from "room_scoreboard"
      where "room_id" = ${roomId}::bigint
        and "user_id" = ${userId}::bigint
    `);

    const row = rows[0];
    return row ? mapRow(row) : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

/* ------------------------------------------------------------------ */
/* Room, membership and colour readers (Architecture §5.7.4 / §5.8)     */
/* ------------------------------------------------------------------ */

export interface RoomRecord {
  roomId: number;
  code: string;
  creatorId: number;
  roomSize: number;
  timerSeconds: 5 | 10 | 15 | null;
  attemptsLimit: 3 | 5;
  status: RoomStatus;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface RoomMemberRecord {
  status: RoomMemberStatus;
  attemptsUsed: number;
  bestScore: number | null;
  joinedAt: Date;
}

export interface RoomMemberWithUser extends RoomMemberRecord {
  userId: number;
  username: string;
}

export interface RoomColor {
  h: number;
  s: number;
  v: number;
}

type RoomRow = {
  room_id: string | number;
  room_code: string;
  creator_id: string | number;
  room_size: string | number;
  timer_seconds: string | number | null;
  attempts_limit: string | number;
  status: string;
  created_at: Date | string;
  started_at: Date | string | null;
  ended_at: Date | string | null;
};

type MemberRow = {
  user_id?: string | number;
  username?: string;
  status: string;
  attempts_used: string | number;
  best_score: string | number | null;
  joined_at: Date | string;
};

function optionalDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

/** Exact-match lookup; callers normalize the code (trim + upper-case) first. */
export async function findRoomByCode(code: string): Promise<RoomRecord | null> {
  try {
    const rows = await getDb().execute<RoomRow>(sql`
      select "room_id", "room_code", "creator_id", "room_size", "timer_seconds",
             "attempts_limit", "status", "created_at", "started_at", "ended_at"
      from "rooms"
      where "room_code" = ${code}::text
    `);

    const row = rows[0];
    if (!row) return null;

    return {
      roomId: Number(row.room_id),
      code: row.room_code,
      creatorId: Number(row.creator_id),
      roomSize: Number(row.room_size),
      timerSeconds: row.timer_seconds === null ? null : (Number(row.timer_seconds) as 5 | 10 | 15),
      attemptsLimit: Number(row.attempts_limit) as 3 | 5,
      status: row.status as RoomStatus,
      createdAt: toDate(row.created_at),
      startedAt: optionalDate(row.started_at),
      endedAt: optionalDate(row.ended_at),
    };
  } catch (error) {
    throw mapPgError(error);
  }
}

function mapMember(row: MemberRow): RoomMemberRecord {
  return {
    status: row.status as RoomMemberStatus,
    attemptsUsed: Number(row.attempts_used),
    bestScore: row.best_score === null ? null : Number(row.best_score),
    joinedAt: toDate(row.joined_at),
  };
}

/** One membership row (any status, including `left`), or null. */
export async function findRoomMember(
  roomId: number,
  userId: number,
): Promise<RoomMemberRecord | null> {
  try {
    const rows = await getDb().execute<MemberRow>(sql`
      select "status", "attempts_used", "best_score", "joined_at"
      from "room_players"
      where "room_id" = ${roomId}::bigint
        and "user_id" = ${userId}::bigint
    `);

    const row = rows[0];
    return row ? mapMember(row) : null;
  } catch (error) {
    throw mapPgError(error);
  }
}

/** Every membership of a room joined with usernames, in join order. */
export async function listRoomMembers(roomId: number): Promise<RoomMemberWithUser[]> {
  try {
    const rows = await getDb().execute<MemberRow>(sql`
      select rp."user_id", u."username", rp."status", rp."attempts_used",
             rp."best_score", rp."joined_at"
      from "room_players" rp
      join "users" u on u."user_id" = rp."user_id"
      where rp."room_id" = ${roomId}::bigint
      order by rp."joined_at" asc, rp."user_id" asc
    `);

    return rows.map((row) => ({
      ...mapMember(row),
      userId: Number(row.user_id),
      username: row.username ?? "",
    }));
  } catch (error) {
    throw mapPgError(error);
  }
}

/** The room's three colours in colour-number order; anything else is a server fault. */
export async function listRoomColors(roomId: number): Promise<[RoomColor, RoomColor, RoomColor]> {
  type ColorRow = {
    hue: string | number;
    saturation: string | number;
    value: string | number;
  };
  let rows: ColorRow[];

  try {
    rows = await getDb().execute<ColorRow>(sql`
      select "hue", "saturation", "value"
      from "room_colors"
      where "room_id" = ${roomId}::bigint
      order by "round_number" asc
    `);
  } catch (error) {
    throw mapPgError(error);
  }

  if (rows.length !== 3) {
    throw new AppError("INTERNAL_ERROR", "A started room must have exactly 3 colors.");
  }

  const colors = rows.map((row): RoomColor => ({
    h: Number(row.hue),
    s: Number(row.saturation),
    v: Number(row.value),
  }));

  return [colors[0], colors[1], colors[2]];
}
