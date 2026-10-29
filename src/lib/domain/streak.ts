/**
 * Streak display helper — Architecture §5.4.6.
 *
 * The stored streak is only updated when a Daily game is played. When showing
 * it, a streak whose last play was before yesterday (UTC) is displayed as 0.
 * The write-side rule lives in `submit_game_result`, not here.
 */

import { addDays } from "./time";

export function displayStreak(
  current: number,
  lastDailyPlayedDate: string | null,
  todayUtc: string,
): number {
  if (lastDailyPlayedDate === null) {
    return current;
  }

  const yesterdayUtc = addDays(todayUtc, -1);

  return lastDailyPlayedDate < yesterdayUtc ? 0 : current;
}
