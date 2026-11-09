import { Long } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getGameHistoryCollection, getMongoClient, getMongoDb } from "@/lib/db/mongo/client";
import { getSqlClient } from "@/lib/db/pg/client";
import type { RoomState } from "@/lib/schemas/rooms";
import { startGame, submitGame } from "@/lib/services/gameService";
import {
  createRoom,
  getRoomState,
  joinRoom,
  leaveRoom,
  startRoom,
} from "@/lib/services/roomService";

import { initMongo } from "../../scripts/init-mongo";

import {
  banUser,
  cleanupFixtures,
  createFixtures,
  createUser,
  readUserStats,
} from "./support/fixtures";
import { cleanupHistory } from "./support/mongo";

const sql = getSqlClient();
const fixtures = createFixtures();
const collection = getGameHistoryCollection();
const userIds: number[] = [];
const roomCodes: string[] = [];

const NOW = new Date("2026-10-29T12:00:00.000Z");
let clock = NOW.getTime();

/** Every call advances the fake clock so tokens are always ≥ 13 s old at submit. */
function tick(): { startedAt: Date; submitAt: Date } {
  clock += 60_000;
  return { startedAt: new Date(clock), submitAt: new Date(clock + 20_000) };
}

async function newUser(): Promise<number> {
  const userId = await createUser(sql, fixtures);
  userIds.push(userId);
  return userId;
}

async function newRoom(
  creator: number,
  options: Partial<{
    roomSize: number;
    timerSeconds: 5 | 10 | 15 | null;
    attemptsLimit: 3 | 5;
  }> = {},
): Promise<RoomState> {
  const state = await createRoom(creator, {
    roomSize: options.roomSize ?? 3,
    timerSeconds: options.timerSeconds ?? null,
    attemptsLimit: options.attemptsLimit ?? 3,
  });
  roomCodes.push(state.code);
  return state;
}

/** One full attempt: start (signs a token) then submit guesses equal to the targets. */
async function playAttempt(userId: number, code: string, offset = 0) {
  const { startedAt, submitAt } = tick();
  const game = await startGame(userId, { mode: "room", roomCode: code }, startedAt);
  const guesses = game.rounds.map((round) => ({
    h: (round.target.h + offset) % 360,
    s: round.target.s,
    v: round.target.v,
  }));
  const result = await submitGame(userId, { gameToken: game.gameToken, guesses }, submitAt);
  return { game, result };
}

async function startedRoom(size = 3, attemptsLimit: 3 | 5 = 3) {
  const alice = await newUser();
  const bob = await newUser();
  const carol = size >= 3 ? await newUser() : null;
  const created = await newRoom(alice, { roomSize: size, attemptsLimit });
  await joinRoom(bob, created.code);
  if (carol) await joinRoom(carol, created.code);
  await startRoom(alice, created.code);
  return { alice, bob, carol, code: created.code };
}

beforeAll(async () => {
  await initMongo(getMongoDb());
});

afterAll(async () => {
  try {
    await cleanupHistory(userIds);
    // Rooms cascade their players/colours; delete by code before the users.
    for (const code of roomCodes) {
      await sql`delete from rooms where room_code = ${code}`;
    }
    await cleanupFixtures(sql, fixtures);
  } finally {
    await Promise.allSettled([getMongoClient().close(), sql.end()]);
  }
});

