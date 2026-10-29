import { sql } from "drizzle-orm";

import { AppError } from "@/lib/errors";

import { getDb } from "./client";
import { mapPgError } from "./errors";

/**
 * Typed wrappers around the PostgreSQL game/daily functions.
 * Architecture §5.8.3 and §5.8.8.
 *
 * Function names and argument order live only here. All values are bound
 * through Drizzle's `sql` template; no SQL is string-built from request data.
 */

export type GameResultMode = "global" | "daily";

export type RoomStatus = "lobby" | "in_progress" | "finished" | "cancelled";
export type RoomMemberStatus = "active" | "finished" | "left";
export type RoomJoinOutcome = "joined" | "already_member";
export type RoomLeaveOutcome = "left_lobby" | "room_cancelled" | "left_in_progress" | "noop";

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface SubmitGameResultInput {
  userId: number;
  mode: GameResultMode;
  challengeId: number | null;
  roundScores: readonly [number, number, number];
  playedAt: Date;
}

export interface SubmitGameResult {
  total_score: number;
  mode: GameResultMode;
  total_games_played: number;
  pb: {
    scope: GameResultMode;
    previous: number | null;
    current: number;
    updated: boolean;
    beat_existing: boolean;
  };
  /** Daily only; omitted for Global. */
  streak?: {
    current: number;
    longest: number;
  };
  unlocked: Array<{
    achievement_id: number;
    name: string;
    description: string;
  }>;
}

function parseJsonb<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Calls `submit_game_result` and returns its jsonb payload. */
export async function submitGameResult(input: SubmitGameResultInput): Promise<SubmitGameResult> {
  const scoreList = sql.join(
    input.roundScores.map((score) => sql`${score}::numeric`),
    sql`, `,
  );

  try {
    const rows = await getDb().execute<{ result: unknown }>(sql`
      select "submit_game_result"(
        ${input.userId}::bigint,
        ${input.mode}::text,
        ${input.challengeId}::bigint,
        array[${scoreList}]::numeric[],
        ${input.playedAt.toISOString()}::timestamptz
      ) as "result"
    `);

    const raw = rows[0]?.result;
    if (raw === undefined || raw === null) {
      throw new AppError("INTERNAL_ERROR");
    }

    return parseJsonb<SubmitGameResult>(raw);
  } catch (error) {
    throw mapPgError(error);
  }
}

/**
 * Calls `ensure_daily_challenge` and returns the challenge id as a JS number.
 * The SQL function rejects dates other than the current UTC date.
 */
