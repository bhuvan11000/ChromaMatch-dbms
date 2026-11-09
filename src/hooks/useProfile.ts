"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { HISTORY_DEFAULT_LIMIT } from "@/lib/config/constants";
import {
  achievementsResponseSchema,
  historyResponseSchema,
  myStatsResponseSchema,
  type AchievementsResponse,
  type HistoryResponse,
  type MyStatsResponse,
} from "@/lib/schemas/stats";

/** Query keys from Architecture §5.11.4. */
export const profileKeys = {
  stats: ["me", "stats"] as const,
  achievements: ["me", "achievements"] as const,
  history: ["me", "history"] as const,
};

export function useMyStats() {
  return useQuery<MyStatsResponse>({
    queryKey: profileKeys.stats,
    queryFn: ({ signal }) =>
      apiClient.get<MyStatsResponse>("/me/stats", {
        schema: myStatsResponseSchema,
        signal,
      }),
  });
}

export function useMyAchievements() {
  return useQuery<AchievementsResponse>({
    queryKey: profileKeys.achievements,
    queryFn: ({ signal }) =>
      apiClient.get<AchievementsResponse>("/me/achievements", {
        schema: achievementsResponseSchema,
        signal,
      }),
  });
}

/** Cursor-paginated recent history; pages append newest-first. */
export function useHistory() {
  return useInfiniteQuery<HistoryResponse>({
    queryKey: profileKeys.history,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<HistoryResponse>("/me/history", {
        query: {
          limit: HISTORY_DEFAULT_LIMIT,
          cursor: typeof pageParam === "string" ? pageParam : undefined,
        },
        schema: historyResponseSchema,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
