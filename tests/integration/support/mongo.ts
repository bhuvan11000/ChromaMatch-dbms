import { randomInt } from "node:crypto";

import { Long } from "mongodb";

import { getGameHistoryCollection } from "@/lib/db/mongo/client";
import type { HistoryDocument, HistoryHsv, GameMode } from "@/lib/db/mongo/historyRepo";

/** Shared helpers for the MongoDB integration tests. */

export function uniqueNumericId(): number {
  return randomInt(1, 2_000_000_000);
}

export function hsv(h: number, s: number, v: number): HistoryHsv {
  return { h, s, v };
}

export interface RoundSpec {
  target: HistoryHsv;
  guess: HistoryHsv;
  score: number;
  colorNumber?: number;
  timedOut?: boolean;
}

export interface HistoryDocumentSpec {
  userId: number;
  mode: GameMode;
  playedAt: Date;
  totalScore: number;
  rounds: readonly RoundSpec[];
  dailyChallengeId?: number;
  roomId?: number;
  attemptNumber?: number;
}

export function makeHistoryDocument(spec: HistoryDocumentSpec): HistoryDocument {
  const document: HistoryDocument = {
    user_id: spec.userId,
    mode: spec.mode,
    played_at: spec.playedAt,
    total_score: spec.totalScore,
    rounds: spec.rounds.map((round, index) => ({
      round_number: index + 1,
      ...(round.colorNumber !== undefined ? { color_number: round.colorNumber } : {}),
      target: { ...round.target },
      guess: { ...round.guess },
      score: round.score,
      ...(round.timedOut !== undefined ? { timed_out: round.timedOut } : {}),
    })),
  };

  if (spec.dailyChallengeId !== undefined) {
    document.daily_challenge_id = spec.dailyChallengeId;
  }
  if (spec.roomId !== undefined) {
    document.room_id = spec.roomId;
  }
  if (spec.attemptNumber !== undefined) {
    document.attempt_number = spec.attemptNumber;
  }

  return document;
}

export async function cleanupHistory(userIds: readonly number[]): Promise<void> {
  if (userIds.length === 0) return;

  await getGameHistoryCollection().deleteMany({
    user_id: { $in: userIds.map((userId) => Long.fromNumber(userId)) },
  });
}
