"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { clockOffsetMs, formatCountdown, remainingUntilMs } from "@/lib/format/countdown";
import { dailyTodayResponseSchema, type DailyTodayResponse } from "@/lib/schemas/daily";

/** Query key from Architecture §5.11.4. */
export const dailyTodayKey = ["daily", "today"] as const;

const ZERO_RETRY_MS = 5000;

/** TanStack Query wrapper for `GET /api/daily/today`. */
export function useDailyToday() {
  return useQuery<DailyTodayResponse>({
    queryKey: dailyTodayKey,
    queryFn: ({ signal }) =>
      apiClient.get<DailyTodayResponse>("/daily/today", {
        schema: dailyTodayResponseSchema,
        signal,
      }),
  });
}

export interface ResetCountdown {
  /** `hh:mm:ss`, or null until mounted/data (render a stable placeholder). */
  label: string | null;
  remainingMs: number | null;
}

/**
 * Offset-corrected "resets in" countdown. Returns `null` values until the
 * first client tick so server and client markup match during hydration.
 * Calls `onZero` when the countdown reaches zero (once per `resetsAt`, retried
 * every 5 s if the refetch still returns the same reset time).
 */
export function useResetCountdown(
  data: DailyTodayResponse | undefined,
  receivedAtMs: number,
  onZero: () => void,
): ResetCountdown {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const lastFiredRef = useRef<{ resetsAt: string; at: number } | null>(null);
  const onZeroRef = useRef(onZero);

  useEffect(() => {
    onZeroRef.current = onZero;
  }, [onZero]);

  useEffect(() => {
    const first = setTimeout(() => setNowMs(Date.now()), 0);
    const interval = setInterval(() => setNowMs(Date.now()), 1000);

    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  const offset = data ? clockOffsetMs(data.serverTime, receivedAtMs) : 0;
  const remainingMs = data && nowMs !== null ? remainingUntilMs(data.resetsAt, nowMs, offset) : null;

  const resetsAt = data?.resetsAt ?? null;
  useEffect(() => {
    if (resetsAt === null || remainingMs === null || remainingMs > 0 || nowMs === null) return;

    const last = lastFiredRef.current;
    if (last && last.resetsAt === resetsAt && nowMs - last.at < ZERO_RETRY_MS) return;

    lastFiredRef.current = { resetsAt, at: nowMs };
    onZeroRef.current();
  }, [remainingMs, resetsAt, nowMs]);

  return {
    label: remainingMs === null ? null : formatCountdown(remainingMs),
    remainingMs,
  };
}
