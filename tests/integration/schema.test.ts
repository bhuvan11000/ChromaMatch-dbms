import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";

const sql = getSqlClient();

const TABLES = [
  "achievements",
  "challenge_colors",
  "daily_challenges",
  "daily_personal_bests",
  "room_colors",
  "room_players",
  "rooms",
  "user_achievements",
  "users",
] as const;

const COMPOSITE_PRIMARY_KEYS = {
  challenge_colors: ["daily_challenge_id", "round_number"],
  daily_personal_bests: ["user_id", "daily_challenge_id"],
  user_achievements: ["user_id", "achievement_id"],
  room_colors: ["room_id", "round_number"],
  room_players: ["room_id", "user_id"],
} as const;

function uniqueSuffix(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

async function primaryKeyColumns(table: string): Promise<string[]> {
  const rows = await sql<{ column_name: string }[]>`
    select kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.constraint_schema = tc.constraint_schema
     and kcu.table_name = tc.table_name
    where tc.constraint_type = 'PRIMARY KEY'
      and tc.table_schema = 'public'
      and tc.table_name = ${table}
    order by kcu.ordinal_position
  `;

  return rows.map((row) => row.column_name);
}

describe("PostgreSQL schema (migration 1)", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("creates all nine tables", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
    `;
    const existingTables = new Set(rows.map((row) => row.table_name));

    for (const table of TABLES) {
      expect(existingTables).toContain(table);
    }
  });

  it("defines the five composite primary keys", async () => {
    for (const [table, columns] of Object.entries(COMPOSITE_PRIMARY_KEYS)) {
      await expect(primaryKeyColumns(table)).resolves.toEqual([...columns]);
    }
  });

  it("rejects an out-of-range hue", async () => {
    await expect(
      sql.begin(async (tx) => {
        const challenge = await tx<{ daily_challenge_id: number }[]>`
          insert into daily_challenges (challenge_date)
          values ('2099-12-31')
          on conflict (challenge_date) do update
            set challenge_date = excluded.challenge_date
          returning daily_challenge_id
        `;

        await tx`
          insert into challenge_colors (daily_challenge_id, round_number, hue, saturation, value)
          values (${challenge[0].daily_challenge_id}, 1, 360.1, 50.0, 50.0)
        `;
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects an invalid role", async () => {
    const suffix = uniqueSuffix();

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into users (username, email, password_hash, role)
          values (${`role_${suffix}`}, ${`role_${suffix}@example.test`}, 'test-hash', 'moderator')
        `;
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a duplicate email", async () => {
    const suffix = uniqueSuffix();
    const email = `duplicate_${suffix}@example.test`;

    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into users (username, email, password_hash)
          values (${`dup_a_${suffix}`}, ${email}, 'test-hash')
        `;
        await tx`
          insert into users (username, email, password_hash)
          values (${`dup_b_${suffix}`}, ${email}, 'test-hash')
        `;
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