describe("room lifecycle", () => {
  it("create → join → start → every player plays all attempts → room finishes", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const carol = await newUser();

    const created = await newRoom(alice, { roomSize: 3, attemptsLimit: 3 });
    expect(created.status).toBe("lobby");
    expect(created.me).toMatchObject({ isCreator: true, attemptsRemaining: 3, bestScore: null });
    expect(created.members).toHaveLength(1);
    expect(created.code).toMatch(/^[A-Z2-9]{8}$/);

    const joined = await joinRoom(bob, created.code.toLowerCase());
    expect(joined.me.isCreator).toBe(false);
    // Idempotent for an existing lobby member.
    const again = await joinRoom(bob, created.code);
    expect(again.members).toHaveLength(2);
    await joinRoom(carol, created.code);

    const started = await startRoom(alice, created.code);
    expect(started.status).toBe("in_progress");
    expect(started.startedAt).not.toBeNull();

    // Perfect for alice, a shifted hue for bob, a larger shift for carol.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const a = await playAttempt(alice, created.code, 0);
      expect(a.result.room?.attemptNumber).toBe(attempt);
      expect(a.result.totalGamesPlayed).toBeNull();
      expect(a.result.pb).toBeNull();
      await playAttempt(bob, created.code, 20);
      const c = await playAttempt(carol, created.code, 60);
      if (attempt === 3) {
        expect(c.result.room).toMatchObject({
          attemptsRemaining: 0,
          memberStatus: "finished",
          roomStatus: "finished",
        });
      }
    }

    const finished = await getRoomState(alice, created.code);
    expect(finished.status).toBe("finished");
    expect(finished.endedAt).not.toBeNull();
    expect(finished.me).toMatchObject({ status: "finished", attemptsRemaining: 0, bestScore: 30 });

    expect(finished.standings?.map((entry) => entry.username)).toHaveLength(3);
    expect(finished.standings?.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(finished.standings?.[0]?.userId).toBe(alice);
    expect(finished.standings?.[2]?.userId).toBe(carol);

    // Finished rooms cannot be played any more (409).
    await expect(playAttempt(alice, created.code)).rejects.toMatchObject({
      code: expect.stringMatching(/ROOM_NOT_IN_PROGRESS|MEMBER_NOT_ACTIVE/),
    });
  });

  it("enforces membership, creator-only start, lobby-only join and capacity", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const dave = await newUser();
    const erin = await newUser();

    const created = await newRoom(alice, { roomSize: 2 });

    await expect(getRoomState(dave, created.code)).rejects.toMatchObject({
      code: "NOT_ROOM_MEMBER",
    });
    await expect(getRoomState(dave, "ZZZZZZZZ")).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });

    // Not enough players, then non-creator.
    await expect(startRoom(alice, created.code)).rejects.toMatchObject({
      code: "NOT_ENOUGH_PLAYERS",
    });
    await joinRoom(bob, created.code);
    await expect(startRoom(bob, created.code)).rejects.toMatchObject({ code: "NOT_ROOM_CREATOR" });

    // Capacity.
    await expect(joinRoom(dave, created.code)).rejects.toMatchObject({ code: "ROOM_FULL" });

    await startRoom(alice, created.code);

    // Lobby only: late joiners are refused, non-members cannot start a game.
    await expect(joinRoom(erin, created.code)).rejects.toMatchObject({ code: "ROOM_NOT_LOBBY" });
    await expect(
      startGame(dave, { mode: "room", roomCode: created.code }, tick().startedAt),
    ).rejects.toMatchObject({ code: "NOT_ROOM_MEMBER" });
    await expect(startRoom(alice, created.code)).rejects.toMatchObject({ code: "ROOM_NOT_LOBBY" });
  });

  it("cannot start a game while the room is still in the lobby", async () => {
    const alice = await newUser();
    const created = await newRoom(alice, { roomSize: 2 });

    await expect(
      startGame(alice, { mode: "room", roomCode: created.code }, tick().startedAt),
    ).rejects.toMatchObject({ code: "ROOM_NOT_IN_PROGRESS" });
  });
});

