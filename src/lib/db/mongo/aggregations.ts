import { Long } from "mongodb";

import { AppError } from "@/lib/errors";

import { getGameHistoryCollection } from "./client";
import type { GameMode } from "./historyRepo";

/**
 * MongoDB aggregation catalog — Architecture §5.9.5.
 *
 * Every user-level pipeline excludes `mode: "room"` unless the function is
 * explicitly room-scoped. Averages are returned unrounded; the service layer
 * rounds to one decimal per §5.9.5.
 */

export interface UserModeSummary {
  mode: GameMode;
  games: number;
  avgScore: number;
  bestScore: number;
  worstScore: number;
}

export interface UserTrendPoint {
  bucketStart: string;
  games: number;
  avgScore: number;
}

export type TrendBucket = "day" | "week";

export interface UserChannelAccuracy {
  rounds: number;
  avgAbsDiff: {
    h: number;
    s: number;
    v: number;
  };
}

export interface UserHueRegionAccuracy {
  from: number;
  to: number;
  rounds: number;
  avgScore: number;
}

export interface DailyChallengeSummary {
  colorNumber: number;
  avgScore: number;
  rounds: number;
  players: number;
}

export interface RoomSummary {
  colorNumber: number;
  avgScore: number;
  timeouts: number;
}

export interface UserRoomProgressItem {
  attemptNumber: number;
  totalScore: number;
  playedAt: Date;
}

function invalid(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message);
}

function toLongId(value: number, field: string): Long {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalid(`Invalid ${field}.`);
  }
  return Long.fromNumber(value);
}

function userMatch(userId: number): Record<string, unknown> {
  return {
    user_id: toLongId(userId, "user id"),
    mode: { $in: ["global", "daily"] },
  };
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function assertDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw invalid(`Invalid ${field}.`);
  }
}

