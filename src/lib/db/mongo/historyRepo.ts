import { Int32, Long, ObjectId, type WithId } from "mongodb";

import { AppError } from "@/lib/errors";

import { getGameHistoryCollection } from "./client";

/**
 * MongoDB game history repository — Architecture §5.9.3/§5.9.4.
 *
 * Documents are stored in the snake_case shape of Database Design §7.2 with
 * Postgres ids wrapped as BSON `Long`. Read models are camelCase and normalize
 * BSON numeric types at this boundary.
 */

export type GameMode = "global" | "daily" | "room";

export interface HistoryHsv {
  h: number;
  s: number;
  v: number;
}

export interface HistoryTokenRound extends HistoryHsv {
  /** Color number 1–3 for Daily/Room; omitted for Global. */
  n?: number;
}

export interface HistoryToken {
  mode: GameMode;
  cid?: number;
  rid?: number;
  rounds: readonly HistoryTokenRound[];
}

export interface HistoryRoundResult {
  score: number;
}

export interface HistoryDocumentRound {
  round_number: number;
  color_number?: number;
  target: HistoryHsv;
  guess: HistoryHsv;
  score: number;
  timed_out?: boolean;
}

export interface HistoryDocument {
  user_id: number;
  mode: GameMode;
  daily_challenge_id?: number;
  room_id?: number;
  attempt_number?: number;
  played_at: Date;
  total_score: number;
  rounds: HistoryDocumentRound[];
}

export interface StoredHistoryRound {
  round_number: Int32;
  color_number?: Int32;
  target: HistoryHsv;
  guess: HistoryHsv;
  score: number;
  timed_out?: boolean;
}

export interface StoredHistoryDocument {
  user_id: Long;
  mode: GameMode;
  daily_challenge_id?: Long;
  room_id?: Long;
  attempt_number?: Int32;
  played_at: Date;
  total_score: number;
  rounds: StoredHistoryRound[];
}

export interface HistoryItemRound {
  roundNumber: number;
  colorNumber?: number;
  target: HistoryHsv;
  guess: HistoryHsv;
  score: number;
  timedOut?: boolean;
}

export interface HistoryItem {
  id: string;
  mode: GameMode;
  playedAt: Date;
  totalScore: number;
  dailyChallengeId?: number;
  roomId?: number;
  attemptNumber?: number;
  rounds: HistoryItemRound[];
}

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

export interface BuildHistoryInput {
  token: HistoryToken;
  userId: number;
  guesses: readonly HistoryHsv[];
  roundResults: readonly HistoryRoundResult[];
  total: number;
  playedAt: Date;
  roomAttemptNumber?: number;
  timedOut?: readonly boolean[];
}

const HISTORY_MAX_LIMIT = 100;

function invalid(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message);
}

function assertSafeId(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalid(`Invalid ${field}.`);
  }
}

function assertHsv(value: HistoryHsv, field: string): void {
  if (
    !Number.isFinite(value.h) ||
    !Number.isFinite(value.s) ||
    !Number.isFinite(value.v) ||
    value.h < 0 ||
    value.h > 360 ||
    value.s < 0 ||
    value.s > 100 ||
    value.v < 0 ||
    value.v > 100
  ) {
    throw invalid(`Invalid ${field}.`);
  }
}

function assertScore(value: number, field: string, max: number): void {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw invalid(`Invalid ${field}.`);
  }
}

/** Builds the Database Design §7.2 document shape from verified game data. */
export function buildHistoryDocument(input: BuildHistoryInput): HistoryDocument {
  const { token } = input;

  if (token.mode !== "global" && token.mode !== "daily" && token.mode !== "room") {
    throw invalid("Invalid game mode.");
  }

  assertSafeId(input.userId, "user id");

  if (!(input.playedAt instanceof Date) || Number.isNaN(input.playedAt.getTime())) {
    throw invalid("Invalid played_at.");
  }

  assertScore(input.total, "total score", 30);

  if (token.rounds.length !== 3 || input.guesses.length !== 3 || input.roundResults.length !== 3) {
    throw invalid("A history document requires exactly 3 rounds.");
  }

  if (input.timedOut !== undefined && input.timedOut.length !== 3) {
    throw invalid("timedOut must contain exactly 3 entries.");
  }

  const rounds = token.rounds.map((tokenRound, index): HistoryDocumentRound => {
    const guess = input.guesses[index];
    const result = input.roundResults[index];
    if (!guess || !result) {
      throw invalid("A history document requires exactly 3 rounds.");
    }

    assertHsv(tokenRound, "target color");
    assertHsv(guess, "guess color");
    assertScore(result.score, "round score", 10);

    const round: HistoryDocumentRound = {
      round_number: index + 1,
      target: { h: tokenRound.h, s: tokenRound.s, v: tokenRound.v },
      guess: { h: guess.h, s: guess.s, v: guess.v },
      score: result.score,
    };

    if (token.mode !== "global") {
      if (
        tokenRound.n === undefined ||
        !Number.isInteger(tokenRound.n) ||
        tokenRound.n < 1 ||
        tokenRound.n > 3
      ) {
        throw invalid("Daily and room rounds require a color number.");
      }
      round.color_number = tokenRound.n;
    }

    if (token.mode === "room") {
      round.timed_out = input.timedOut?.[index] ?? false;
    }

    return round;
  });

  const document: HistoryDocument = {
    user_id: input.userId,
    mode: token.mode,
    played_at: input.playedAt,
    total_score: input.total,
    rounds,
  };

  if (token.mode === "daily") {
    if (token.cid === undefined) {
      throw invalid("Daily history requires a challenge id.");
    }
    assertSafeId(token.cid, "daily challenge id");
    document.daily_challenge_id = token.cid;
  }

  if (token.mode === "room") {
    if (token.rid === undefined) {
      throw invalid("Room history requires a room id.");
    }
    assertSafeId(token.rid, "room id");
    if (
      input.roomAttemptNumber === undefined ||
      !Number.isInteger(input.roomAttemptNumber) ||
      input.roomAttemptNumber < 1 ||
      input.roomAttemptNumber > 5
    ) {
      throw invalid("Room history requires a valid attempt number.");
    }
    document.room_id = token.rid;
    document.attempt_number = input.roomAttemptNumber;
  }

  return document;
}

