"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { ADMIN_USERS_DEFAULT_LIMIT, HISTORY_DEFAULT_LIMIT } from "@/lib/config/constants";
import {
  adminUserDetailResponseSchema,
  adminUserResponseSchema,
  adminUsersResponseSchema,
  type AdminStatsPatch,
  type AdminUserDetailResponse,
  type AdminUserResponse,
  type AdminUsersResponse,
} from "@/lib/schemas/admin";
import { historyResponseSchema, type HistoryResponse } from "@/lib/schemas/stats";

/** Admin query keys — Architecture §5.11.4. */
export const adminKeys = {
  users: (filters: AdminUserFilters) => ["admin", "users", filters] as const,
  user: (userId: number) => ["admin", "user", userId] as const,
  history: (userId: number) => ["admin", "user", userId, "history"] as const,
};

export interface AdminUserFilters {
  query?: string;
  banned?: boolean;
  limit?: number;
  offset?: number;
}

export function useAdminUsers(filters: AdminUserFilters) {
  const query = {
    query: filters.query,
    banned: filters.banned,
    limit: filters.limit ?? ADMIN_USERS_DEFAULT_LIMIT,
    offset: filters.offset ?? 0,
  };

  return useQuery<AdminUsersResponse>({
    queryKey: adminKeys.users(query),
    queryFn: ({ signal }) =>
      apiClient.get<AdminUsersResponse>("/admin/users", {
        query,
        schema: adminUsersResponseSchema,
        signal,
      }),
  });
}

export function useAdminUser(userId: number | null) {
  return useQuery<AdminUserDetailResponse>({
    queryKey: adminKeys.user(userId ?? 0),
    queryFn: ({ signal }) =>
      apiClient.get<AdminUserDetailResponse>(`/admin/users/${userId}`, {
        schema: adminUserDetailResponseSchema,
        signal,
      }),
    enabled: userId !== null && Number.isSafeInteger(userId) && userId > 0,
  });
}

export function useAdminHistory(userId: number | null) {
  return useInfiniteQuery<HistoryResponse>({
    queryKey: adminKeys.history(userId ?? 0),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<HistoryResponse>(`/admin/users/${userId}/history`, {
        query: {
          limit: HISTORY_DEFAULT_LIMIT,
          cursor: typeof pageParam === "string" ? pageParam : undefined,
        },
        schema: historyResponseSchema,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: userId !== null && Number.isSafeInteger(userId) && userId > 0,
  });
}

export interface SetBanVariables {
  userId: number;
  banned: boolean;
}

export function useAdminSetBan() {
  const queryClient = useQueryClient();

  return useMutation<AdminUserResponse, Error, SetBanVariables>({
    mutationFn: ({ userId, banned }) =>
      apiClient.post<AdminUserResponse>(
        `/admin/users/${userId}/${banned ? "ban" : "unban"}`,
        undefined,
        { schema: adminUserResponseSchema },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export interface UpdateStatsVariables {
  userId: number;
  patch: AdminStatsPatch;
}

export function useAdminUpdateStats() {
  const queryClient = useQueryClient();

  return useMutation<AdminUserResponse, Error, UpdateStatsVariables>({
    mutationFn: ({ userId, patch }) =>
      apiClient.patch<AdminUserResponse>(`/admin/users/${userId}/stats`, patch, {
        schema: adminUserResponseSchema,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(variables.userId) });
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}
