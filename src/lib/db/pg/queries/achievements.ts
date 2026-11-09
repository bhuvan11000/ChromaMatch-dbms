import { sql } from "drizzle-orm";

import { getDb } from "../client";
import { mapPgError } from "../errors";

/**
 * Read-only achievement lookups — Architecture §5.7.6.
 *
 * Definitions are seeded by `scripts/seed-achievements.ts`; earned rows are
 * inserted by `evaluate_achievements` inside `submit_game_result`. This module
 * only joins the two tables and normalizes PostgreSQL types.
 */

export interface AchievementRecord {
  id: number;
  name: string;
  description: string;
  criteriaDescription: string;
  earned: boolean;
  earnedAt: Date | null;
}

type AchievementRow = {
  achievement_id: string | number;
  name: string;
  description: string;
  criteria_description: string;
  earned_at: Date | string | null;
};

type CountRow = {
  total: string | number;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** All achievement definitions with the user's earned rows left-joined. */
export async function listAchievementsForUser(userId: number): Promise<AchievementRecord[]> {
  try {
    const rows = await getDb().execute<AchievementRow>(sql`
      select a."achievement_id",
             a."name",
             a."description",
             a."criteria_description",
             ua."earned_at"
      from "achievements" a
      left join "user_achievements" ua
        on ua."achievement_id" = a."achievement_id"
       and ua."user_id" = ${userId}::bigint
      order by a."achievement_id" asc
    `);

    return rows.map((row) => ({
      id: Number(row.achievement_id),
      name: row.name,
      description: row.description,
      criteriaDescription: row.criteria_description,
      earned: row.earned_at !== null,
      earnedAt: row.earned_at === null ? null : toDate(row.earned_at),
    }));
  } catch (error) {
    throw mapPgError(error);
  }
}

/** Number of achievement definitions the user has earned. */
export async function countEarnedAchievements(userId: number): Promise<number> {
  try {
    const rows = await getDb().execute<CountRow>(sql`
      select count(*) as "total"
      from "user_achievements"
      where "user_id" = ${userId}::bigint
    `);

    return Number(rows[0]?.total ?? 0);
  } catch (error) {
    throw mapPgError(error);
  }
}
