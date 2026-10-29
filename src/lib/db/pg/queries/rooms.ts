import { sql } from "drizzle-orm";

import { getDb } from "../client";
import { mapPgError } from "../errors";

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
