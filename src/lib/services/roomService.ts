import { randomInt } from "node:crypto";

import {
  ROOM_ATTEMPT_OPTIONS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_MAX_SIZE,
  ROOM_MIN_SIZE,
  ROOM_TIMER_OPTIONS,
  ROUNDS_PER_GAME,
  SHOW_LIVE_STANDINGS,
} from "@/lib/config/constants";
import {
  RoomCodeConflictError,
  createRoom as createRoomRow,
  joinRoom as joinRoomRow,
  leaveRoom as leaveRoomRow,
  startRoom as startRoomRow,
} from "@/lib/db/pg/functions";
import {
  findRoomByCode,
  findRoomMember,
  listRoomMembers,
  listRoomScoreboard,
} from "@/lib/db/pg/queries/rooms";
import { generateRandomColors } from "@/lib/domain/colors";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { CreateRoomRequest, LeaveRoomResponse, RoomState } from "@/lib/schemas/rooms";

/**
 * Room use-cases — Architecture §5.7.4.
 *
 * Plain arguments and results, `AppError` only. Every state change calls
 * exactly one SQL function; `getRoomState` only reads. Attempt submission is
 * not here: it goes through `gameService.submitGame` (mode `room`).
 */

/** Total attempts (first try + retries) to find an unused room code. */
export const ROOM_CODE_MAX_ATTEMPTS = 5;

/** Room codes are matched exactly by SQL, so every entry point normalizes (U-016). */
export function normalizeRoomCode(code: string): string {
  return String(code).trim().toUpperCase();
}

/** 8 characters from the room alphabet, one `crypto.randomInt` draw each. */
export function generateRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function validateCreateInput(input: CreateRoomRequest): void {
  const { roomSize, timerSeconds, attemptsLimit } = input;

  // SQL only enforces room_size >= 2; the upper bound is a service rule (U-017).
  if (!Number.isInteger(roomSize) || roomSize < ROOM_MIN_SIZE || roomSize > ROOM_MAX_SIZE) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Room size must be between ${ROOM_MIN_SIZE} and ${ROOM_MAX_SIZE}.`,
    );
  }

  if (!(ROOM_TIMER_OPTIONS as readonly (number | null)[]).includes(timerSeconds)) {
    throw new AppError("VALIDATION_ERROR", "The timer must be off, 5, 10 or 15 seconds.");
  }

  if (!(ROOM_ATTEMPT_OPTIONS as readonly number[]).includes(attemptsLimit)) {
    throw new AppError("VALIDATION_ERROR", "Attempts must be 3 or 5.");
  }
}

/** Creates a room, retrying on a code collision, and returns its state. */
export async function createRoom(userId: number, input: CreateRoomRequest): Promise<RoomState> {
  validateCreateInput(input);

  for (let attempt = 1; attempt <= ROOM_CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();

    try {
      await createRoomRow({
        creatorId: userId,
        roomCode: code,
        roomSize: input.roomSize,
        timerSeconds: input.timerSeconds,
        attemptsLimit: input.attemptsLimit,
      });
    } catch (error) {
      if (error instanceof RoomCodeConflictError) {
        logger.warn("room_code_conflict", { userId, attempt });
        continue;
      }
      throw error;
    }

    return getRoomState(userId, code);
  }

  logger.error("room_code_generation_exhausted", {
    userId,
    attempts: ROOM_CODE_MAX_ATTEMPTS,
  });
  throw new AppError("INTERNAL_ERROR", "Could not allocate a room code. Please try again.");
}

/** Joins a lobby (idempotent for existing members of that lobby) and returns its state. */
export async function joinRoom(userId: number, code: string): Promise<RoomState> {
  const roomCode = normalizeRoomCode(code);

  await joinRoomRow({ userId, roomCode });
  return getRoomState(userId, roomCode);
}

/** Read-only RoomState for a member (§5.10.6). Dates become ISO strings (U-024). */
export async function getRoomState(userId: number, code: string): Promise<RoomState> {
  const roomCode = normalizeRoomCode(code);

  const room = await findRoomByCode(roomCode);
  if (!room) {
    throw new AppError("ROOM_NOT_FOUND");
  }

  const member = await findRoomMember(room.roomId, userId);
  if (!member) {
    throw new AppError("NOT_ROOM_MEMBER");
  }

  const members = await listRoomMembers(room.roomId);

  // Typed as boolean so the flag can be flipped without a dead-code error.
  const showLiveStandings: boolean = SHOW_LIVE_STANDINGS;
  const hideStandings = room.status === "in_progress" && !showLiveStandings;

  const standings = hideStandings
    ? null
    : (await listRoomScoreboard(room.roomId)).map((entry) => ({
        rank: entry.rank,
        userId: entry.userId,
        username: entry.username,
        bestScore: entry.bestScore,
      }));

  return {
    code: room.code,
    status: room.status,
    roomSize: room.roomSize,
    timerSeconds: room.timerSeconds,
    attemptsLimit: room.attemptsLimit,
    creatorId: room.creatorId,
    createdAt: room.createdAt.toISOString(),
    startedAt: room.startedAt ? room.startedAt.toISOString() : null,
    endedAt: room.endedAt ? room.endedAt.toISOString() : null,
    me: {
      userId,
      isCreator: room.creatorId === userId,
      status: member.status,
      attemptsUsed: member.attemptsUsed,
      // Players who left or finished forfeit whatever attempts were left.
      attemptsRemaining:
        member.status === "active" ? Math.max(0, room.attemptsLimit - member.attemptsUsed) : 0,
      bestScore: member.bestScore,
    },
    members: members.map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      isCreator: entry.userId === room.creatorId,
      status: entry.status,
      attemptsUsed: entry.attemptsUsed,
      bestScore: entry.bestScore,
      joinedAt: entry.joinedAt.toISOString(),
    })),
    standings,
  };
}

/** Creator-only: draws 3 crypto colours, starts the room, returns its state. */
export async function startRoom(userId: number, code: string): Promise<RoomState> {
  const roomCode = normalizeRoomCode(code);
  const [first, second, third] = generateRandomColors(ROUNDS_PER_GAME);

  if (!first || !second || !third) {
    throw new AppError("INTERNAL_ERROR", "Could not generate room colors.");
  }

  await startRoomRow({ userId, roomCode, colors: [first, second, third] });
  return getRoomState(userId, roomCode);
}

/**
 * Leaves a room. Leaving a lobby as a non-creator deletes the membership row,
 * so there is no state to return (`room: null`); every other outcome keeps the
 * row and returns the current state (U-019/U-020).
 */
export async function leaveRoom(userId: number, code: string): Promise<LeaveRoomResponse> {
  const roomCode = normalizeRoomCode(code);

  const result = await leaveRoomRow({ userId, roomCode });

  if (result.outcome === "left_lobby") {
    return { outcome: result.outcome, room: null };
  }

  return { outcome: result.outcome, room: await getRoomState(userId, roomCode) };
}
