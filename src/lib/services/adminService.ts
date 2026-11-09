import { ADMIN_DAILY_BESTS_LIMIT, ADMIN_USERS_MAX_LIMIT } from "@/lib/config/constants";
import { listAchievementsForUser, type AchievementRecord } from "@/lib/db/pg/queries/achievements";
import {
  findAdminUser,
  listAdminUsers,
  listDailyBestsForUser,
  type AdminDailyBestRecord,
  type AdminUserListInput,
  type AdminUserRecord,
} from "@/lib/db/pg/queries/admin";
import { adminSetBan, adminUpdateUserStats, type AdminUserStatsPatch } from "@/lib/db/pg/functions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type {
  AdminDailyBest,
  AdminStatsPatch,
  AdminUserDetail,
  AdminUserDetailResponse,
  AdminUserResponse,
  AdminUserSummary,
  AdminUsersResponse,
} from "@/lib/schemas/admin";
import type { AchievementItemResponse, HistoryQuery, HistoryResponse } from "@/lib/schemas/stats";

import { getHistory } from "./statsService";

/**
 * Admin use-cases — Architecture §5.7.7.
 *
 * The route guard re-reads the caller's role from PostgreSQL; the stored
 * procedures re-check it again. Every successful state change is logged as a
 * structured JSON line (the §6 default instead of an audit table).
 */

function mapSummary(user: AdminUserRecord): AdminUserSummary {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isBanned: user.isBanned,
    createdAt: user.createdAt.toISOString(),
    globalBestScore: user.globalBestScore,
    totalGamesPlayed: user.totalGamesPlayed,
    currentDailyStreak: user.currentDailyStreak,
    longestDailyStreak: user.longestDailyStreak,
  };
}

function mapDetail(user: AdminUserRecord): AdminUserDetail {
  return {
    ...mapSummary(user),
    globalBestAchievedAt: user.globalBestAchievedAt?.toISOString() ?? null,
    lastDailyPlayedDate: user.lastDailyPlayedDate,
  };
}

function mapDailyBest(best: AdminDailyBestRecord): AdminDailyBest {
  return {
    date: best.date,
    bestScore: best.bestScore,
    achievedAt: best.achievedAt.toISOString(),
  };
}

function mapAchievement(achievement: AchievementRecord): AchievementItemResponse {
  return {
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    criteriaDescription: achievement.criteriaDescription,
    earned: achievement.earned,
    earnedAt: achievement.earnedAt?.toISOString() ?? null,
  };
}

async function readAdminUser(userId: number): Promise<AdminUserRecord> {
  const user = await findAdminUser(userId);

  if (!user) {
    throw new AppError("USER_NOT_FOUND");
  }

  return user;
}

export interface AdminUsersInput {
  query?: string;
  banned?: boolean;
  limit: number;
  offset: number;
}

/** Searches players with the documented filters and pagination. */
export async function listUsers(input: AdminUsersInput): Promise<AdminUsersResponse> {
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), ADMIN_USERS_MAX_LIMIT);
  const offset = Math.max(Math.trunc(input.offset), 0);

  const listInput: AdminUserListInput = {
    limit,
    offset,
    ...(input.query !== undefined && input.query.length > 0 ? { query: input.query } : {}),
    ...(input.banned !== undefined ? { banned: input.banned } : {}),
  };

  const page = await listAdminUsers(listInput);

  return {
    users: page.users.map(mapSummary),
    total: page.total,
  };
}

/** Full player detail with the last 30 Daily bests and earned achievements. */
export async function getUser(userId: number): Promise<AdminUserDetailResponse> {
  const user = await readAdminUser(userId);

  const [dailyBests, achievements] = await Promise.all([
    listDailyBestsForUser(userId, ADMIN_DAILY_BESTS_LIMIT),
    listAchievementsForUser(userId),
  ]);

  return {
    user: mapDetail(user),
    dailyBests: dailyBests.map(mapDailyBest),
    achievements: achievements.filter((achievement) => achievement.earned).map(mapAchievement),
  };
}

/** One page of a player's history; the same reader used by `/api/me/history`. */
export async function getUserHistory(
  userId: number,
  input: HistoryQuery,
): Promise<HistoryResponse> {
  await readAdminUser(userId);
  return getHistory(userId, input);
}

const ADMIN_STATS_KEYS = new Set<keyof AdminStatsPatch>([
  "globalBestScore",
  "globalBestAchievedAt",
  "totalGamesPlayed",
  "currentDailyStreak",
  "longestDailyStreak",
  "lastDailyPlayedDate",
]);

function assertAllowedPatch(patch: AdminStatsPatch): void {
  for (const key of Object.keys(patch)) {
    if (!ADMIN_STATS_KEYS.has(key as keyof AdminStatsPatch)) {
      throw new AppError("INVALID_PATCH");
    }
  }
}

function toSqlPatch(patch: AdminStatsPatch): AdminUserStatsPatch {
  const result: AdminUserStatsPatch = {};

  if (patch.globalBestScore !== undefined) {
    result.global_best_score = patch.globalBestScore;
  }
  if (patch.globalBestAchievedAt !== undefined) {
    result.global_best_achieved_at = patch.globalBestAchievedAt;
  }
  if (patch.totalGamesPlayed !== undefined) {
    result.total_games_played = patch.totalGamesPlayed;
  }
  if (patch.currentDailyStreak !== undefined) {
    result.current_daily_streak = patch.currentDailyStreak;
  }
  if (patch.longestDailyStreak !== undefined) {
    result.longest_daily_streak = patch.longestDailyStreak;
  }
  if (patch.lastDailyPlayedDate !== undefined) {
    result.last_daily_played_date = patch.lastDailyPlayedDate;
  }

  return result;
}

/** Applies the §5.7.7 allow-listed patch through the stored procedure. */
export async function updateUserStats(
  adminId: number,
  targetId: number,
  patch: AdminStatsPatch,
): Promise<AdminUserResponse> {
  assertAllowedPatch(patch);

  await adminUpdateUserStats({
    adminId,
    targetId,
    patch: toSqlPatch(patch),
  });

  logger.info("admin_action", {
    admin: adminId,
    target: targetId,
    action: "update_stats",
    patch,
  });

  const user = await readAdminUser(targetId);
  return { user: mapDetail(user) };
}

/** Bans or unbans a player; the procedure rejects self/admin targets. */
export async function setBan(
  adminId: number,
  targetId: number,
  banned: boolean,
): Promise<AdminUserResponse> {
  await adminSetBan({ adminId, targetId, banned });

  logger.info("admin_action", {
    admin: adminId,
    target: targetId,
    action: banned ? "ban" : "unban",
  });

  const user = await readAdminUser(targetId);
  return { user: mapDetail(user) };
}
