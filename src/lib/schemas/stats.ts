import { z } from "zod";

import {
  HISTORY_DEFAULT_LIMIT,
  MAX_GAME_SCORE,
  MAX_ROUND_SCORE,
  ROUNDS_PER_GAME,
} from "@/lib/config/constants";

import { gameModeSchema, hsvSchema } from "./game";

/**
 * Profile request/response schemas — Architecture §5.7.6 / §5.10.2.
 *
 * Request schemas are strict so unknown query parameters are rejected. The
 * service clamps the history page size to HISTORY_MAX_LIMIT; the schema only
 * guarantees a positive integer and supplies the documented default.
 */

const dateTimeSchema = z.iso.datetime();
const dateSchema = z.iso.date();

export const historyQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().default(HISTORY_DEFAULT_LIMIT),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

const globalStatsSchema = z
  .object({
    bestScore: z.number().finite().min(0).max(MAX_GAME_SCORE).nullable(),
    achievedAt: dateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.bestScore === null) !== (value.achievedAt === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["achievedAt"],
        message: "The PB score and achievement time must be null together.",
      });
    }
  });

const dailyStatsSchema = z
  .object({
    currentStreak: z.number().int().nonnegative(),
    longestStreak: z.number().int().nonnegative(),
    lastPlayedDate: dateSchema.nullable(),
    todayBest: z.number().finite().min(0).max(MAX_GAME_SCORE).nullable(),
  })
  .strict()
  .refine((value) => value.longestStreak >= value.currentStreak, {
    path: ["longestStreak"],
    message: "The longest streak cannot be shorter than the current streak.",
  });

export const statsModeSummarySchema = z
  .object({
    mode: z.enum(["global", "daily"]),
    games: z.number().int().nonnegative(),
    avgScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
    bestScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
    worstScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
  })
  .strict();

export type StatsModeSummary = z.infer<typeof statsModeSummarySchema>;

export const statsChannelAccuracySchema = z
  .object({
    rounds: z.number().int().nonnegative(),
    avgAbsDiff: z
      .object({
        h: z.number().finite().min(0).max(180),
        s: z.number().finite().min(0).max(100),
        v: z.number().finite().min(0).max(100),
      })
      .strict(),
  })
  .strict();

export type StatsChannelAccuracy = z.infer<typeof statsChannelAccuracySchema>;

export const statsTrendPointSchema = z
  .object({
    bucketStart: dateSchema,
    games: z.number().int().nonnegative(),
    avgScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
  })
  .strict();

export type StatsTrendPoint = z.infer<typeof statsTrendPointSchema>;

export const statsHueRegionSchema = z
  .object({
    from: z.number().int().min(0).max(360),
    to: z.number().int().min(0).max(360),
    rounds: z.number().int().nonnegative(),
    avgScore: z.number().finite().min(0).max(MAX_ROUND_SCORE),
  })
  .strict();

export type StatsHueRegion = z.infer<typeof statsHueRegionSchema>;

export const statsHistorySchema = z
  .object({
    byMode: z.array(statsModeSummarySchema),
    channelAccuracy: statsChannelAccuracySchema,
    trend: z.array(statsTrendPointSchema),
    hueRegions: z.array(statsHueRegionSchema),
  })
  .strict();

export type StatsHistory = z.infer<typeof statsHistorySchema>;

export const myStatsResponseSchema = z
  .object({
    global: globalStatsSchema,
    totalGamesPlayed: z.number().int().nonnegative(),
    daily: dailyStatsSchema,
    achievementsEarned: z.number().int().nonnegative(),
    historyAvailable: z.boolean(),
    history: statsHistorySchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.historyAvailable !== (value.history !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["history"],
        message: "History availability and the history payload must agree.",
      });
    }
  });

export type MyStatsResponse = z.infer<typeof myStatsResponseSchema>;

const historyRoundSchema = z
  .object({
    roundNumber: z.number().int().min(1).max(ROUNDS_PER_GAME),
    colorNumber: z.number().int().min(1).max(ROUNDS_PER_GAME).optional(),
    target: hsvSchema,
    guess: hsvSchema,
    score: z.number().finite().min(0).max(MAX_ROUND_SCORE),
    timedOut: z.boolean().optional(),
  })
  .strict();

export type HistoryRoundResponse = z.infer<typeof historyRoundSchema>;

export const historyItemSchema = z
  .object({
    id: z.string().min(1),
    mode: gameModeSchema,
    playedAt: dateTimeSchema,
    totalScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
    dailyChallengeId: z.number().int().positive().optional(),
    roomId: z.number().int().positive().optional(),
    attemptNumber: z.number().int().positive().max(5).optional(),
    rounds: z.array(historyRoundSchema).length(ROUNDS_PER_GAME),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "daily" && value.dailyChallengeId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["dailyChallengeId"],
        message: "Daily history requires a challenge id.",
      });
    }

    if (
      value.mode === "room" &&
      (value.roomId === undefined || value.attemptNumber === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["roomId"],
        message: "Room history requires a room id and attempt number.",
      });
    }

    if (value.mode !== "global" && value.rounds.some((round) => round.colorNumber === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["rounds"],
        message: "Daily and room history rounds require a color number.",
      });
    }
  });

export type HistoryItemResponse = z.infer<typeof historyItemSchema>;

export const historyResponseSchema = z
  .object({
    items: z.array(historyItemSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export const achievementItemSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    description: z.string(),
    criteriaDescription: z.string(),
    earned: z.boolean(),
    earnedAt: dateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.earned !== (value.earnedAt !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["earnedAt"],
        message: "The earned flag and earned time must agree.",
      });
    }
  });

export type AchievementItemResponse = z.infer<typeof achievementItemSchema>;

export const achievementsResponseSchema = z
  .object({
    achievements: z.array(achievementItemSchema),
  })
  .strict();

export type AchievementsResponse = z.infer<typeof achievementsResponseSchema>;
