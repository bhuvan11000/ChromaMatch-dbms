import { LEADERBOARD_MAX_LIMIT } from "@/lib/config/constants";
import {
  findDailyLeaderboardEntry,
  findGlobalLeaderboardEntry,
  listDailyLeaderboard,
  listGlobalLeaderboard,
  type LeaderboardEntry,
} from "@/lib/db/pg/queries/leaderboards";
import { isValidUtcDateString, utcDateString } from "@/lib/domain/time";
import { AppError } from "@/lib/errors";
import type {
  DailyLeaderboardResponse,
  GlobalLeaderboardResponse,
  LeaderboardEntryResponse,
  LeaderboardMeResponse,
} from "@/lib/schemas/leaderboard";

/**
 * Leaderboard use-cases — Architecture §5.7.5.
 *
 * Both boards are read exclusively from the `global_leaderboard` and
 * `daily_leaderboard` views. The views already exclude banned players, attach
 * deterministic ranks and omit players without a score, so `me` is simply the
 * viewer's row in the same view.
 */

export interface LeaderboardPagination {
  limit: number;
  offset: number;
}

export interface DailyLeaderboardInput extends LeaderboardPagination {
  /** UTC challenge date, `YYYY-MM-DD`. Defaults to today. */
  date?: string;
}

function normalizePagination(input: LeaderboardPagination): LeaderboardPagination {
  const limit = Number.isFinite(input.limit) ? Math.trunc(input.limit) : LEADERBOARD_MAX_LIMIT;
  const offset = Number.isFinite(input.offset) ? Math.trunc(input.offset) : 0;

  return {
    limit: Math.min(Math.max(limit, 1), LEADERBOARD_MAX_LIMIT),
    offset: Math.max(offset, 0),
  };
}

function toEntryResponse(entry: LeaderboardEntry): LeaderboardEntryResponse {
  return {
    rank: entry.rank,
    userId: entry.userId,
    username: entry.username,
    score: entry.score,
    achievedAt: entry.achievedAt.toISOString(),
  };
}

function toMeResponse(entry: LeaderboardEntry | null): LeaderboardMeResponse | null {
  return entry ? { rank: entry.rank, score: entry.score } : null;
}

function resolveDailyDate(date: string | undefined, now: Date): string {
  const today = utcDateString(now);

  if (date === undefined) {
    return today;
  }

  if (!isValidUtcDateString(date)) {
    throw new AppError("INVALID_DATE", "The date must be a valid UTC calendar date.");
  }

  if (date > today) {
    throw new AppError("INVALID_DATE", "The date cannot be in the future.");
  }

  return date;
}

/** Reads one page of the all-time Global leaderboard plus the viewer's row. */
export async function getGlobal(
  input: LeaderboardPagination,
  viewerId?: number,
): Promise<GlobalLeaderboardResponse> {
  const pagination = normalizePagination(input);
  const [page, me] = await Promise.all([
    listGlobalLeaderboard(pagination),
    viewerId === undefined ? Promise.resolve(null) : findGlobalLeaderboardEntry(viewerId),
  ]);

  return {
    entries: page.entries.map(toEntryResponse),
    total: page.total,
    me: toMeResponse(me),
  };
}

/** Reads one page of a Daily leaderboard plus the viewer's row. */
export async function getDaily(
  input: DailyLeaderboardInput,
  viewerId: number | undefined,
  now: Date,
): Promise<DailyLeaderboardResponse> {
  const date = resolveDailyDate(input.date, now);
  const pagination = normalizePagination(input);
  const [page, me] = await Promise.all([
    listDailyLeaderboard({ ...pagination, date }),
    viewerId === undefined ? Promise.resolve(null) : findDailyLeaderboardEntry(date, viewerId),
  ]);

  return {
    entries: page.entries.map(toEntryResponse),
    total: page.total,
    me: toMeResponse(me),
    date,
  };
}
