import { describe, expect, it } from "vitest";

import { ROOM_CODE_ALPHABET } from "@/lib/config/constants";
import {
  createRoomRequestSchema,
  joinRoomRequestSchema,
  leaveRoomResponseSchema,
  roomCodeSchema,
  roomStateResponseSchema,
} from "@/lib/schemas/rooms";

const VALID_CREATE = { roomSize: 4, timerSeconds: 10, attemptsLimit: 3 } as const;

const STATE = {
  code: "ABCD2345",
  status: "lobby",
  roomSize: 6,
  timerSeconds: 10,
  attemptsLimit: 3,
  creatorId: 42,
  createdAt: "2026-10-29T12:00:00.000Z",
  startedAt: null,
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
      joinedAt: "2026-10-29T12:00:00.000Z",
    },
  ],
  standings: [{ rank: null, userId: 42, username: "alice", bestScore: null }],
} as const;

describe("createRoomRequestSchema", () => {
  it("accepts every documented option", () => {
    for (const roomSize of [2, 5, 10]) {
      for (const timerSeconds of [null, 5, 10, 15]) {
        for (const attemptsLimit of [3, 5]) {
          expect(
            createRoomRequestSchema.safeParse({ roomSize, timerSeconds, attemptsLimit }).success,
          ).toBe(true);
        }
      }
    }
  });

  it("rejects out-of-range or unknown options", () => {
    const bad: Array<Record<string, unknown>> = [
      { ...VALID_CREATE, roomSize: 1 },
      { ...VALID_CREATE, roomSize: 11 },
      { ...VALID_CREATE, roomSize: 2.5 },
      { ...VALID_CREATE, timerSeconds: 7 },
      { ...VALID_CREATE, timerSeconds: 0 },
      { ...VALID_CREATE, attemptsLimit: 4 },
      { ...VALID_CREATE, attemptsLimit: 1 },
      { roomSize: 4, attemptsLimit: 3 },
      { roomSize: 4, timerSeconds: 10 },
    ];

    for (const body of bad) {
      expect(createRoomRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it("rejects unknown keys", () => {
    expect(createRoomRequestSchema.safeParse({ ...VALID_CREATE, creatorId: 1 }).success).toBe(
      false,
    );
  });
});

describe("room codes", () => {
  it("trims and upper-cases valid codes", () => {
    expect(roomCodeSchema.parse("  abcd2345 ")).toBe("ABCD2345");
    expect(joinRoomRequestSchema.parse({ code: "abcd2345" })).toEqual({ code: "ABCD2345" });
  });

  it("rejects wrong length and characters outside the alphabet", () => {
    for (const code of [
      "",
      "ABCD234",
      "ABCD23456",
      "ABCD234O",
      "ABCD2341",
      "ABCD 234",
      "ABCD-234",
    ]) {
      expect(roomCodeSchema.safeParse(code).success).toBe(false);
    }
    expect(ROOM_CODE_ALPHABET).not.toContain("O");
  });

  it("rejects unknown keys on join", () => {
    expect(joinRoomRequestSchema.safeParse({ code: "ABCD2345", extra: 1 }).success).toBe(false);
  });
});

describe("roomStateResponseSchema", () => {
  it("accepts the §5.10.6 shape, including null standings", () => {
    expect(roomStateResponseSchema.safeParse(STATE).success).toBe(true);
    expect(roomStateResponseSchema.safeParse({ ...STATE, standings: null }).success).toBe(true);
  });

  it("rejects unknown keys and invalid statuses", () => {
    expect(roomStateResponseSchema.safeParse({ ...STATE, extra: 1 }).success).toBe(false);
    expect(roomStateResponseSchema.safeParse({ ...STATE, status: "open" }).success).toBe(false);
    expect(roomStateResponseSchema.safeParse({ ...STATE, createdAt: "yesterday" }).success).toBe(
      false,
    );
    expect(
      roomStateResponseSchema.safeParse({ ...STATE, me: { ...STATE.me, extra: true } }).success,
    ).toBe(false);
  });

  it("does not allow standings to leak member status or attempts", () => {
    const leaky = {
      ...STATE,
      standings: [{ rank: 1, userId: 1, username: "a", bestScore: 3, attemptsUsed: 2 }],
    };
    expect(roomStateResponseSchema.safeParse(leaky).success).toBe(false);
  });
});

describe("leaveRoomResponseSchema", () => {
  it("accepts every outcome with a state or null room", () => {
    for (const outcome of ["left_lobby", "room_cancelled", "left_in_progress", "noop"]) {
      expect(leaveRoomResponseSchema.safeParse({ outcome, room: null }).success).toBe(true);
      expect(leaveRoomResponseSchema.safeParse({ outcome, room: STATE }).success).toBe(true);
    }
  });

  it("rejects unknown outcomes", () => {
    expect(leaveRoomResponseSchema.safeParse({ outcome: "kicked", room: null }).success).toBe(
      false,
    );
  });
});