function toLong(value: number, field: string): Long {
  assertSafeId(value, field);
  return Long.fromNumber(value);
}

function toInt32(value: number, field: string): Int32 {
  if (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw invalid(`Invalid ${field}.`);
  }
  return new Int32(value);
}

/** Converts the logical document into its BSON storage shape. */
export function toStoredHistoryDocument(document: HistoryDocument): StoredHistoryDocument {
  return {
    user_id: toLong(document.user_id, "user id"),
    mode: document.mode,
    ...(document.daily_challenge_id !== undefined
      ? { daily_challenge_id: toLong(document.daily_challenge_id, "daily challenge id") }
      : {}),
    ...(document.room_id !== undefined ? { room_id: toLong(document.room_id, "room id") } : {}),
    ...(document.attempt_number !== undefined
      ? { attempt_number: toInt32(document.attempt_number, "attempt number") }
      : {}),
    played_at: document.played_at,
    total_score: document.total_score,
    rounds: document.rounds.map((round) => ({
      round_number: toInt32(round.round_number, "round number"),
      ...(round.color_number !== undefined
        ? { color_number: toInt32(round.color_number, "color number") }
        : {}),
      target: { ...round.target },
      guess: { ...round.guess },
      score: round.score,
      ...(round.timed_out !== undefined ? { timed_out: round.timed_out } : {}),
    })),
  };
}

/** Insert-only write path. Returns the generated document id. */
export async function insertGame(document: HistoryDocument): Promise<ObjectId> {
  const stored = toStoredHistoryDocument(document);
  const result = await getGameHistoryCollection().insertOne(stored);
  return result.insertedId;
}

function encodeCursor(document: WithId<StoredHistoryDocument>): string {
  return Buffer.from(
    JSON.stringify({
      p: document.played_at.toISOString(),
      i: document._id.toHexString(),
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): { playedAt: Date; id: ObjectId } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      p?: unknown;
      i?: unknown;
    };

    if (typeof parsed.p !== "string" || typeof parsed.i !== "string") {
      throw new Error("Invalid cursor shape");
    }

    const playedAt = new Date(parsed.p);
    if (
      Number.isNaN(playedAt.getTime()) ||
      !/^[0-9a-f]{24}$/i.test(parsed.i) ||
      !ObjectId.isValid(parsed.i)
    ) {
      throw new Error("Invalid cursor value");
    }

    return { playedAt, id: new ObjectId(parsed.i) };
  } catch {
    throw invalid("Invalid history cursor.");
  }
}

function toNumber(value: number | Int32 | Long): number {
  if (value instanceof Int32) {
    return value.value;
  }
  if (Long.isLong(value)) {
    return value.toNumber();
  }
  return value;
}

function mapStoredDocument(document: WithId<StoredHistoryDocument>): HistoryItem {
  const item: HistoryItem = {
    id: document._id.toHexString(),
    mode: document.mode,
    playedAt: document.played_at,
    totalScore: document.total_score,
    rounds: document.rounds.map((round) => {
      const mapped: HistoryItemRound = {
        roundNumber: toNumber(round.round_number),
        target: { ...round.target },
        guess: { ...round.guess },
        score: round.score,
      };

      if (round.color_number !== undefined) {
        mapped.colorNumber = toNumber(round.color_number);
      }
      if (round.timed_out !== undefined) {
        mapped.timedOut = round.timed_out;
      }

      return mapped;
    }),
  };

  if (document.daily_challenge_id !== undefined) {
    item.dailyChallengeId = toNumber(document.daily_challenge_id);
  }
  if (document.room_id !== undefined) {
    item.roomId = toNumber(document.room_id);
  }
  if (document.attempt_number !== undefined) {
    item.attemptNumber = toNumber(document.attempt_number);
  }

  return item;
}

export interface ListHistoryInput {
  limit: number;
  cursor?: string;
}

/** Newest-first history for one user, all modes, with opaque cursor pagination. */
export async function listUserHistory(
  userId: number,
  input: ListHistoryInput,
): Promise<HistoryPage> {
  assertSafeId(userId, "user id");

  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > HISTORY_MAX_LIMIT) {
    throw invalid(`History limit must be between 1 and ${HISTORY_MAX_LIMIT}.`);
  }

  const filter: Record<string, unknown> = {
    user_id: Long.fromNumber(userId),
  };

  if (input.cursor !== undefined) {
    const cursor = decodeCursor(input.cursor);
    filter.$or = [
      { played_at: { $lt: cursor.playedAt } },
      { played_at: cursor.playedAt, _id: { $lt: cursor.id } },
    ];
  }

  const documents = await getGameHistoryCollection()
    .find<WithId<StoredHistoryDocument>>(filter)
    .sort({ played_at: -1, _id: -1 })
    .limit(input.limit + 1)
    .toArray();

  const hasMore = documents.length > input.limit;
  const page = hasMore ? documents.slice(0, input.limit) : documents;
  const last = page.at(-1);

  return {
    items: page.map(mapStoredDocument),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}
