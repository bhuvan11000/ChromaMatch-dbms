import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";

import { ACHIEVEMENT_SEED, seedAchievements } from "../../scripts/seed-achievements";
import { promoteAdmin } from "../../scripts/seed-admin";
import { cleanupFixtures, createFixtures, createUser } from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("seed scripts", () => {
  it("seeds the proposed achievements idempotently and preserves their ids", async () => {
    const names = ACHIEVEMENT_SEED.map((achievement) => achievement.name);

    expect(await seedAchievements(sql)).toBe(ACHIEVEMENT_SEED.length);

    const firstRows = await sql<
      { achievement_id: number; name: string; criteria_type: string; threshold: string | null }[]
    >`
      select achievement_id, name, criteria_type, threshold
      from achievements
      where name in ${sql(names)}
      order by name
    `;

    expect(firstRows).toHaveLength(ACHIEVEMENT_SEED.length);
    const firstIds = new Map(firstRows.map((row) => [row.name, Number(row.achievement_id)]));

    expect(await seedAchievements(sql)).toBe(ACHIEVEMENT_SEED.length);

    const secondRows = await sql<{ achievement_id: number; name: string }[]>`
      select achievement_id, name
      from achievements
      where name in ${sql(names)}
      order by name
    `;

    expect(secondRows).toHaveLength(ACHIEVEMENT_SEED.length);
    for (const row of secondRows) {
      expect(Number(row.achievement_id)).toBe(firstIds.get(row.name));
    }

    const byName = new Map(firstRows.map((row) => [row.name, row]));
    expect(byName.get("First Global Game")?.criteria_type).toBe("first_global");
    expect(byName.get("First Global Game")?.threshold).toBeNull();
    expect(byName.get("Sharp Eye")?.criteria_type).toBe("perfect_round");
    expect(Number(byName.get("Sharp Eye")?.threshold)).toBe(9.5);
    expect(byName.get("Perfect Match")?.criteria_type).toBe("perfect_round");
    expect(Number(byName.get("Perfect Match")?.threshold)).toBe(10.0);
    expect(byName.get("Week Warrior")?.criteria_type).toBe("daily_streak");
    expect(Number(byName.get("Week Warrior")?.threshold)).toBe(7);
  });

  it("promotes an existing user by case-insensitive email, idempotently", async () => {
    const userId = await createUser(sql, fixtures);
    const rows = await sql<{ email: string }[]>`
      select email from users where user_id = ${userId}
    `;
    const email = rows[0]?.email;
    if (!email) throw new Error("Missing test email");

    const first = await promoteAdmin(sql, email.toUpperCase());
    expect(first?.userId).toBe(userId);

    const roleRows = await sql<{ role: string }[]>`
      select role from users where user_id = ${userId}
    `;
    expect(roleRows[0]?.role).toBe("admin");

    const second = await promoteAdmin(sql, email);
    expect(second?.userId).toBe(userId);
  });

  it("returns null for an unknown email", async () => {
    expect(await promoteAdmin(sql, "missing-user@example.test")).toBeNull();
  });
});
