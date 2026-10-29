import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";
import { adminSetBan, adminUpdateUserStats } from "@/lib/db/pg/functions";

import { cleanupFixtures, createFixtures, createUser, readUserStats } from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

async function makeAdmin(userId: number): Promise<void> {
  await sql`update users set role = 'admin' where user_id = ${userId}`;
}

async function readBanned(userId: number): Promise<boolean> {
  const rows = await sql<{ is_banned: boolean }[]>`
    select is_banned from users where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Test user not found");
  return row.is_banned;
}

async function expectAppError(query: PromiseLike<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code });
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 8: admin procedures", () => {
  it("installs CREATE PROCEDURE objects with the specified signatures", async () => {
    const rows = await sql<{ proname: string; prokind: string; args: string }[]>`
      select p.proname, p.prokind, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('admin_set_ban', 'admin_update_user_stats')
      order by p.proname
    `;

    const procedures = new Map(rows.map((row) => [row.proname, row]));

    expect(procedures.get("admin_set_ban")).toMatchObject({
      prokind: "p",
      args: "IN p_admin_id bigint, IN p_target_id bigint, IN p_banned boolean",
    });
    expect(procedures.get("admin_update_user_stats")).toMatchObject({
      prokind: "p",
      args: "IN p_admin_id bigint, IN p_target_id bigint, IN p_patch jsonb",
    });
  });

  describe("admin_set_ban", () => {
    it("rejects non-admins and leaves the target unchanged", async () => {
      const caller = await createUser(sql, fixtures);
      const target = await createUser(sql, fixtures);

      await expectAppError(
        adminSetBan({ adminId: caller, targetId: target, banned: true }),
        "FORBIDDEN",
      );
      expect(await readBanned(target)).toBe(false);

      const missingCaller = 999_999_999;
      await expectAppError(
        adminSetBan({ adminId: missingCaller, targetId: target, banned: true }),
        "FORBIDDEN",
      );
    });

    it("bans and unbans a player", async () => {
      const admin = await createUser(sql, fixtures);
      await makeAdmin(admin);
      const target = await createUser(sql, fixtures);

      await adminSetBan({ adminId: admin, targetId: target, banned: true });
      expect(await readBanned(target)).toBe(true);

      await adminSetBan({ adminId: admin, targetId: target, banned: false });
      expect(await readBanned(target)).toBe(false);
    });

    it("cannot ban self or another admin, and requires an existing target", async () => {
      const admin = await createUser(sql, fixtures);
      await makeAdmin(admin);
      const otherAdmin = await createUser(sql, fixtures);
      await makeAdmin(otherAdmin);
      const player = await createUser(sql, fixtures);

      await expectAppError(
        adminSetBan({ adminId: admin, targetId: admin, banned: true }),
        "CANNOT_BAN_ADMIN",
      );
      await expectAppError(
        adminSetBan({ adminId: admin, targetId: otherAdmin, banned: true }),
        "CANNOT_BAN_ADMIN",
      );
      await expectAppError(
        adminSetBan({ adminId: admin, targetId: 999_999_999, banned: true }),
        "USER_NOT_FOUND",
      );

      expect(await readBanned(admin)).toBe(false);
      expect(await readBanned(otherAdmin)).toBe(false);
      expect(await readBanned(player)).toBe(false);
    });
  });

  describe("admin_update_user_stats", () => {
    it("rejects non-admins and a patch with disallowed keys", async () => {
      const caller = await createUser(sql, fixtures);
      const target = await createUser(sql, fixtures);

      await expectAppError(
        adminUpdateUserStats({
          adminId: caller,
          targetId: target,
          patch: { total_games_played: 5 },
        }),
        "FORBIDDEN",
      );

      const admin = await createUser(sql, fixtures);
      await makeAdmin(admin);

      await expectAppError(
        adminUpdateUserStats({
          adminId: admin,
          targetId: target,
          patch: { total_games_played: 5, role: "admin" } as unknown as {
            total_games_played: number;
          },
        }),
        "INVALID_PATCH",
      );

      expect((await readUserStats(sql, target)).totalGamesPlayed).toBe(0);
    });

    it("applies every allowed field and supports clearing the Global PB", async () => {
      const admin = await createUser(sql, fixtures);
      await makeAdmin(admin);
      const target = await createUser(sql, fixtures);

      const achievedAt = "2026-05-01T12:34:56.000Z";

      await adminUpdateUserStats({
        adminId: admin,
        targetId: target,
        patch: {
          global_best_score: 24.5,
          global_best_achieved_at: achievedAt,
          total_games_played: 12,
          current_daily_streak: 3,
          longest_daily_streak: 7,
          last_daily_played_date: "2026-05-01",
        },
      });

      let stats = await readUserStats(sql, target);
      expect(stats).toEqual({
        globalBestScore: 24.5,
        globalBestAchievedAt: new Date(achievedAt),
        totalGamesPlayed: 12,
        currentDailyStreak: 3,
        longestDailyStreak: 7,
        lastDailyPlayedDate: "2026-05-01",
      });

      // A partial patch leaves the other columns untouched.
      await adminUpdateUserStats({
        adminId: admin,
        targetId: target,
        patch: { total_games_played: 13 },
      });

      stats = await readUserStats(sql, target);
      expect(stats.globalBestScore).toBe(24.5);
      expect(stats.totalGamesPlayed).toBe(13);

      // Both PB columns can be cleared together.
      await adminUpdateUserStats({
        adminId: admin,
        targetId: target,
        patch: { global_best_score: null, global_best_achieved_at: null },
      });

      stats = await readUserStats(sql, target);
      expect(stats.globalBestScore).toBeNull();
      expect(stats.globalBestAchievedAt).toBeNull();
    });

    it("rejects invalid values and leaves the row unchanged", async () => {
      const admin = await createUser(sql, fixtures);
      await makeAdmin(admin);
      const target = await createUser(sql, fixtures);

      await adminUpdateUserStats({
        adminId: admin,
        targetId: target,
        patch: { total_games_played: 4 },
      });

      const invalidPatches: Array<Record<string, unknown>> = [
        { global_best_score: 31 },
        { global_best_score: 20 },
        { total_games_played: -1 },
        { current_daily_streak: 5 },
        { longest_daily_streak: -1 },
        { last_daily_played_date: "not-a-date" },
        { total_games_played: null },
      ];

      for (const patch of invalidPatches) {
        await expectAppError(
          adminUpdateUserStats({
            adminId: admin,
            targetId: target,
            patch: patch as { total_games_played?: number },
          }),
          "VALIDATION_ERROR",
        );
      }

      const stats = await readUserStats(sql, target);
      expect(stats.totalGamesPlayed).toBe(4);
      expect(stats.globalBestScore).toBeNull();
      expect(stats.currentDailyStreak).toBe(0);
      expect(stats.longestDailyStreak).toBe(0);
      expect(stats.lastDailyPlayedDate).toBeNull();
    });

    it("rejects a missing target and malformed patch payloads", async () => {
      const admin = await createUser(sql, fixtures);
      await makeAdmin(admin);
      const target = await createUser(sql, fixtures);

      await expectAppError(
        adminUpdateUserStats({
          adminId: admin,
          targetId: 999_999_999,
          patch: { total_games_played: 1 },
        }),
        "USER_NOT_FOUND",
      );

      await expectAppError(
        adminUpdateUserStats({
          adminId: admin,
          targetId: target,
          patch: null as unknown as { total_games_played: number },
        }),
        "INVALID_PATCH",
      );
    });
  });
});
