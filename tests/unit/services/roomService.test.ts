import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RoomCodeConflictError extends Error {}
  return {
    RoomCodeConflictError,
    createRoomRow: vi.fn(),
    joinRoomRow: vi.fn(),
    startRoomRow: vi.fn(),
    leaveRoomRow: vi.fn(),
    findRoomByCode: vi.fn(),
    findRoomMember: vi.fn(),
    listRoomMembers: vi.fn(),
    listRoomScoreboard: vi.fn(),
  };
});

vi.mock("@/lib/db/pg/functions", () => ({
  RoomCodeConflictError: mocks.RoomCodeConflictError,
  createRoom: mocks.createRoomRow,
  joinRoom: mocks.joinRoomRow,
  startRoom: mocks.startRoomRow,
  leaveRoom: mocks.leaveRoomRow,
}));

vi.mock("@/lib/db/pg/queries/rooms", () => ({
  findRoomByCode: mocks.findRoomByCode,
  findRoomMember: mocks.findRoomMember,
  listRoomMembers: mocks.listRoomMembers,
  listRoomScoreboard: mocks.listRoomScoreboard,
}));

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@/lib/config/constants";
import { logger } from "@/lib/logger";
import { roomStateResponseSchema } from "@/lib/schemas/rooms";
import {
  ROOM_CODE_MAX_ATTEMPTS,
  createRoom,
  generateRoomCode,
  getRoomState,
  joinRoom,
  leaveRoom,
  normalizeRoomCode,
  startRoom,
} from "@/lib/services/roomService";

const CREATED = new Date("2026-10-29T12:00:00.000Z");
const STARTED = new Date("2026-10-29T12:05:00.000Z");

function room(overrides: Record<string, unknown> = {}) {
  return {
    roomId: 11,
    code: "ABCD2345",
    creatorId: 42,
    roomSize: 6,
    timerSeconds: 10,
    attemptsLimit: 3,
    status: "lobby",
    createdAt: CREATED,
    startedAt: null,
    endedAt: null,
    ...overrides,
  };
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    attemptsUsed: 0,
    bestScore: null,
    joinedAt: CREATED,
    ...overrides,
  };
}

const MEMBERS = [
  { userId: 42, username: "alice", ...member() },
  { userId: 7, username: "bob", ...member({ attemptsUsed: 1, bestScore: 24, joinedAt: STARTED }) },
];

const SCOREBOARD = [
  {
    roomId: 11,
    rank: 1,
    userId: 7,
    username: "bob",
    memberStatus: "active",
    attemptsUsed: 1,
    bestScore: 24,
    bestAchievedAt: STARTED,
  },
  {
    roomId: 11,
    rank: null,
    userId: 42,
    username: "alice",
    memberStatus: "active",
    attemptsUsed: 0,
    bestScore: null,
    bestAchievedAt: null,
  },
];

function stubReads(roomOverrides = {}, memberOverrides = {}) {
  mocks.findRoomByCode.mockResolvedValue(room(roomOverrides));
  mocks.findRoomMember.mockResolvedValue(member(memberOverrides));
  mocks.listRoomMembers.mockResolvedValue(MEMBERS);
  mocks.listRoomScoreboard.mockResolvedValue(SCOREBOARD);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
  }
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
});

describe("code helpers", () => {
  it("normalizes codes with trim + upper-case", () => {
    expect(normalizeRoomCode("  abcd2345\n")).toBe("ABCD2345");
  });

  it("generates 8-character codes from the room alphabet", () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const char of code) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
    }
  });
});