/** Per-mode count/avg/best/worst for Global and Daily games. */
export async function userModeSummary(userId: number): Promise<UserModeSummary[]> {
  const rows = await getGameHistoryCollection()
    .aggregate([
      { $match: userMatch(userId) },
      {
        $group: {
          _id: "$mode",
          games: { $sum: 1 },
          avgScore: { $avg: "$total_score" },
          bestScore: { $max: "$total_score" },
          worstScore: { $min: "$total_score" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          mode: "$_id",
          games: 1,
          avgScore: 1,
          bestScore: 1,
          worstScore: 1,
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    mode: row.mode as GameMode,
    games: toNumber(row.games),
    avgScore: toNumber(row.avgScore),
    bestScore: toNumber(row.bestScore),
    worstScore: toNumber(row.worstScore),
  }));
}

/** Score trend grouped by UTC day or week (weeks start Monday). */
export async function userTrend(
  userId: number,
  from: Date,
  to: Date,
  bucket: TrendBucket,
): Promise<UserTrendPoint[]> {
  assertDate(from, "from date");
  assertDate(to, "to date");
  if (from.getTime() > to.getTime()) {
    throw invalid("The trend range is invalid.");
  }
  if (bucket !== "day" && bucket !== "week") {
    throw invalid("Invalid trend bucket.");
  }

  const dateTrunc: Record<string, unknown> = {
    date: "$played_at",
    unit: bucket,
    timezone: "UTC",
  };
  if (bucket === "week") {
    dateTrunc.startOfWeek = "monday";
  }

  const rows = await getGameHistoryCollection()
    .aggregate([
      {
        $match: {
          ...userMatch(userId),
          played_at: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: { $dateTrunc: dateTrunc },
          games: { $sum: 1 },
          avgScore: { $avg: "$total_score" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          bucketStart: {
            $dateToString: { format: "%Y-%m-%d", date: "$_id", timezone: "UTC" },
          },
          games: 1,
          avgScore: 1,
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    bucketStart: String(row.bucketStart),
    games: toNumber(row.games),
    avgScore: toNumber(row.avgScore),
  }));
}

/** Average absolute channel error; hue uses the shortest way around the circle. */
export async function userChannelAccuracy(userId: number): Promise<UserChannelAccuracy> {
  const rows = await getGameHistoryCollection()
    .aggregate([
      { $match: userMatch(userId) },
      { $unwind: "$rounds" },
      {
        $project: {
          _id: 0,
          h: {
            $let: {
              vars: {
                d: {
                  $abs: {
                    $subtract: ["$rounds.target.h", "$rounds.guess.h"],
                  },
                },
              },
              in: {
                $cond: [{ $gt: ["$$d", 180] }, { $subtract: [360, "$$d"] }, "$$d"],
              },
            },
          },
          s: { $abs: { $subtract: ["$rounds.target.s", "$rounds.guess.s"] } },
          v: { $abs: { $subtract: ["$rounds.target.v", "$rounds.guess.v"] } },
        },
      },
      {
        $group: {
          _id: null,
          rounds: { $sum: 1 },
          h: { $avg: "$h" },
          s: { $avg: "$s" },
          v: { $avg: "$v" },
        },
      },
      {
        $project: {
          _id: 0,
          rounds: 1,
          avgAbsDiff: { h: "$h", s: "$s", v: "$v" },
        },
      },
    ])
    .toArray();

  const row = rows[0];
  if (!row) {
    return { rounds: 0, avgAbsDiff: { h: 0, s: 0, v: 0 } };
  }

  const diff = (row.avgAbsDiff ?? {}) as Record<string, unknown>;

  return {
    rounds: toNumber(row.rounds),
    avgAbsDiff: {
      h: toNumber(diff.h ?? 0),
      s: toNumber(diff.s ?? 0),
      v: toNumber(diff.v ?? 0),
    },
  };
}

/** Average round score per hue bin, e.g. 0–30°, 30–60°, … 330–360°. */
export async function userHueRegionAccuracy(
  userId: number,
  binDeg = 30,
): Promise<UserHueRegionAccuracy[]> {
  if (!Number.isInteger(binDeg) || binDeg < 1 || binDeg > 360 || 360 % binDeg !== 0) {
    throw invalid("Hue bin size must divide 360 evenly.");
  }

  const boundaries = Array.from({ length: 360 / binDeg + 1 }, (_, index) => index * binDeg);

  const rows = await getGameHistoryCollection()
    .aggregate([
      { $match: userMatch(userId) },
      { $unwind: "$rounds" },
      {
        $set: {
          hue: {
            $cond: [{ $eq: ["$rounds.target.h", 360] }, 0, "$rounds.target.h"],
          },
        },
      },
      {
        $bucket: {
          groupBy: "$hue",
          boundaries,
          default: "other",
          output: {
            rounds: { $sum: 1 },
            avgScore: { $avg: "$rounds.score" },
          },
        },
      },
      { $match: { _id: { $ne: "other" } } },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          from: "$_id",
          to: { $add: ["$_id", binDeg] },
          rounds: 1,
          avgScore: 1,
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    from: toNumber(row.from),
    to: toNumber(row.to),
    rounds: toNumber(row.rounds),
    avgScore: toNumber(row.avgScore),
  }));
}

/** Per-color-number stats for one Daily challenge, including distinct players. */
export async function dailyChallengeSummary(challengeId: number): Promise<DailyChallengeSummary[]> {
  const rows = await getGameHistoryCollection()
    .aggregate([
      {
        $match: {
          mode: "daily",
          daily_challenge_id: toLongId(challengeId, "daily challenge id"),
        },
      },
      { $unwind: "$rounds" },
      {
        $group: {
          _id: "$rounds.color_number",
          avgScore: { $avg: "$rounds.score" },
          rounds: { $sum: 1 },
          players: { $addToSet: "$user_id" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          colorNumber: "$_id",
          avgScore: 1,
          rounds: 1,
          players: { $size: "$players" },
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    colorNumber: toNumber(row.colorNumber),
    avgScore: toNumber(row.avgScore),
    rounds: toNumber(row.rounds),
    players: toNumber(row.players),
  }));
}

/** Per-color-number stats for one room, including timeout counts. */
export async function roomSummary(roomId: number): Promise<RoomSummary[]> {
  const rows = await getGameHistoryCollection()
    .aggregate([
      {
        $match: {
          mode: "room",
          room_id: toLongId(roomId, "room id"),
        },
      },
      { $unwind: "$rounds" },
      {
        $group: {
          _id: "$rounds.color_number",
          avgScore: { $avg: "$rounds.score" },
          timeouts: {
            $sum: {
              $cond: [{ $eq: ["$rounds.timed_out", true] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          colorNumber: "$_id",
          avgScore: 1,
          timeouts: 1,
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    colorNumber: toNumber(row.colorNumber),
    avgScore: toNumber(row.avgScore),
    timeouts: toNumber(row.timeouts),
  }));
}

/** One player's attempt-by-attempt progress inside a room. */
export async function userRoomProgress(
  roomId: number,
  userId: number,
): Promise<UserRoomProgressItem[]> {
  const rows = await getGameHistoryCollection()
    .aggregate([
      {
        $match: {
          mode: "room",
          room_id: toLongId(roomId, "room id"),
          user_id: toLongId(userId, "user id"),
        },
      },
      { $sort: { attempt_number: 1 } },
      {
        $project: {
          _id: 0,
          attemptNumber: "$attempt_number",
          totalScore: "$total_score",
          playedAt: "$played_at",
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    attemptNumber: toNumber(row.attemptNumber),
    totalScore: toNumber(row.totalScore),
    playedAt: toDate(row.playedAt),
  }));
}
