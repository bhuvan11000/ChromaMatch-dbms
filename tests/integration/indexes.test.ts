import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";

import { cleanupFixtures, createFixtures, uniqueSuffix } from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

const INDEX_NAMES = [
  "daily_personal_bests_daily_challenge_score_idx",
  "room_players_room_score_idx",
  "room_players_user_id_idx",
  "rooms_status_idx",
  "users_global_best_score_idx",
  "users_username_lower_key",
];

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 3: indexes", () => {
  it("creates the leaderboard, scoreboard and lookup indexes", async () => {
    const rows = await sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
        and indexname in ${sql(INDEX_NAMES)}
      order by indexname
    `;

    expect(rows.map((row) => row.indexname)).toEqual(INDEX_NAMES);

    const definitions = new Map(rows.map((row) => [row.indexname, row.indexdef]));

    const globalBest = definitions.get("users_global_best_score_idx") ?? "";
    expect(globalBest).toContain("global_best_score DESC");
    expect(globalBest.toLowerCase()).toContain("is_banned");
    expect(globalBest).toContain("global_best_score IS NOT NULL");
    expect(globalBest).toContain("WHERE");

    expect(definitions.get("daily_personal_bests_daily_challenge_score_idx")).toContain(
      "(daily_challenge_id, best_score DESC)",
    );
    expect(definitions.get("room_players_room_score_idx")).toContain("(room_id, best_score DESC)");
    expect(definitions.get("room_players_user_id_idx")).toContain("(user_id)");
    expect(definitions.get("rooms_status_idx")).toContain("(status)");

    const usernameLower = definitions.get("users_username_lower_key") ?? "";
    expect(usernameLower).toContain("CREATE UNIQUE INDEX");
    expect(usernameLower).toContain("lower");
    expect(usernameLower).toContain("username");
  });

  it("enforces case-insensitive username uniqueness", async () => {
    const suffix = uniqueSuffix();
    const username = `Alpha_${suffix}`;

    const rows = await sql<{ user_id: number }[]>`
      insert into users (username, email, password_hash)
      values (${username}, ${`alpha_${suffix}@example.test`}, 'test-hash')
      returning user_id
    `;
    fixtures.userIds.push(Number(rows[0]?.user_id));

    await expect(sql`
      insert into users (username, email, password_hash)
      values (${`alpha_${suffix}`}, ${`alpha_second_${suffix}@example.test`}, 'test-hash')
    `).rejects.toMatchObject({
      code: "23505",
      constraint_name: "users_username_lower_key",
    });
  });
});
