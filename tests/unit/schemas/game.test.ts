import { describe, expect, it } from "vitest";

import {
  gameStartRequestSchema,
  gameStartResponseSchema,
  gameSubmitRequestSchema,
  gameSubmitResponseSchema,
} from "@/lib/schemas/game";

import {
  EXPECTED_ROUND_SCORES,
  EXPECTED_TOTAL,
  FIXED_GUESSES,
  FIXED_TARGETS,
} from "../support/game";

const VALID_SUBMIT = {
  gameToken: "signed-token",
  guesses: FIXED_GUESSES,
};

const VALID_START_RESPONSE = {
  gameToken: "signed-token",
  mode: "global",
  revealMs: 5000,
  timerSeconds: null,
  expiresAt: "2026-10-29T14:00:00.000Z",
  challengeDate: null,
  roomCode: null,
  rounds: FIXED_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target,
  })),
};

const VALID_SUBMIT_RESPONSE = {
  mode: "global",
  totalScore: EXPECTED_TOTAL,
  rounds: FIXED_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target,
    guess: FIXED_GUESSES[index],
    score: EXPECTED_ROUND_SCORES[index],
    diff: { h: 5.6, s: 3.5, v: 3.5 },
  })),
  totalGamesPlayed: 1,
  pb: {
    scope: "global",
    previous: null,
    current: EXPECTED_TOTAL,
    updated: true,
    beatExisting: false,
  },
  streak: null,
  achievements: [],
  room: null,
};

describe("game start schema", () => {
  it.each([{ mode: "global" }, { mode: "daily" }, { mode: "room", roomCode: "abcd2345" }])(
    "accepts %j",
    (body) => {
      const result = gameStartRequestSchema.safeParse(body);
      expect(result.success).toBe(true);
    },
  );

  it("normalizes a room code to upper case", () => {
    const result = gameStartRequestSchema.parse({ mode: "room", roomCode: " abcd2345 " });
    expect(result.roomCode).toBe("ABCD2345");
  });

  it.each([
    ["room without a code", { mode: "room" }],
    ["global with a code", { mode: "global", roomCode: "ABCD2345" }],
    ["unknown key", { mode: "global", targets: [] }],
    ["unknown mode", { mode: "timed" }],
    ["short room code", { mode: "room", roomCode: "ABCD" }],
    ["look-alike room code", { mode: "room", roomCode: "ABCD1234" }],
  ])("rejects %s", (_label, body) => {
    expect(gameStartRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("game submit request schema", () => {
  it("accepts exactly 3 guesses with optional timedOut flags", () => {
    expect(gameSubmitRequestSchema.safeParse(VALID_SUBMIT).success).toBe(true);
    expect(
      gameSubmitRequestSchema.safeParse({
        ...VALID_SUBMIT,
        timedOut: [false, true, false],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["two guesses", { ...VALID_SUBMIT, guesses: FIXED_GUESSES.slice(0, 2) }],
    ["four guesses", { ...VALID_SUBMIT, guesses: [...FIXED_GUESSES, FIXED_GUESSES[0]] }],
    [
      "an out-of-range hue",
      { ...VALID_SUBMIT, guesses: [{ ...FIXED_GUESSES[0], h: 361 }, ...FIXED_GUESSES.slice(1)] },
    ],
    [
      "an out-of-range saturation",
      { ...VALID_SUBMIT, guesses: [{ ...FIXED_GUESSES[0], s: -1 }, ...FIXED_GUESSES.slice(1)] },
    ],
    [
      "an out-of-range value",
      { ...VALID_SUBMIT, guesses: [{ ...FIXED_GUESSES[0], v: 101 }, ...FIXED_GUESSES.slice(1)] },
    ],
    ["a client-supplied target", { ...VALID_SUBMIT, targets: FIXED_TARGETS }],
    ["a client-supplied score", { ...VALID_SUBMIT, totalScore: 30 }],
    [
      "a guess with an unknown key",
      { ...VALID_SUBMIT, guesses: [{ ...FIXED_GUESSES[0], n: 1 }, ...FIXED_GUESSES.slice(1)] },
    ],
    ["two timedOut flags", { ...VALID_SUBMIT, timedOut: [false, true] }],
    ["a non-boolean timedOut flag", { ...VALID_SUBMIT, timedOut: [false, 1, false] }],
  ])("rejects %s", (_label, body) => {
    expect(gameSubmitRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("game response schemas", () => {
  it("accepts the Global start response shape", () => {
    expect(gameStartResponseSchema.safeParse(VALID_START_RESPONSE).success).toBe(true);
  });

  it("rejects unknown keys in the start response", () => {
    expect(
      gameStartResponseSchema.safeParse({ ...VALID_START_RESPONSE, extra: true }).success,
    ).toBe(false);
  });

  it("accepts the Global submit response shape", () => {
    expect(gameSubmitResponseSchema.safeParse(VALID_SUBMIT_RESPONSE).success).toBe(true);
  });

  it("rejects a submit response with an unknown key", () => {
    expect(
      gameSubmitResponseSchema.safeParse({ ...VALID_SUBMIT_RESPONSE, extra: true }).success,
    ).toBe(false);
  });
});
