import { z } from "zod";

import {
  MAX_GAME_SCORE,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_MAX_SIZE,
  ROOM_MIN_SIZE,
} from "@/lib/config/constants";

/**
 * Room request/response schemas — Architecture §5.10.6.
 *
 * Requests are strict. The same schemas validate the browser forms, the route
 * bodies and (for responses) the client's parsing of the API envelope.
 */

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Trims, upper-cases, then requires 8 characters from the room alphabet. */
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .regex(ROOM_CODE_PATTERN, `Room codes are ${ROOM_CODE_LENGTH} characters from the room alphabet.`),
  );

export const roomTimerSchema = z.union([z.literal(5), z.literal(10), z.literal(15)]).nullable();

export const createRoomRequestSchema = z
  .object({
    roomSize: z
      .number()
      .int()
      .min(ROOM_MIN_SIZE, `A room needs at least ${ROOM_MIN_SIZE} players.`)
      .max(ROOM_MAX_SIZE, `A room holds at most ${ROOM_MAX_SIZE} players.`),
    timerSeconds: roomTimerSchema,
    attemptsLimit: z.union([z.literal(3), z.literal(5)]),
  })
  .strict();

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

export const joinRoomRequestSchema = z.object({ code: roomCodeSchema }).strict();

export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

export const roomStatusSchema = z.enum(["lobby", "in_progress", "finished", "cancelled"]);
export const roomMemberStatusSchema = z.enum(["active", "finished", "left"]);

const scoreSchema = z.number().finite().min(0).max(MAX_GAME_SCORE);

export const roomMeSchema = z
  .object({
    userId: z.number().int().positive(),
    isCreator: z.boolean(),
    status: roomMemberStatusSchema,
    attemptsUsed: z.number().int().nonnegative(),
    attemptsRemaining: z.number().int().nonnegative(),
    bestScore: scoreSchema.nullable(),
  })
  .strict();

export const roomMemberSchema = z
  .object({
    userId: z.number().int().positive(),
    username: z.string(),
    isCreator: z.boolean(),
    status: roomMemberStatusSchema,
    attemptsUsed: z.number().int().nonnegative(),
    bestScore: scoreSchema.nullable(),
    joinedAt: z.iso.datetime(),
  })
  .strict();

export const roomStandingSchema = z
  .object({
    rank: z.number().int().positive().nullable(),
    userId: z.number().int().positive(),
    username: z.string(),
    bestScore: scoreSchema.nullable(),
  })
  .strict();

export const roomStateResponseSchema = z
  .object({
    code: z.string(),
    status: roomStatusSchema,
    roomSize: z.number().int().positive(),
    timerSeconds: roomTimerSchema,
    attemptsLimit: z.union([z.literal(3), z.literal(5)]),
    creatorId: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    me: roomMeSchema,
    members: z.array(roomMemberSchema),
    standings: z.array(roomStandingSchema).nullable(),
  })
  .strict();

export type RoomState = z.infer<typeof roomStateResponseSchema>;
export type RoomMember = z.infer<typeof roomMemberSchema>;
export type RoomStanding = z.infer<typeof roomStandingSchema>;

export const ROOM_LEAVE_OUTCOMES = [
  "left_lobby",
  "room_cancelled",
  "left_in_progress",
  "noop",
] as const;

export const leaveRoomResponseSchema = z
  .object({
    outcome: z.enum(ROOM_LEAVE_OUTCOMES),
    room: roomStateResponseSchema.nullable(),
  })
  .strict();

export type LeaveRoomResponse = z.infer<typeof leaveRoomResponseSchema>;