describe("leaving", () => {
  it("non-creator leaving the lobby is removed (room null)", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const created = await newRoom(alice, { roomSize: 3 });
    await joinRoom(bob, created.code);

    await expect(leaveRoom(bob, created.code)).resolves.toEqual({
      outcome: "left_lobby",
      room: null,
    });

    const state = await getRoomState(alice, created.code);
    expect(state.members.map((member) => member.userId)).toEqual([alice]);
    await expect(getRoomState(bob, created.code)).rejects.toMatchObject({
      code: "NOT_ROOM_MEMBER",
    });
  });

  it("creator leaving the lobby cancels the room for everyone", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const created = await newRoom(alice, { roomSize: 3 });
    await joinRoom(bob, created.code);

    const result = await leaveRoom(alice, created.code);

    expect(result.outcome).toBe("room_cancelled");
    expect(result.room?.status).toBe("cancelled");
    expect((await getRoomState(bob, created.code)).status).toBe("cancelled");
  });

  it("leaving in progress forfeits the rest, keeps the best score and cannot rejoin", async () => {
    const { alice, bob, carol, code } = await startedRoom(3, 5);
    expect(carol).not.toBeNull();

    await playAttempt(bob, code, 0);
    const result = await leaveRoom(bob, code);

    expect(result.outcome).toBe("left_in_progress");
    expect(result.room?.me).toMatchObject({ status: "left", attemptsRemaining: 0, bestScore: 30 });

    await expect(
      startGame(bob, { mode: "room", roomCode: code }, tick().startedAt),
    ).rejects.toMatchObject({ code: "MEMBER_NOT_ACTIVE" });
    await expect(joinRoom(bob, code)).rejects.toMatchObject({ code: "ROOM_NOT_LOBBY" });

    // The score is kept on the scoreboard.
    const state = await getRoomState(alice, code);
    expect(state.standings?.find((entry) => entry.userId === bob)?.bestScore).toBe(30);
  });

  it("a room with a leaver still finishes once everyone else is done", async () => {
    const { alice, bob, code } = await startedRoom(2, 3);

    await leaveRoom(bob, code);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await playAttempt(alice, code);
    }

    expect((await getRoomState(alice, code)).status).toBe("finished");
  });
});

describe("attempt submission side effects", () => {
  it("exhausting attempts is a 409 and finishes the member", async () => {
    const { alice, code } = await startedRoom(2, 3);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await playAttempt(alice, code);
    }

    // The member becomes `finished` at the last attempt, so MEMBER_NOT_ACTIVE
    // is reported before ATTEMPTS_EXHAUSTED can be (both are 409).
    await expect(
      startGame(alice, { mode: "room", roomCode: code }, tick().startedAt),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/MEMBER_NOT_ACTIVE|ATTEMPTS_EXHAUSTED/),
    });
  });

  it("writes Postgres + a Mongo room document and leaves user stats untouched", async () => {
    const { alice, code } = await startedRoom(2, 3);
    const before = await readUserStats(sql, alice);

    const { startedAt, submitAt } = tick();
    const game = await startGame(alice, { mode: "room", roomCode: code }, startedAt);
    const guesses = game.rounds.map((round) => ({ ...round.target }));
    const result = await submitGame(
      alice,
      { gameToken: game.gameToken, guesses, timedOut: undefined },
      submitAt,
    );

    expect(result.room).toMatchObject({ attemptNumber: 1, bestScore: 30, isNewBest: true });
    expect(result.rounds.every((round) => round.timedOut === false)).toBe(true);

    const rows = await sql<{ attempts_used: number; best_score: string }[]>`
      select rp.attempts_used, rp.best_score
      from room_players rp join rooms r on r.room_id = rp.room_id
      where r.room_code = ${code} and rp.user_id = ${alice}
    `;
    expect(Number(rows[0]?.attempts_used)).toBe(1);
    expect(Number(rows[0]?.best_score)).toBe(30);

    const documents = await collection
      .find({ user_id: Long.fromNumber(alice), mode: "room" })
      .toArray();
    expect(documents).toHaveLength(1);
    const document = documents[0]!;
    expect(Number(document.attempt_number)).toBe(1);
    expect(document.played_at.toISOString()).toBe(submitAt.toISOString());
    expect(document).not.toHaveProperty("daily_challenge_id");
    const rounds = document.rounds as Array<Record<string, unknown>>;
    expect(rounds.map((round) => Number(round.color_number)).sort()).toEqual([1, 2, 3]);
    expect(rounds.map((round) => round.timed_out)).toEqual([false, false, false]);

    // Regression: room games never touch profile stats, PBs, streaks or achievements.
    const after = await readUserStats(sql, alice);
    expect(after).toEqual(before);
    const achievements = await sql<{ n: string }[]>`
      select count(*)::text as n from user_achievements where user_id = ${alice}
    `;
    expect(Number(achievements[0]?.n)).toBe(0);
    const dailyBests = await sql<{ n: string }[]>`
      select count(*)::text as n from daily_personal_bests where user_id = ${alice}
    `;
    expect(Number(dailyBests[0]?.n)).toBe(0);
  });

  it("stores timed_out flags for a timed room", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const created = await newRoom(alice, { roomSize: 2, timerSeconds: 5 });
    await joinRoom(bob, created.code);
    await startRoom(alice, created.code);

    const { startedAt, submitAt } = tick();
    const game = await startGame(alice, { mode: "room", roomCode: created.code }, startedAt);
    expect(game.timerSeconds).toBe(5);
    const guesses = game.rounds.map((round) => ({ ...round.target }));

    await submitGame(
      alice,
      { gameToken: game.gameToken, guesses, timedOut: [false, true, false] },
      submitAt,
    );

    const document = await collection.findOne({ user_id: Long.fromNumber(alice), mode: "room" });
    const rounds = document?.rounds as Array<Record<string, unknown>>;
    expect(rounds.map((round) => round.timed_out)).toEqual([false, true, false]);
  });
});

