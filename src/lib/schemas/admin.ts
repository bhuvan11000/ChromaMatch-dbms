import { z } from "zod";

import { ADMIN_USERS_DEFAULT_LIMIT, MAX_GAME_SCORE } from "@/lib/config/constants";

import { userRoleSchema } from "./auth";
import { achievementItemSchema } from "./stats";

/**
 * Admin request/response schemas — Architecture §5.7.7, §5.10.7.
 *
 * Query and body objects are strict, so unknown fields never reach a service.
 * The only exception is the stats patch: the route maps Zod's
 * `unrecognized_keys` issue to `INVALID_PATCH` (the SQL procedure uses the
 * same code), while every other schema failure stays `VALIDATION_ERROR`.
 */

const dateTimeSchema = z.iso.datetime();
const dateSchema = z.iso.date();

export const adminUsersQuerySchema = z
  .object({
    query: z.string().trim().max(100).optional(),
    banned: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
    limit: z.coerce.number().int().positive().default(ADMIN_USERS_DEFAULT_LIMIT),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminUserIdSchema = z.coerce.number().int().positive();

function hasOneDecimal(value: number): boolean {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

const globalBestScoreSchema = z
  .number()
  .finite()
  .min(0)
  .max(MAX_GAME_SCORE)
  .refine(hasOneDecimal, "Scores use at most one decimal place.");

export const adminStatsPatchSchema = z
  .object({
    globalBestScore: globalBestScoreSchema.nullable().optional(),
    globalBestAchievedAt: dateTimeSchema.nullable().optional(),
    totalGamesPlayed: z.number().int().nonnegative().optional(),
    currentDailyStreak: z.number().int().nonnegative().optional(),
    longestDailyStreak: z.number().int().nonnegative().optional(),
    lastDailyPlayedDate: dateSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasScore = Object.hasOwn(value, "globalBestScore");
    const hasAchievedAt = Object.hasOwn(value, "globalBestAchievedAt");

    if (hasScore !== hasAchievedAt) {
      ctx.addIssue({
        code: "custom",
        path: [hasScore ? "globalBestAchievedAt" : "globalBestScore"],
        message: "Set the Global PB score and achievement time together.",
      });
    } else if (hasScore && hasAchievedAt) {
      const score = value.globalBestScore ?? null;
      const achievedAt = value.globalBestAchievedAt ?? null;

      if ((score === null) !== (achievedAt === null)) {
        ctx.addIssue({
          code: "custom",
          path: ["globalBestAchievedAt"],
          message: "The PB score and achievement time must be null together.",
        });
      }
    }

    if (
      value.currentDailyStreak !== undefined &&
      value.longestDailyStreak !== undefined &&
      value.longestDailyStreak < value.currentDailyStreak
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["longestDailyStreak"],
        message: "The longest streak cannot be shorter than the current streak.",
      });
    }
  });

export type AdminStatsPatch = z.infer<typeof adminStatsPatchSchema>;

export const adminUserSummarySchema = z
  .object({
    id: z.number().int().positive(),
    username: z.string().min(1),
    email: z.email(),
    role: userRoleSchema,
    isBanned: z.boolean(),
    createdAt: dateTimeSchema,
    globalBestScore: z.number().finite().min(0).max(MAX_GAME_SCORE).nullable(),
    totalGamesPlayed: z.number().int().nonnegative(),
    currentDailyStreak: z.number().int().nonnegative(),
    longestDailyStreak: z.number().int().nonnegative(),
  })
  .strict();

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserDetailSchema = adminUserSummarySchema
  .extend({
    globalBestAchievedAt: dateTimeSchema.nullable(),
    lastDailyPlayedDate: dateSchema.nullable(),
  })
  .strict();

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const adminDailyBestSchema = z
  .object({
    date: dateSchema,
    bestScore: z.number().finite().min(0).max(MAX_GAME_SCORE),
    achievedAt: dateTimeSchema,
  })
  .strict();

export type AdminDailyBest = z.infer<typeof adminDailyBestSchema>;

export const adminUsersResponseSchema = z
  .object({
    users: z.array(adminUserSummarySchema),
    total: z.number().int().nonnegative(),
  })
  .strict();

export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

export const adminUserResponseSchema = z
  .object({
    user: adminUserDetailSchema,
  })
  .strict();

export type AdminUserResponse = z.infer<typeof adminUserResponseSchema>;

export const adminUserDetailResponseSchema = z
  .object({
    user: adminUserDetailSchema,
    dailyBests: z.array(adminDailyBestSchema),
    achievements: z.array(achievementItemSchema),
  })
  .strict();

export type AdminUserDetailResponse = z.infer<typeof adminUserDetailResponseSchema>;
