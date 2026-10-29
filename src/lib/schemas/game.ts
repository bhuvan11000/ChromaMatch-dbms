import { z } from "zod";

import {
  HUE_MAX,
  HUE_MIN,
  MAX_GAME_SCORE,
  MAX_ROUND_SCORE,
  REVEAL_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROUNDS_PER_GAME,
  SAT_MAX,
  SAT_MIN,
  VAL_MAX,
  VAL_MIN,
} from "@/lib/config/constants";

/**
 * Game request/response schemas — Architecture §5.10.4.
 *
 * Request schemas are strict: unknown keys are rejected, so a client cannot
 * smuggle targets, scores or color numbers into a submission. The only game
 * input is the signed token plus the player's guesses.
 */

export const GAME_MODES = ["global", "daily", "room"] as const;

export const gameModeSchema = z.enum(GAME_MODES);

export type GameMode = z.infer<typeof gameModeSchema>;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** A display colour; ranges are the HSV bounds from Architecture §5.3.1. */
export const hsvSchema = z
  .object({
    h: z.number().finite().min(HUE_MIN).max(HUE_MAX),
    s: z.number().finite().min(SAT_MIN).max(SAT_MAX),
    v: z.number().finite().min(VAL_MIN).max(VAL_MAX),
  })
  .strict();

export type HsvInput = z.infer<typeof hsvSchema>;

const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(ROOM_CODE_PATTERN, "Room codes are 8 characters from the room alphabet."));

export const gameStartRequestSchema = z
  .object({
    mode: gameModeSchema,
    roomCode: roomCodeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "room" && value.roomCode === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["roomCode"],
        message: "roomCode is required when mode is room.",
      });
    }

    if (value.mode !== "room" && value.roomCode !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["roomCode"],
        message: "roomCode is only allowed when mode is room.",
      });
    }
  });

export type GameStartRequest = z.infer<typeof gameStartRequestSchema>;

export const gameStartRoundSchema = z
  .object({
    roundNumber: z.number().int().min(1).max(ROUNDS_PER_GAME),
    target: hsvSchema,
  })
  .strict();

export const gameStartResponseSchema = z
  .object({
    gameToken: z.string().min(1),
    mode: gameModeSchema,
    revealMs: z.literal(REVEAL_MS),
    timerSeconds: z.union([z.literal(5), z.literal(10), z.literal(15)]).nullable(),
    expiresAt: z.iso.datetime(),
    challengeDate: z.iso.date().nullable(),
    roomCode: z.string().nullable(),
    rounds: z.array(gameStartRoundSchema).length(ROUNDS_PER_GAME),
  })
  .strict();

export type GameStartResponse = z.infer<typeof gameStartResponseSchema>;

export const gameSubmitRequestSchema = z
  .object({
    gameToken: z.string().min(1),
    guesses: z.array(hsvSchema).length(ROUNDS_PER_GAME),
    timedOut: z.array(z.boolean()).length(ROUNDS_PER_GAME).optional(),
  })
  .strict();

export type GameSubmitRequest = z.infer<typeof gameSubmitRequestSchema>;

export const roundDiffSchema = z
  .object({
    h: z.number().finite().min(0).max(180),
    s: z.number().finite().min(0).max(100),
    v: z.number().finite().min(0).max(100),
  })
  .strict();

export const gameSubmitRoundSchema = z
  .object({
    roundNumber: z.number().int().min(1).max(ROUNDS_PER_GAME),
    target: hsvSchema,
    guess: hsvSchema,
    score: z.number().finite().min(0).max(MAX_ROUND_SCORE),
    diff: roundDiffSchema,
    timedOut: z.boolean().optional(),
  })
  .strict();

export const gamePbSchema = z
  .object({
    scope: z.enum(["global", "daily"]),
    previous: z.number().finite().min(0).max(MAX_GAME_SCORE).nullable(),
    current: z.number().finite().min(0).max(MAX_GAME_SCORE),
    updated: z.boolean(),
    beatExisting: z.boolean(),
  })
  .strict();

export const gameStreakSchema = z
  .object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
  })
  .strict();

export const gameAchievementSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    description: z.string(),
  })
  .strict();

export const gameRoomResultSchema = z
  .object({
    attemptNumber: z.number().int().positive(),
    bestScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
    isNewBest: z.boolean(),
    attemptsRemaining: z.number().int().nonnegative(),
    memberStatus: z.enum(["active", "finished", "left"]),
    roomStatus: z.enum(["lobby", "in_progress", "finished", "cancelled"]),
  })
  .strict();

export const gameSubmitResponseSchema = z
  .object({
    mode: gameModeSchema,
    totalScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
    rounds: z.array(gameSubmitRoundSchema).length(ROUNDS_PER_GAME),
    totalGamesPlayed: z.number().int().nonnegative().nullable(),
    pb: gamePbSchema.nullable(),
    streak: gameStreakSchema.nullable().optional(),
    achievements: z.array(gameAchievementSchema),
    room: gameRoomResultSchema.nullable(),
  })
  .strict();

export type GameSubmitResponse = z.infer<typeof gameSubmitResponseSchema>;
