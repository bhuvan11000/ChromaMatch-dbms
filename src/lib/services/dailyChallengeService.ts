import { getEnv } from "@/lib/config/env";
import {
  findChallengeByDate,
  findDailyBest,
  findUserDailyStreak,
  listChallengeColors,
  type DailyChallengeColor,
} from "@/lib/db/pg/queries/daily";
import { ensureDailyChallenge } from "@/lib/db/pg/functions";
import { generateDailyColors } from "@/lib/domain/colors";
import { displayStreak } from "@/lib/domain/streak";
import { isValidUtcDateString, nextUtcMidnight, utcDateString } from "@/lib/domain/time";
import { AppError } from "@/lib/errors";
import type { DailyTodayResponse } from "@/lib/schemas/daily";

/**
 * Daily challenge use-cases — Architecture §5.7.2.
 *
 * Only today (UTC) can be created or played. The database row is always the
 * source of truth for the colours; the date-seeded generator is used solely to
 * propose colours when today's row does not exist yet.
 */

export type DailyColors = [DailyChallengeColor, DailyChallengeColor, DailyChallengeColor];

export interface DailyChallenge {
  challengeId: number;
  /** `YYYY-MM-DD` (UTC). */
  date: string;
  colors: DailyColors;
}

async function readChallenge(date: string): Promise<DailyChallenge | null> {
  const challenge = await findChallengeByDate(date);
  if (!challenge) return null;

  const colors = await listChallengeColors(challenge.challengeId);
  return { challengeId: challenge.challengeId, date: challenge.date, colors };
}

/**
 * Returns today's challenge, creating it lazily. `ensure_daily_challenge` is
 * race-safe; we always re-read afterwards so every caller returns the colours
 * that actually got stored (another request may have won the race).
 *
 * `ensure_daily_challenge` compares the date with the DB clock, so this
 * assumes the application and database clocks agree on the UTC date.
 */
export async function getOrCreateToday(now: Date): Promise<DailyChallenge> {
  const date = utcDateString(now);

  const existing = await readChallenge(date);
  if (existing) return existing;

  const colors = generateDailyColors(date, getEnv().DAILY_SEED_SECRET);
  await ensureDailyChallenge(date, colors);

  const stored = await readChallenge(date);
  if (!stored) {
    throw new AppError("INTERNAL_ERROR", "Today's daily challenge could not be loaded.");
  }

  return stored;
}

/**
 * Today's summary for one player. Never creates a challenge and never returns
 * colours (§5.10.3).
 */
export async function getTodaySummary(userId: number, now: Date): Promise<DailyTodayResponse> {
  const date = utcDateString(now);

  const challenge = await findChallengeByDate(date);
  const best = challenge ? await findDailyBest(userId, challenge.challengeId) : null;
  const streak = await findUserDailyStreak(userId);

  return {
    date,
    resetsAt: nextUtcMidnight(now).toISOString(),
    serverTime: now.toISOString(),
    myBest: best ? { score: best.score, achievedAt: best.achievedAt.toISOString() } : null,
    streak: {
      current: displayStreak(streak.current, streak.lastPlayedDate, date),
      // The longest streak is a historical record; it is never display-adjusted.
      longest: streak.longest,
    },
  };
}

/**
 * Read-only lookup used by past-day views. Malformed or future dates are
 * `INVALID_DATE`; a valid day without a challenge returns null.
 *
 * Architecture §5.7.2 lists `getChallengeByDate(date)`; `now` is added so the
 * future-date check is testable without an implicit `Date.now()` (§5.4.5).
 */
export async function getChallengeByDate(date: string, now: Date): Promise<DailyChallenge | null> {
  if (!isValidUtcDateString(date) || date > utcDateString(now)) {
    throw new AppError("INVALID_DATE");
  }

  return readChallenge(date);
}
