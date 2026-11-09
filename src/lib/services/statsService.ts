import { HISTORY_MAX_LIMIT } from "@/lib/config/constants";
import {
  userChannelAccuracy,
  userHueRegionAccuracy,
  userModeSummary,
  userTrend,
} from "@/lib/db/mongo/aggregations";
import { listUserHistory } from "@/lib/db/mongo/historyRepo";
import { countEarnedAchievements, listAchievementsForUser } from "@/lib/db/pg/queries/achievements";
import { findChallengeByDate, findDailyBest } from "@/lib/db/pg/queries/daily";
import { findUserStats } from "@/lib/db/pg/queries/users";
import { displayStreak } from "@/lib/domain/streak";
import { addDays, utcDateString } from "@/lib/domain/time";
import { logger } from "@/lib/logger";
import type {
  AchievementsResponse,
  HistoryItemResponse,
  HistoryResponse,
  MyStatsResponse,
  StatsChannelAccuracy,
  StatsHueRegion,
  StatsModeSummary,
  StatsTrendPoint,
} from "@/lib/schemas/stats";

/**
 * Profile use-cases — Architecture §5.7.6.
 *
 * Postgres owns counters, PBs, streaks and achievements. MongoDB owns the
 * round-by-round history. History aggregations exclude room attempts; room
 * attempts still appear in the recent-history list, tagged `mode: "room"`.
 * MongoDB outages degrade the history block without hiding Postgres counters.
 */

const TREND_DAYS = 30;

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function trendStart(todayUtc: string): Date {
  return new Date(`${addDays(todayUtc, -(TREND_DAYS - 1))}T00:00:00.000Z`);
}

/** Returns counters, today's daily best, achievements earned and Mongo history. */
export async function getMyStats(userId: number, now: Date): Promise<MyStatsResponse> {
  const today = utcDateString(now);

  const [user, achievementsEarned, challenge] = await Promise.all([
    findUserStats(userId),
    countEarnedAchievements(userId),
    findChallengeByDate(today),
  ]);

  const todayBest = challenge ? await findDailyBest(userId, challenge.challengeId) : null;

  let historyAvailable = true;
  let history: MyStatsResponse["history"] = null;

  try {
    const [modeSummary, channelAccuracy, trend, hueRegions] = await Promise.all([
      userModeSummary(userId),
      userChannelAccuracy(userId),
      userTrend(userId, trendStart(today), now, "day"),
      userHueRegionAccuracy(userId),
    ]);

    const byMode: StatsModeSummary[] = [];
    for (const row of modeSummary) {
      if (row.mode !== "global" && row.mode !== "daily") continue;
      byMode.push({
        mode: row.mode,
        games: row.games,
        avgScore: roundOne(row.avgScore),
        bestScore: roundOne(row.bestScore),
        worstScore: roundOne(row.worstScore),
      });
    }

    const accuracy: StatsChannelAccuracy = {
      rounds: channelAccuracy.rounds,
      avgAbsDiff: {
        h: roundOne(channelAccuracy.avgAbsDiff.h),
        s: roundOne(channelAccuracy.avgAbsDiff.s),
        v: roundOne(channelAccuracy.avgAbsDiff.v),
      },
    };

    const trendPoints: StatsTrendPoint[] = trend.map((point) => ({
      bucketStart: point.bucketStart,
      games: point.games,
      avgScore: roundOne(point.avgScore),
    }));

    const regions: StatsHueRegion[] = hueRegions.map((region) => ({
      from: region.from,
      to: region.to,
      rounds: region.rounds,
      avgScore: roundOne(region.avgScore),
    }));

    history = {
      byMode,
      channelAccuracy: accuracy,
      trend: trendPoints,
      hueRegions: regions,
    };
  } catch (error) {
    historyAvailable = false;
    logger.error("stats_history_unavailable", { userId, err: error });
  }

  return {
    global: {
      bestScore: user.globalBestScore,
      achievedAt: user.globalBestAchievedAt?.toISOString() ?? null,
    },
    totalGamesPlayed: user.totalGamesPlayed,
    daily: {
      currentStreak: displayStreak(user.currentDailyStreak, user.lastDailyPlayedDate, today),
      longestStreak: user.longestDailyStreak,
      lastPlayedDate: user.lastDailyPlayedDate,
      todayBest: todayBest?.score ?? null,
    },
    achievementsEarned,
    historyAvailable,
    history,
  };
}

/** One page of the user's history, newest first, across all modes. */
export async function getHistory(
  userId: number,
  input: { limit: number; cursor?: string },
): Promise<HistoryResponse> {
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), HISTORY_MAX_LIMIT);
  const page = await listUserHistory(userId, {
    limit,
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
  });

  const items: HistoryItemResponse[] = page.items.map((item) => ({
    id: item.id,
    mode: item.mode,
    playedAt: item.playedAt.toISOString(),
    totalScore: item.totalScore,
    ...(item.dailyChallengeId !== undefined ? { dailyChallengeId: item.dailyChallengeId } : {}),
    ...(item.roomId !== undefined ? { roomId: item.roomId } : {}),
    ...(item.attemptNumber !== undefined ? { attemptNumber: item.attemptNumber } : {}),
    rounds: item.rounds.map((round) => ({
      roundNumber: round.roundNumber,
      ...(round.colorNumber !== undefined ? { colorNumber: round.colorNumber } : {}),
      target: { ...round.target },
      guess: { ...round.guess },
      score: round.score,
      ...(round.timedOut !== undefined ? { timedOut: round.timedOut } : {}),
    })),
  }));

  return { items, nextCursor: page.nextCursor };
}

/** Every achievement definition with the user's earned state. */
export async function getAchievements(userId: number): Promise<AchievementsResponse> {
  const rows = await listAchievementsForUser(userId);

  return {
    achievements: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      criteriaDescription: row.criteriaDescription,
      earned: row.earned,
      earnedAt: row.earnedAt?.toISOString() ?? null,
    })),
  };
}
