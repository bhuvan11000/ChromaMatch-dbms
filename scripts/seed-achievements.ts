import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

/**
 * Seeds the achievement definitions from Architecture §8.2.
 *
 * Idempotent: upserts by unique `name`, preserving achievement ids so existing
 * `user_achievements` rows stay valid. Uses the direct/session connection
 * (`DATABASE_URL_DIRECT`) per Architecture §5.8.1.
 */

export type AchievementCriteriaType =
  "games_played" | "daily_streak" | "perfect_round" | "new_pb" | "first_daily" | "first_global";

export interface AchievementSeed {
  name: string;
  description: string;
  criteriaType: AchievementCriteriaType;
  threshold: number | null;
  criteriaDescription: string;
}

export const ACHIEVEMENT_SEED: readonly AchievementSeed[] = [
  {
    name: "First Global Game",
    description: "Complete your first Global game.",
    criteriaType: "first_global",
    threshold: null,
    criteriaDescription: "Complete your first Global game.",
  },
  {
    name: "First Daily Game",
    description: "Complete your first Daily game.",
    criteriaType: "first_daily",
    threshold: null,
    criteriaDescription: "Complete your first Daily game.",
  },
  {
    name: "Warming Up",
    description: "Complete 10 games (Global + Daily).",
    criteriaType: "games_played",
    threshold: 10,
    criteriaDescription: "Complete 10 games (Global + Daily).",
  },
  {
    name: "Regular",
    description: "Complete 50 games.",
    criteriaType: "games_played",
    threshold: 50,
    criteriaDescription: "Complete 50 games.",
  },
  {
    name: "Centurion",
    description: "Complete 100 games.",
    criteriaType: "games_played",
    threshold: 100,
    criteriaDescription: "Complete 100 games.",
  },
  {
    name: "Sharp Eye",
    description: "Score 9.5 or more in a single round.",
    criteriaType: "perfect_round",
    threshold: 9.5,
    criteriaDescription: "Score 9.5 or more in a single round.",
  },
  {
    name: "Perfect Match",
    description: "Score a perfect 10.0 in a single round.",
    criteriaType: "perfect_round",
    threshold: 10.0,
    criteriaDescription: "Score a perfect 10.0 in a single round.",
  },
  {
    name: "Personal Best",
    description: "Beat your existing personal best (Global or Daily).",
    criteriaType: "new_pb",
    threshold: null,
    criteriaDescription: "Beat your existing personal best (Global or Daily).",
  },
  {
    name: "On a Roll",
    description: "Play the Daily challenge 3 days in a row.",
    criteriaType: "daily_streak",
    threshold: 3,
    criteriaDescription: "Play the Daily challenge 3 days in a row.",
  },
  {
    name: "Week Warrior",
    description: "Play the Daily challenge 7 days in a row.",
    criteriaType: "daily_streak",
    threshold: 7,
    criteriaDescription: "Play the Daily challenge 7 days in a row.",
  },
  {
    name: "Monthly Master",
    description: "Play the Daily challenge 30 days in a row.",
    criteriaType: "daily_streak",
    threshold: 30,
    criteriaDescription: "Play the Daily challenge 30 days in a row.",
  },
];

type SqlClient = ReturnType<typeof postgres>;

export async function seedAchievements(sql: SqlClient): Promise<number> {
  await sql.begin(async (tx) => {
    for (const achievement of ACHIEVEMENT_SEED) {
      await tx`
        insert into achievements (
          name, description, criteria_type, threshold, criteria_description
        )
        values (
          ${achievement.name},
          ${achievement.description},
          ${achievement.criteriaType},
          ${achievement.threshold},
          ${achievement.criteriaDescription}
        )
        on conflict (name) do update set
          description = excluded.description,
          criteria_type = excluded.criteria_type,
          threshold = excluded.threshold,
          criteria_description = excluded.criteria_description
      `;
    }
  });

  return ACHIEVEMENT_SEED.length;
}

function getDirectDatabaseUrl(): string | null {
  if (!process.env.DATABASE_URL_DIRECT && existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const url = process.env.DATABASE_URL_DIRECT;
  return url && url.trim() !== "" ? url : null;
}

async function main(): Promise<void> {
  const url = getDirectDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL_DIRECT is required to seed achievements.");
    process.exitCode = 1;
    return;
  }

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: process.env.NODE_ENV === "production" ? "require" : false,
  });

  try {
    const count = await seedAchievements(sql);
    console.log(`Seeded ${count} achievement definitions.`);
  } catch (error) {
    console.error(
      "Failed to seed achievements:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