describe("createRoom", () => {
  const INPUT = { roomSize: 6, timerSeconds: 10, attemptsLimit: 3 } as const;

  it("creates the room with a generated code and returns its state", async () => {
    mocks.createRoomRow.mockResolvedValue({ room_id: 11, room_code: "X" });
    stubReads();

    const state = await createRoom(42, INPUT);

    expect(mocks.createRoomRow).toHaveBeenCalledTimes(1);
    const call = mocks.createRoomRow.mock.calls[0]?.[0];
    expect(call).toMatchObject({ creatorId: 42, roomSize: 6, timerSeconds: 10, attemptsLimit: 3 });
    expect(call.roomCode).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{8}$`));
    // State is read back with the same code that was inserted.
    expect(mocks.findRoomByCode).toHaveBeenCalledWith(call.roomCode);
    expect(state.me.isCreator).toBe(true);
  });

  it("retries on code conflicts and succeeds (conflict twice, then success)", async () => {
    mocks.createRoomRow
      .mockRejectedValueOnce(new mocks.RoomCodeConflictError())
      .mockRejectedValueOnce(new mocks.RoomCodeConflictError())
      .mockResolvedValueOnce({ room_id: 11, room_code: "X" });
    stubReads();

    await createRoom(42, INPUT);

    expect(mocks.createRoomRow).toHaveBeenCalledTimes(3);
  });

  it("fails with INTERNAL_ERROR after 5 conflicting attempts", async () => {
    mocks.createRoomRow.mockRejectedValue(new mocks.RoomCodeConflictError());

    await expect(createRoom(42, INPUT)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });

    expect(mocks.createRoomRow).toHaveBeenCalledTimes(ROOM_CODE_MAX_ATTEMPTS);
    expect(ROOM_CODE_MAX_ATTEMPTS).toBe(5);
    expect(mocks.findRoomByCode).not.toHaveBeenCalled();
  });

  it("does not retry other errors", async () => {
    mocks.createRoomRow.mockRejectedValue(new Error("boom"));

    await expect(createRoom(42, INPUT)).rejects.toThrow("boom");
    expect(mocks.createRoomRow).toHaveBeenCalledTimes(1);
  });

  it("validates options before touching the database (defense in depth)", async () => {
    const bad = [
      { ...INPUT, roomSize: 1 },
      { ...INPUT, roomSize: 11 },
      { ...INPUT, roomSize: 2.5 },
      { ...INPUT, timerSeconds: 7 },
      { ...INPUT, attemptsLimit: 4 },
    ] as unknown as Array<Parameters<typeof createRoom>[1]>;

    for (const input of bad) {
      await expect(createRoom(42, input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(mocks.createRoomRow).not.toHaveBeenCalled();
  });
});

describe("getRoomState", () => {
  it("maps and serializes the full §5.10.6 RoomState", async () => {
    stubReads({ status: "in_progress", startedAt: STARTED });

    const state = await getRoomState(42, " abcd2345 ");

    expect(mocks.findRoomByCode).toHaveBeenCalledWith("ABCD2345");
    expect(state).toEqual({
      code: "ABCD2345",
      status: "in_progress",
      roomSize: 6,
      timerSeconds: 10,
      attemptsLimit: 3,
      creatorId: 42,
      createdAt: CREATED.toISOString(),
      startedAt: STARTED.toISOString(),
      endedAt: null,
      me: {
        userId: 42,
        isCreator: true,
        status: "active",
        attemptsUsed: 0,
        attemptsRemaining: 3,
        bestScore: null,
      },
      members: [
        {
          userId: 42,
          username: "alice",
          isCreator: true,
          status: "active",
          attemptsUsed: 0,
          bestScore: null,
          joinedAt: CREATED.toISOString(),
        },
        {
          userId: 7,
          username: "bob",
          isCreator: false,
          status: "active",
          attemptsUsed: 1,
          bestScore: 24,
          joinedAt: STARTED.toISOString(),
        },
      ],
      standings: [
        { rank: 1, userId: 7, username: "bob", bestScore: 24 },
        { rank: null, userId: 42, username: "alice", bestScore: null },
      ],
    });
    expect(roomStateResponseSchema.safeParse(state).success).toBe(true);
  });

  it("standings contain only rank/userId/username/bestScore", async () => {
    stubReads({ status: "in_progress" });

    const state = await getRoomState(42, "ABCD2345");

    for (const standing of state.standings ?? []) {
      expect(Object.keys(standing).sort()).toEqual(["bestScore", "rank", "userId", "username"]);
    }
  });

  it("gives a non-creator isCreator=false", async () => {
    stubReads({ creatorId: 42 }, {});

    const state = await getRoomState(7, "ABCD2345");

    expect(state.me.isCreator).toBe(false);
    expect(state.me.userId).toBe(7);
  });

  it("computes attemptsRemaining for active, left and finished members", async () => {
    stubReads({ status: "in_progress" }, { status: "active", attemptsUsed: 2 });
    expect((await getRoomState(42, "ABCD2345")).me.attemptsRemaining).toBe(1);

    stubReads({ status: "in_progress" }, { status: "active", attemptsUsed: 9 });
    expect((await getRoomState(42, "ABCD2345")).me.attemptsRemaining).toBe(0);

    stubReads({ status: "in_progress" }, { status: "left", attemptsUsed: 1 });
    expect((await getRoomState(42, "ABCD2345")).me.attemptsRemaining).toBe(0);

    stubReads({ status: "finished" }, { status: "finished", attemptsUsed: 1 });
    expect((await getRoomState(42, "ABCD2345")).me.attemptsRemaining).toBe(0);
  });

  it("throws ROOM_NOT_FOUND and NOT_ROOM_MEMBER", async () => {
    mocks.findRoomByCode.mockResolvedValue(null);
    await expect(getRoomState(42, "ABCD2345")).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });

    mocks.findRoomByCode.mockResolvedValue(room());
    mocks.findRoomMember.mockResolvedValue(null);
    await expect(getRoomState(99, "ABCD2345")).rejects.toMatchObject({ code: "NOT_ROOM_MEMBER" });
    expect(mocks.listRoomMembers).not.toHaveBeenCalled();
  });

  it("returns null standings while in progress when live standings are hidden", async () => {
    vi.resetModules();
    vi.doMock("@/lib/config/constants", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/config/constants")>()),
      SHOW_LIVE_STANDINGS: false,
    }));
    const hidden = await import("@/lib/services/roomService");
    vi.doUnmock("@/lib/config/constants");

    stubReads({ status: "in_progress" });
    const inProgress = await hidden.getRoomState(42, "ABCD2345");
    expect(inProgress.standings).toBeNull();
    expect(mocks.listRoomScoreboard).not.toHaveBeenCalled();

    // Finished rooms always show the final standings.
    stubReads({ status: "finished" });
    const finished = await hidden.getRoomState(42, "ABCD2345");
    expect(finished.standings).toHaveLength(2);
  });
});

describe("joinRoom / startRoom", () => {
  it("joins with a normalized code and returns state", async () => {
    mocks.joinRoomRow.mockResolvedValue({ room_id: 11, outcome: "joined" });
    stubReads();

    const state = await joinRoom(7, "  abcd2345 ");

    expect(mocks.joinRoomRow).toHaveBeenCalledWith({ userId: 7, roomCode: "ABCD2345" });
    expect(state.code).toBe("ABCD2345");
  });

  it("starts with 3 valid crypto colours, one SQL call, then returns state", async () => {
    mocks.startRoomRow.mockResolvedValue({ room_id: 11, started_at: STARTED.toISOString() });
    stubReads({ status: "in_progress" });

    await startRoom(42, "abcd2345");

    expect(mocks.startRoomRow).toHaveBeenCalledTimes(1);
    const call = mocks.startRoomRow.mock.calls[0]?.[0];
    expect(call.userId).toBe(42);
    expect(call.roomCode).toBe("ABCD2345");
    expect(call.colors).toHaveLength(3);
    for (const color of call.colors) {
      expect(color.h).toBeGreaterThanOrEqual(0);
      expect(color.h).toBeLessThan(360);
      expect(color.s).toBeLessThanOrEqual(100);
      expect(color.v).toBeLessThanOrEqual(100);
    }
  });

  it("propagates SQL domain errors without reading state", async () => {
    const { AppError } = await import("@/lib/errors");
    mocks.startRoomRow.mockRejectedValue(new AppError("NOT_ROOM_CREATOR"));

    await expect(startRoom(7, "ABCD2345")).rejects.toMatchObject({ code: "NOT_ROOM_CREATOR" });
    expect(mocks.findRoomByCode).not.toHaveBeenCalled();
  });
});

describe("leaveRoom", () => {
  it("returns room null for left_lobby and does not read state", async () => {
    mocks.leaveRoomRow.mockResolvedValue({ outcome: "left_lobby", room_status: "lobby" });

    await expect(leaveRoom(7, "ABCD2345")).resolves.toEqual({ outcome: "left_lobby", room: null });
    expect(mocks.findRoomByCode).not.toHaveBeenCalled();
  });

  it("returns the current state for the other outcomes", async () => {
    for (const outcome of ["room_cancelled", "left_in_progress", "noop"] as const) {
      mocks.leaveRoomRow.mockResolvedValue({ outcome, room_status: "in_progress" });
      stubReads({ status: outcome === "room_cancelled" ? "cancelled" : "in_progress" });

      const result = await leaveRoom(42, " abcd2345");

      expect(result.outcome).toBe(outcome);
      expect(result.room?.code).toBe("ABCD2345");
    }
    expect(mocks.leaveRoomRow).toHaveBeenLastCalledWith({ userId: 42, roomCode: "ABCD2345" });
  });
});