export async function ensureDailyChallenge(
  date: string,
  colors: readonly [HsvColor, HsvColor, HsvColor],
): Promise<number> {
  try {
    const rows = await getDb().execute<{ challenge_id: unknown }>(sql`
      select "ensure_daily_challenge"(
        ${date}::date,
        ${JSON.stringify(colors)}::jsonb
      ) as "challenge_id"
    `);

    const challengeId = Number(rows[0]?.challenge_id);
    if (!Number.isSafeInteger(challengeId)) {
      throw new AppError("INTERNAL_ERROR");
    }

    return challengeId;
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface CreateRoomInput {
  creatorId: number;
  roomCode: string;
  roomSize: number;
  timerSeconds: 5 | 10 | 15 | null;
  attemptsLimit: 3 | 5;
}

export interface CreateRoomResult {
  room_id: number;
  room_code: string;
}

/** Calls `create_room`. A duplicate code raises `23505`; the service retries. */
export async function createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
  try {
    const rows = await getDb().execute<{ result: unknown }>(sql`
      select "create_room"(
        ${input.creatorId}::bigint,
        ${input.roomCode}::text,
        ${input.roomSize}::smallint,
        ${input.timerSeconds}::smallint,
        ${input.attemptsLimit}::smallint
      ) as "result"
    `);

    const raw = rows[0]?.result;
    if (raw === undefined || raw === null) {
      throw new AppError("INTERNAL_ERROR");
    }

    return parseJsonb<CreateRoomResult>(raw);
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface JoinRoomInput {
  userId: number;
  roomCode: string;
}

export interface JoinRoomResult {
  room_id: number;
  outcome: RoomJoinOutcome;
}

/** Calls `join_room`; idempotent when the caller is already a member. */
export async function joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
  try {
    const rows = await getDb().execute<{ result: unknown }>(sql`
      select "join_room"(
        ${input.userId}::bigint,
        ${input.roomCode}::text
      ) as "result"
    `);

    const raw = rows[0]?.result;
    if (raw === undefined || raw === null) {
      throw new AppError("INTERNAL_ERROR");
    }

    return parseJsonb<JoinRoomResult>(raw);
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface StartRoomInput {
  userId: number;
  roomCode: string;
  colors: readonly [HsvColor, HsvColor, HsvColor];
}

export interface StartRoomResult {
  room_id: number;
  /** ISO-8601 UTC string, as serialized in the function's jsonb payload. */
  started_at: string;
}

/** Calls `start_room`; only the creator can start a lobby with two or more members. */
export async function startRoom(input: StartRoomInput): Promise<StartRoomResult> {
  try {
    const rows = await getDb().execute<{ result: unknown }>(sql`
      select "start_room"(
        ${input.userId}::bigint,
        ${input.roomCode}::text,
        ${JSON.stringify(input.colors)}::jsonb
      ) as "result"
    `);

    const raw = rows[0]?.result;
    if (raw === undefined || raw === null) {
      throw new AppError("INTERNAL_ERROR");
    }

    return parseJsonb<StartRoomResult>(raw);
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface LeaveRoomInput {
  userId: number;
  roomCode: string;
}

export interface LeaveRoomResult {
  outcome: RoomLeaveOutcome;
  room_status: RoomStatus;
}

/** Calls `leave_room`; the room row is locked before the member row. */
export async function leaveRoom(input: LeaveRoomInput): Promise<LeaveRoomResult> {
  try {
    const rows = await getDb().execute<{ result: unknown }>(sql`
      select "leave_room"(
        ${input.userId}::bigint,
        ${input.roomCode}::text
      ) as "result"
    `);

    const raw = rows[0]?.result;
    if (raw === undefined || raw === null) {
      throw new AppError("INTERNAL_ERROR");
    }

    return parseJsonb<LeaveRoomResult>(raw);
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface SubmitRoomAttemptInput {
  userId: number;
  roomId: number;
  roundScores: readonly [number, number, number];
}

export interface SubmitRoomAttemptResult {
  attempt_number: number;
  total_score: number;
  best_score: number;
  is_new_best: boolean;
  attempts_remaining: number;
  member_status: RoomMemberStatus;
  room_status: RoomStatus;
}

/**
 * Calls `submit_room_attempt`. Room attempts never touch `users` stats, PBs,
 * streaks or achievements.
 */
export async function submitRoomAttempt(
  input: SubmitRoomAttemptInput,
): Promise<SubmitRoomAttemptResult> {
  const scoreList = sql.join(
    input.roundScores.map((score) => sql`${score}::numeric`),
    sql`, `,
  );

  try {
    const rows = await getDb().execute<{ result: unknown }>(sql`
      select "submit_room_attempt"(
        ${input.userId}::bigint,
        ${input.roomId}::bigint,
        array[${scoreList}]::numeric[]
      ) as "result"
    `);

    const raw = rows[0]?.result;
    if (raw === undefined || raw === null) {
      throw new AppError("INTERNAL_ERROR");
    }

    return parseJsonb<SubmitRoomAttemptResult>(raw);
  } catch (error) {
    throw mapPgError(error);
  }
}

/**
 * Calls `check_room_over`. The caller must already hold the `rooms` row lock
 * (i.e. this is normally called from another SQL function in the same
 * transaction, not directly from application code).
 */
export async function checkRoomOver(roomId: number): Promise<void> {
  try {
    await getDb().execute(sql`
      select "check_room_over"(${roomId}::bigint)
    `);
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface AdminSetBanInput {
  adminId: number;
  targetId: number;
  banned: boolean;
}

/** Calls the `admin_set_ban` procedure. The SQL re-checks the admin role. */
export async function adminSetBan(input: AdminSetBanInput): Promise<void> {
  try {
    await getDb().execute(sql`
      call "admin_set_ban"(
        ${input.adminId}::bigint,
        ${input.targetId}::bigint,
        ${input.banned}::boolean
      )
    `);
  } catch (error) {
    throw mapPgError(error);
  }
}

export interface AdminUserStatsPatch {
  global_best_score?: number | null;
  global_best_achieved_at?: string | null;
  total_games_played?: number;
  current_daily_streak?: number;
  longest_daily_streak?: number;
  last_daily_played_date?: string | null;
}

export interface AdminUpdateUserStatsInput {
  adminId: number;
  targetId: number;
  patch: AdminUserStatsPatch;
}

/**
 * Calls the `admin_update_user_stats` procedure. Unknown keys are rejected by
 * the procedure with `INVALID_PATCH`; invalid values become `VALIDATION_ERROR`.
 */
export async function adminUpdateUserStats(input: AdminUpdateUserStatsInput): Promise<void> {
  try {
    await getDb().execute(sql`
      call "admin_update_user_stats"(
        ${input.adminId}::bigint,
        ${input.targetId}::bigint,
        ${JSON.stringify(input.patch)}::jsonb
      )
    `);
  } catch (error) {
    throw mapPgError(error);
  }
}
