import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { getEnv } from "@/lib/config/env";
import { getSqlClient } from "@/lib/db/pg/client";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  submitRoomAttempt,
  type HsvColor,
} from "@/lib/db/pg/functions";

import {
  cleanupFixtures,
  createFixtures,
  createUser,
  readUserStats,
  uniqueRoomCode,
} from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

const COLORS = [
  { h: 12.3, s: 45.6, v: 78.9 },
  { h: 200.0, s: 50.0, v: 60.0 },
  { h: 330.5, s: 80.0, v: 25.0 },
] as const satisfies readonly [HsvColor, HsvColor, HsvColor];

async function expectAppError(query: PromiseLike<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code });
}

interface RoomRow {
  room_id: number;
  room_code: string;
  creator_id: number;
  room_size: number;
  timer_seconds: number | null;
  attempts_limit: number;
  status: string;
  started_at: Date | string | null;
  ended_at: Date | string | null;
}

async function readRoom(roomId: number): Promise<RoomRow> {
  const rows = await sql<
    {
      room_id: string | number;
      room_code: string;
      creator_id: string | number;
      room_size: number;
      timer_seconds: number | null;
      attempts_limit: number;
      status: string;
      started_at: Date | string | null;
      ended_at: Date | string | null;
    }[]
  >`
    select room_id, room_code, creator_id, room_size, timer_seconds,
           attempts_limit, status, started_at, ended_at
    from rooms
    where room_id = ${roomId}
  `;

  const row = rows[0];
  if (!row) throw new Error("Test room not found");

  return {
    room_id: Number(row.room_id),
    room_code: row.room_code,
    creator_id: Number(row.creator_id),
    room_size: Number(row.room_size),
    timer_seconds: row.timer_seconds === null ? null : Number(row.timer_seconds),
    attempts_limit: Number(row.attempts_limit),
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

interface MemberRow {
  status: string;
  attempts_used: number;
  best_score: string | null;
  best_achieved_at: Date | string | null;
}

async function readMember(roomId: number, userId: number): Promise<MemberRow | null> {
  const rows = await sql<
    {
      status: string;
      attempts_used: number;
      best_score: string | null;
      best_achieved_at: Date | string | null;
    }[]
  >`
    select status, attempts_used, best_score, best_achieved_at
    from room_players
    where room_id = ${roomId}
      and user_id = ${userId}
  `;

  const row = rows[0];
  return row
    ? {
        status: row.status,
        attempts_used: Number(row.attempts_used),
        best_score: row.best_score === null ? null : String(row.best_score),
        best_achieved_at: row.best_achieved_at,
      }
    : null;
}

async function createStartedRoom(options?: {
  roomSize?: number;
  attemptsLimit?: 3 | 5;
  timerSeconds?: 5 | 10 | 15 | null;
}): Promise<{ roomId: number; roomCode: string; creatorId: number; memberId: number }> {
  const creatorId = await createUser(sql, fixtures);
  const memberId = await createUser(sql, fixtures);
  const roomCode = uniqueRoomCode();

  const room = await createRoom({
    creatorId,
    roomCode,
    roomSize: options?.roomSize ?? 2,
    timerSeconds: options?.timerSeconds ?? null,
    attemptsLimit: options?.attemptsLimit ?? 3,
  });
  fixtures.roomIds.push(room.room_id);

  await joinRoom({ userId: memberId, roomCode });
  await startRoom({ userId: creatorId, roomCode, colors: COLORS });

  return { roomId: room.room_id, roomCode, creatorId, memberId };
}

async function createLobbyRoom(options?: {
  roomSize?: number;
}): Promise<{ roomId: number; roomCode: string; creatorId: number }> {
  const creatorId = await createUser(sql, fixtures);
  const roomCode = uniqueRoomCode();
  const room = await createRoom({
    creatorId,
    roomCode,
    roomSize: options?.roomSize ?? 3,
    timerSeconds: null,
    attemptsLimit: 3,
  });
  fixtures.roomIds.push(room.room_id);
  return { roomId: room.room_id, roomCode, creatorId };
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 7: room functions", () => {
  it("installs the room functions with the specified signatures", async () => {
    const rows = await sql<{ proname: string; args: string }[]>`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'check_room_over', 'create_room', 'join_room', 'start_room',
          'leave_room', 'submit_room_attempt'
        )
      order by p.proname
    `;

    const signatures = new Map(rows.map((row) => [row.proname, row.args]));

    expect(signatures.get("check_room_over")).toBe("p_room_id bigint");
    expect(signatures.get("create_room")).toBe(
      "p_creator_id bigint, p_room_code text, p_room_size smallint, p_timer_seconds smallint, p_attempts_limit smallint",
    );
    expect(signatures.get("join_room")).toBe("p_user_id bigint, p_room_code text");
    expect(signatures.get("start_room")).toBe("p_user_id bigint, p_room_code text, p_colors jsonb");
    expect(signatures.get("leave_room")).toBe("p_user_id bigint, p_room_code text");
    expect(signatures.get("submit_room_attempt")).toBe(
      "p_user_id bigint, p_room_id bigint, p_round_scores numeric[]",
    );
  });

  describe("create_room", () => {
    it("creates a lobby and inserts the creator as an active member", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomCode = uniqueRoomCode();

      const result = await createRoom({
        creatorId,
        roomCode,
        roomSize: 4,
        timerSeconds: 10,
        attemptsLimit: 5,
      });
      fixtures.roomIds.push(result.room_id);

      expect(result.room_code).toBe(roomCode);
      expect(Number.isSafeInteger(result.room_id)).toBe(true);

      const room = await readRoom(result.room_id);
      expect(room).toMatchObject({
        room_code: roomCode,
        creator_id: creatorId,
        room_size: 4,
        timer_seconds: 10,
        attempts_limit: 5,
        status: "lobby",
        started_at: null,
        ended_at: null,
      });

      const member = await readMember(result.room_id, creatorId);
      expect(member).toMatchObject({
        status: "active",
        attempts_used: 0,
        best_score: null,
        best_achieved_at: null,
      });
    });

    it("rejects invalid options and a missing creator", async () => {
      const creatorId = await createUser(sql, fixtures);
      const code = uniqueRoomCode();

      await expectAppError(
        createRoom({
          creatorId,
          roomCode: code,
          roomSize: 1,
          timerSeconds: null,
          attemptsLimit: 3,
        }),
        "VALIDATION_ERROR",
      );
      await expectAppError(
        createRoom({
          creatorId,
          roomCode: code,
          roomSize: 2,
          timerSeconds: 7 as unknown as 5,
          attemptsLimit: 3,
        }),
        "VALIDATION_ERROR",
      );
      await expectAppError(
        createRoom({
          creatorId,
          roomCode: code,
          roomSize: 2,
          timerSeconds: null,
          attemptsLimit: 4 as unknown as 3,
        }),
        "VALIDATION_ERROR",
      );
      await expectAppError(
        createRoom({
          creatorId,
          roomCode: "",
          roomSize: 2,
          timerSeconds: null,
          attemptsLimit: 3,
        }),
        "VALIDATION_ERROR",
      );
      await expectAppError(
        createRoom({
          creatorId: 999_999_999,
          roomCode: code,
          roomSize: 2,
          timerSeconds: null,
          attemptsLimit: 3,
        }),
        "USER_NOT_FOUND",
      );
    });
  });

  describe("join_room", () => {
    it("joins a lobby, is idempotent for an existing member, and rejects a full room", async () => {
      const { roomId, roomCode } = await createLobbyRoom({ roomSize: 2 });
      const player = await createUser(sql, fixtures);
      const extra = await createUser(sql, fixtures);

      const joined = await joinRoom({ userId: player, roomCode });
      expect(joined).toEqual({ room_id: roomId, outcome: "joined" });

      const again = await joinRoom({ userId: player, roomCode });
      expect(again).toEqual({ room_id: roomId, outcome: "already_member" });

      await expectAppError(joinRoom({ userId: extra, roomCode }), "ROOM_FULL");
    });

    it("rejects a missing room and joining after the room started", async () => {
      await expectAppError(
        joinRoom({ userId: 999_999_999, roomCode: uniqueRoomCode() }),
        "ROOM_NOT_FOUND",
      );

      const { roomCode } = await createStartedRoom();
      const late = await createUser(sql, fixtures);

      await expectAppError(joinRoom({ userId: late, roomCode }), "ROOM_NOT_LOBBY");
    });
  });

  describe("start_room", () => {
    it("requires the creator and at least two members", async () => {
      const creatorId = await createUser(sql, fixtures);
      const other = await createUser(sql, fixtures);
      const roomCode = uniqueRoomCode();
      const room = await createRoom({
        creatorId,
        roomCode,
        roomSize: 3,
        timerSeconds: null,
        attemptsLimit: 3,
      });
      fixtures.roomIds.push(room.room_id);

      await expectAppError(
        startRoom({ userId: creatorId, roomCode, colors: COLORS }),
        "NOT_ENOUGH_PLAYERS",
      );

      await joinRoom({ userId: other, roomCode });

      await expectAppError(
        startRoom({ userId: other, roomCode, colors: COLORS }),
        "NOT_ROOM_CREATOR",
      );
    });

    it("starts the room, stores exactly three colors, and closes the lobby", async () => {
      const creatorId = await createUser(sql, fixtures);
      const other = await createUser(sql, fixtures);
      const roomCode = uniqueRoomCode();
      const room = await createRoom({
        creatorId,
        roomCode,
        roomSize: 3,
        timerSeconds: 15,
        attemptsLimit: 3,
      });
      fixtures.roomIds.push(room.room_id);
      await joinRoom({ userId: other, roomCode });

      const started = await startRoom({ userId: creatorId, roomCode, colors: COLORS });

      expect(started.room_id).toBe(room.room_id);
      expect(Number.isNaN(Date.parse(started.started_at))).toBe(false);

      const stored = await readRoom(room.room_id);
      expect(stored.status).toBe("in_progress");
      expect(stored.started_at).not.toBeNull();
      expect(stored.ended_at).toBeNull();

      const colors = await sql<
        { round_number: number; hue: string; saturation: string; value: string }[]
      >`
        select round_number, hue, saturation, value
        from room_colors
        where room_id = ${room.room_id}
        order by round_number
      `;

      expect(colors).toHaveLength(3);
      expect(colors.map((color) => Number(color.round_number))).toEqual([1, 2, 3]);
      expect(
        colors.map((color) => ({
          h: Number(color.hue),
          s: Number(color.saturation),
          v: Number(color.value),
        })),
      ).toEqual(COLORS.map((color) => ({ ...color })));

      await expectAppError(
        startRoom({ userId: creatorId, roomCode, colors: COLORS }),
        "ROOM_NOT_LOBBY",
      );
    });

    it("rejects malformed color payloads", async () => {
      const creatorId = await createUser(sql, fixtures);
      const other = await createUser(sql, fixtures);
      const roomCode = uniqueRoomCode();
      const room = await createRoom({
        creatorId,
        roomCode,
        roomSize: 2,
        timerSeconds: null,
        attemptsLimit: 3,
      });
      fixtures.roomIds.push(room.room_id);
      await joinRoom({ userId: other, roomCode });

      await expectAppError(
        startRoom({
          userId: creatorId,
          roomCode,
          colors: [] as unknown as readonly [HsvColor, HsvColor, HsvColor],
        }),
        "VALIDATION_ERROR",
      );

      await expectAppError(
        startRoom({
          userId: creatorId,
          roomCode,
          colors: [COLORS[0], COLORS[1], { h: 361, s: 50, v: 50 }] as readonly [
            HsvColor,
            HsvColor,
            HsvColor,
          ],
        }),
        "VALIDATION_ERROR",
      );

      await startRoom({ userId: creatorId, roomCode, colors: COLORS });

      await expectAppError(
        startRoom({ userId: creatorId, roomCode, colors: COLORS }),
        "ROOM_NOT_LOBBY",
      );
    });
  });

  describe("leave_room", () => {
    it("deletes a non-creator's lobby row and cancels the room when the creator leaves", async () => {
      const { roomId, roomCode, creatorId } = await createLobbyRoom({ roomSize: 3 });
      const player = await createUser(sql, fixtures);
      await joinRoom({ userId: player, roomCode });

      const left = await leaveRoom({ userId: player, roomCode });
      expect(left).toEqual({ outcome: "left_lobby", room_status: "lobby" });
      expect(await readMember(roomId, player)).toBeNull();

      const cancelled = await leaveRoom({ userId: creatorId, roomCode });
      expect(cancelled).toEqual({ outcome: "room_cancelled", room_status: "cancelled" });

      const room = await readRoom(roomId);
      expect(room.status).toBe("cancelled");
      expect(room.ended_at).not.toBeNull();
    });

    it("marks an in-progress member as left and keeps the best score", async () => {
      const { roomId, roomCode, memberId } = await createStartedRoom();
      const attempt = await submitRoomAttempt({
        userId: memberId,
        roomId,
        roundScores: [8, 8, 8],
      });
      expect(attempt.best_score).toBe(24);

      const left = await leaveRoom({ userId: memberId, roomCode });
      expect(left).toEqual({ outcome: "left_in_progress", room_status: "in_progress" });

      const member = await readMember(roomId, memberId);
      expect(member).toMatchObject({ status: "left", attempts_used: 1, best_score: "24.0" });

      const again = await leaveRoom({ userId: memberId, roomCode });
      expect(again).toEqual({ outcome: "noop", room_status: "in_progress" });

      await expectAppError(leaveRoom({ userId: 999_999_999, roomCode }), "NOT_ROOM_MEMBER");
    });

    it("finishes the room when the last active member leaves", async () => {
      const { roomCode, memberId, creatorId } = await createStartedRoom();

      const first = await leaveRoom({ userId: memberId, roomCode });
      expect(first.room_status).toBe("in_progress");

      const last = await leaveRoom({ userId: creatorId, roomCode });
      expect(last).toEqual({ outcome: "left_in_progress", room_status: "finished" });
    });

    it("returns noop for finished and cancelled rooms", async () => {
      const { roomId, roomCode, creatorId, memberId } = await createStartedRoom();

      await leaveRoom({ userId: memberId, roomCode });
      await leaveRoom({ userId: creatorId, roomCode });

      const room = await readRoom(roomId);
      expect(room.status).toBe("finished");

      const afterFinish = await leaveRoom({ userId: creatorId, roomCode });
      expect(afterFinish).toEqual({ outcome: "noop", room_status: "finished" });

      const cancelledRoom = await createLobbyRoom();
      const cancelled = await leaveRoom({
        userId: cancelledRoom.creatorId,
        roomCode: cancelledRoom.roomCode,
      });
      expect(cancelled.room_status).toBe("cancelled");

      const afterCancel = await leaveRoom({
        userId: cancelledRoom.creatorId,
        roomCode: cancelledRoom.roomCode,
      });
      expect(afterCancel).toEqual({ outcome: "noop", room_status: "cancelled" });
    });
  });

  describe("submit_room_attempt", () => {
    it("consumes attempts, keeps only strictly greater bests, and finishes at the limit", async () => {
      const { roomId, creatorId, memberId } = await createStartedRoom({ attemptsLimit: 3 });

      const statsBefore = await readUserStats(sql, creatorId);

      const first = await submitRoomAttempt({
        userId: creatorId,
        roomId,
        roundScores: [7, 7, 7],
      });

      expect(first).toEqual({
        attempt_number: 1,
        total_score: 21,
        best_score: 21,
        is_new_best: true,
        attempts_remaining: 2,
        member_status: "active",
        room_status: "in_progress",
      });

      const bestAt = (await readMember(roomId, creatorId))?.best_achieved_at;

      const equal = await submitRoomAttempt({
        userId: creatorId,
        roomId,
        roundScores: [10, 6, 5],
      });

      expect(equal).toMatchObject({
        attempt_number: 2,
        total_score: 21,
        best_score: 21,
        is_new_best: false,
        attempts_remaining: 1,
      });
      expect((await readMember(roomId, creatorId))?.best_achieved_at).toEqual(bestAt);

      const lower = await submitRoomAttempt({
        userId: creatorId,
        roomId,
        roundScores: [1, 1, 1],
      });

      expect(lower).toMatchObject({
        attempt_number: 3,
        total_score: 3,
        best_score: 21,
        is_new_best: false,
        attempts_remaining: 0,
        member_status: "finished",
        room_status: "in_progress",
      });

      await expectAppError(
        submitRoomAttempt({ userId: creatorId, roomId, roundScores: [9, 9, 9] }),
        "MEMBER_NOT_ACTIVE",
      );

      const other = await submitRoomAttempt({
        userId: memberId,
        roomId,
        roundScores: [6, 6, 6],
      });
      expect(other.room_status).toBe("in_progress");

      await submitRoomAttempt({ userId: memberId, roomId, roundScores: [6, 6, 6] });
      const final = await submitRoomAttempt({
        userId: memberId,
        roomId,
        roundScores: [6, 6, 6],
      });

      expect(final.member_status).toBe("finished");
      expect(final.room_status).toBe("finished");
      expect((await readRoom(roomId)).status).toBe("finished");

      // Room attempts must not touch user stats, PBs, streaks or achievements.
      const statsAfter = await readUserStats(sql, creatorId);
      expect(statsAfter).toEqual(statsBefore);
    });

    it("raises ATTEMPTS_EXHAUSTED when an active member already used the limit", async () => {
      const { roomId, creatorId } = await createStartedRoom({ attemptsLimit: 3 });

      await sql`
        update room_players
        set attempts_used = 3
        where room_id = ${roomId}
          and user_id = ${creatorId}
      `;

      await expectAppError(
        submitRoomAttempt({ userId: creatorId, roomId, roundScores: [1, 2, 3] }),
        "ATTEMPTS_EXHAUSTED",
      );
    });

    it("rejects missing rooms, non-members, lobby rooms, inactive members and invalid scores", async () => {
      await expectAppError(
        submitRoomAttempt({ userId: 999_999_999, roomId: 999_999_999, roundScores: [1, 2, 3] }),
        "ROOM_NOT_FOUND",
      );

      const lobby = await createLobbyRoom();
      await expectAppError(
        submitRoomAttempt({
          userId: lobby.creatorId,
          roomId: lobby.roomId,
          roundScores: [1, 2, 3],
        }),
        "ROOM_NOT_IN_PROGRESS",
      );

      const { roomId, creatorId } = await createStartedRoom();
      const outsider = await createUser(sql, fixtures);
      await expectAppError(
        submitRoomAttempt({ userId: outsider, roomId, roundScores: [1, 2, 3] }),
        "NOT_ROOM_MEMBER",
      );

      await expectAppError(
        submitRoomAttempt({
          userId: creatorId,
          roomId,
          roundScores: [1, 2] as unknown as [number, number, number],
        }),
        "VALIDATION_ERROR",
      );
      await expectAppError(
        submitRoomAttempt({ userId: creatorId, roomId, roundScores: [1, 2, 10.1] }),
        "VALIDATION_ERROR",
      );
    });
  });

  it("finishes the room when two members submit their final attempts concurrently", async () => {
    const { roomId, creatorId, memberId } = await createStartedRoom({ attemptsLimit: 3 });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await submitRoomAttempt({ userId: creatorId, roomId, roundScores: [7, 7, 7] });
      await submitRoomAttempt({ userId: memberId, roomId, roundScores: [6, 6, 6] });
    }

    const connectionString = getEnv().DATABASE_URL;
    const clientA = postgres(connectionString, { prepare: false, max: 1 });
    const clientB = postgres(connectionString, { prepare: false, max: 1 });

    try {
      const [resultA, resultB] = await Promise.all([
        clientA<{ result: { attempt_number: number; room_status: string } }[]>`
          select submit_room_attempt(
            ${creatorId}::bigint,
            ${roomId}::bigint,
            array[${8}::numeric, ${8}::numeric, ${8}::numeric]::numeric[]
          ) as result
        `,
        clientB<{ result: { attempt_number: number; room_status: string } }[]>`
          select submit_room_attempt(
            ${memberId}::bigint,
            ${roomId}::bigint,
            array[${9}::numeric, ${9}::numeric, ${9}::numeric]::numeric[]
          ) as result
        `,
      ]);

      expect(resultA[0]?.result.attempt_number).toBe(3);
      expect(resultB[0]?.result.attempt_number).toBe(3);
      expect([resultA[0]?.result.room_status, resultB[0]?.result.room_status]).toContain(
        "finished",
      );
    } finally {
      await clientA.end();
      await clientB.end();
    }

    expect((await readRoom(roomId)).status).toBe("finished");
    expect((await readMember(roomId, creatorId))?.status).toBe("finished");
    expect((await readMember(roomId, memberId))?.status).toBe("finished");
  });
});
