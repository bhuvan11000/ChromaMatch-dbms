import { z } from "zod";

import { LEADERBOARD_DEFAULT_LIMIT, MAX_GAME_SCORE } from "@/lib/config/constants";

/**
 * Leaderboard request/response schemas — Architecture §5.7.5, §5.10.5.
 *
 * Query objects are strict, so unknown parameters are rejected. The service
 * clamps `limit` to LEADERBOARD_MAX_LIMIT; the schema only guarantees an
 * integer page size so the documented "capped" behaviour stays in one place.
 */

const paginationFields = {
  limit: z.coerce.number().int().positive().default(LEADERBOARD_DEFAULT_LIMIT),
  offset: z.coerce.number().int().nonnegative().default(0),
} as const;

export const globalLeaderboardQuerySchema = z.object(paginationFields).strict();

export type GlobalLeaderboardQuery = z.infer<typeof globalLeaderboardQuerySchema>;

/**
 * The date is validated by the service so malformed and future dates both map
 * to INVALID_DATE, as required by Architecture §8.1.
 */
export const dailyLeaderboardQuerySchema = z
  .object({
    ...paginationFields,
    date: z.string().trim().optional(),
  })
  .strict();

export type DailyLeaderboardQuery = z.infer<typeof dailyLeaderboardQuerySchema>;

export const leaderboardEntrySchema = z
  .object({
    rank: z.number().int().positive(),
    userId: z.number().int().positive(),
    username: z.string().min(1),
    score: z.number().finite().min(0).max(MAX_GAME_SCORE),
    achievedAt: z.iso.datetime(),
  })
  .strict();

export type LeaderboardEntryResponse = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardMeSchema = z
  .object({
    rank: z.number().int().positive(),
    score: z.number().finite().min(0).max(MAX_GAME_SCORE),
  })
  .strict();

export type LeaderboardMeResponse = z.infer<typeof leaderboardMeSchema>;

export const globalLeaderboardResponseSchema = z
  .object({
    entries: z.array(leaderboardEntrySchema),
    total: z.number().int().nonnegative(),
    me: leaderboardMeSchema.nullable(),
  })
  .strict();

export type GlobalLeaderboardResponse = z.infer<typeof globalLeaderboardResponseSchema>;

export const dailyLeaderboardResponseSchema = z
  .object({
    entries: z.array(leaderboardEntrySchema),
    total: z.number().int().nonnegative(),
    me: leaderboardMeSchema.nullable(),
    date: z.iso.date(),
  })
  .strict();

export type DailyLeaderboardResponse = z.infer<typeof dailyLeaderboardResponseSchema>;
