"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { meResponseSchema, type MeUserResponse } from "@/lib/schemas/auth";

/** Shared TanStack Query key for the signed-in account (Architecture §5.11.4). */
export const SESSION_QUERY_KEY = ["me"] as const;

interface MeResponse {
  user: MeUserResponse;
}

/**
 * Reads the current account from `GET /api/me`.
 *
 * The response is parsed with the shared Zod schema, so a contract drift is a
 * visible error rather than silently mistyped UI data.
 */
export function useSession() {
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: ({ signal }) =>
      apiClient.get<MeResponse>("/me", {
        schema: meResponseSchema,
        signal,
      }),
  });

  return {
    ...query,
    user: query.data?.user ?? null,
  };
}
