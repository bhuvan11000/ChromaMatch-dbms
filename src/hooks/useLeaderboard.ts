"use client";

import { useQuery } from "@tanstack/react-query";

import { LEADERBOARD_DEFAULT_LIMIT } from "@/lib/config/constants";
import { apiClient } from "@/lib/api-client";
import {
  dailyLeaderboardResponseSchema,
  globalLeaderboardResponseSchema,
  type DailyLeaderboardResponse,
  type GlobalLeaderboardResponse,
} from "@/lib/schemas/leaderboard";

export type LeaderboardMode = "global" | "daily";
export type LeaderboardData = GlobalLeaderboardResponse | DailyLeaderboardResponse;

export const leaderboardKeys = {
  global: (page: number) => ["leaderboard", "global", page] as const,
  daily: (date: string, page: number) => ["leaderboard", "daily", date, page] as const,
};

export interface UseLeaderboardOptions {
  mode: LeaderboardMode;
  page: number;
  /** UTC date, required for the daily board. */
  date?: string;
}

/**
 * TanStack Query wrapper for the public leaderboard endpoints — §5.11.4.
 *
 * Pages are zero-based in the UI and converted to the API's `offset`.
 */
export function useLeaderboard({ mode, page, date = "" }: UseLeaderboardOptions) {
  const offset = page * LEADERBOARD_DEFAULT_LIMIT;

  return useQuery<LeaderboardData>({
    queryKey: mode === "global" ? leaderboardKeys.global(page) : leaderboardKeys.daily(date, page),
    enabled: mode === "global" || date.length > 0,
    queryFn: ({ signal }) =>
      mode === "global"
        ? apiClient.get<GlobalLeaderboardResponse>("/leaderboards/global", {
            query: { limit: LEADERBOARD_DEFAULT_LIMIT, offset },
            schema: globalLeaderboardResponseSchema,
            signal,
          })
        : apiClient.get<DailyLeaderboardResponse>("/leaderboards/daily", {
            query: { date, limit: LEADERBOARD_DEFAULT_LIMIT, offset },
            schema: dailyLeaderboardResponseSchema,
            signal,
          }),
  });
}