describe("scoreboard", () => {
  it("shows a banned player and ranks by best score", async () => {
    const { alice, bob, code } = await startedRoom(2, 3);
    await banUser(sql, bob);

    await playAttempt(alice, code, 40);
    await playAttempt(bob, code, 0);

    const state = await getRoomState(alice, code);
    expect(state.standings?.map((entry) => entry.userId)).toEqual([bob, alice]);
    expect(state.standings?.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(state.standings?.[0]?.bestScore).toBe(30);
  });

  it("members without a score are unranked and listed last", async () => {
    const { alice, bob, code } = await startedRoom(2, 3);

    await playAttempt(bob, code, 0);

    const state = await getRoomState(alice, code);
    expect(state.standings?.map((entry) => entry.userId)).toEqual([bob, alice]);
    expect(state.standings?.map((entry) => entry.rank)).toEqual([1, null]);
  });
});

describe("concurrency", () => {
  it("two concurrent final submissions end with exactly one finished room", async () => {
    const { alice, bob, code } = await startedRoom(2, 3);

    // Both players take their first two attempts, then submit the last one at once.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await playAttempt(alice, code);
      await playAttempt(bob, code);
    }

    const { startedAt, submitAt } = tick();
    const [aliceGame, bobGame] = await Promise.all([
      startGame(alice, { mode: "room", roomCode: code }, startedAt),
      startGame(bob, { mode: "room", roomCode: code }, startedAt),
    ]);
    const perfect = (game: typeof aliceGame) => game.rounds.map((round) => ({ ...round.target }));

    const results = await Promise.all([
      submitGame(alice, { gameToken: aliceGame.gameToken, guesses: perfect(aliceGame) }, submitAt),
      submitGame(bob, { gameToken: bobGame.gameToken, guesses: perfect(bobGame) }, submitAt),
    ]);

    expect(results.map((result) => result.room?.attemptNumber)).toEqual([3, 3]);
    expect(results.map((result) => result.room?.memberStatus)).toEqual(["finished", "finished"]);

    const state = await getRoomState(alice, code);
    expect(state.status).toBe("finished");
    expect(state.endedAt).not.toBeNull();
    // The room row is finished exactly once.
    const rooms = await sql<{ status: string }[]>`
      select status from rooms where room_code = ${code}
    `;
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.status).toBe("finished");
  });
});
