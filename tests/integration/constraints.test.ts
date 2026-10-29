import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";

import {
  cleanupFixtures,
  createFixtures,
  createRoom,
  createUser,
  uniqueRoomCode,
  uniqueSuffix,
} from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

const CONSTRAINT_NAMES = [
  "achievements_threshold_presence_check",
  "room_players_best_pair_check",
  "rooms_status_timestamps_check",
  "users_global_best_pair_check",
  "users_longest_ge_current_check",
];

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 2: cross-column checks", () => {
  it("defines all five constraints", async () => {
    const rows = await sql<{ conname: string }[]>`
      select conname
      from pg_constraint
      where conname in ${sql(CONSTRAINT_NAMES)}
      order by conname
    `;

    expect(rows.map((row) => row.conname)).toEqual(CONSTRAINT_NAMES);
  });

  it("requires users.global_best_score and global_best_achieved_at to be null together", async () => {
    const suffix = uniqueSuffix();

    await expect(sql`
      insert into users (username, email, password_hash, global_best_score)
      values (${`pb_score_${suffix}`}, ${`pb_score_${suffix}@example.test`}, 'test-hash', 24.5)
    `).rejects.toMatchObject({ code: "23514" });

    await expect(sql`
      insert into users (username, email, password_hash, global_best_achieved_at)
      values (${`pb_time_${suffix}`}, ${`pb_time_${suffix}@example.test`}, 'test-hash', now())
    `).rejects.toMatchObject({ code: "23514" });

    const nullRows = await sql<{ user_id: number }[]>`
      insert into users (username, email, password_hash)
      values (${`pb_null_${suffix}`}, ${`pb_null_${suffix}@example.test`}, 'test-hash')
      returning user_id
    `;
    const nullUserId = Number(nullRows[0]?.user_id);
    fixtures.userIds.push(nullUserId);

    const setRows = await sql<{ user_id: number }[]>`
      insert into users (
        username, email, password_hash, global_best_score, global_best_achieved_at
      )
      values (
        ${`pb_set_${suffix}`}, ${`pb_set_${suffix}@example.test`}, 'test-hash', 24.5, now()
      )
      returning user_id
    `;
    fixtures.userIds.push(Number(setRows[0]?.user_id));

    await expect(sql`
      update users set global_best_score = 20.0 where user_id = ${nullUserId}
    `).rejects.toMatchObject({ code: "23514" });

    await expect(sql`
      update users set global_best_achieved_at = now() where user_id = ${nullUserId}
    `).rejects.toMatchObject({ code: "23514" });

    await sql`
      update users
      set global_best_score = 20.0, global_best_achieved_at = now()
      where user_id = ${nullUserId}
    `;

    await sql`
      update users
      set global_best_score = null, global_best_achieved_at = null
      where user_id = ${nullUserId}
    `;
  });

  it("requires users.longest_daily_streak to be at least current_daily_streak", async () => {
    const suffix = uniqueSuffix();

    await expect(sql`
      insert into users (
        username, email, password_hash, current_daily_streak, longest_daily_streak
      )
      values (
        ${`streak_bad_${suffix}`}, ${`streak_bad_${suffix}@example.test`}, 'test-hash', 2, 1
      )
    `).rejects.toMatchObject({ code: "23514" });

    const rows = await sql<{ user_id: number }[]>`
      insert into users (
        username, email, password_hash, current_daily_streak, longest_daily_streak
      )
      values (
        ${`streak_ok_${suffix}`}, ${`streak_ok_${suffix}@example.test`}, 'test-hash', 2, 2
      )
      returning user_id
    `;
    const userId = Number(rows[0]?.user_id);
    fixtures.userIds.push(userId);

    await expect(sql`
      update users set longest_daily_streak = 1 where user_id = ${userId}
    `).rejects.toMatchObject({ code: "23514" });

    await sql`
      update users
      set current_daily_streak = 3, longest_daily_streak = 3
      where user_id = ${userId}
    `;
  });

  it("requires room_players.best_score and best_achieved_at to be null together", async () => {
    const creatorId = await createUser(sql, fixtures);
    const memberId = await createUser(sql, fixtures);
    const roomId = await createRoom(sql, fixtures, { creatorId });

    await expect(sql`
      insert into room_players (room_id, user_id, best_score)
      values (${roomId}, ${memberId}, 20.0)
    `).rejects.toMatchObject({ code: "23514" });

    await expect(sql`
      insert into room_players (room_id, user_id, best_achieved_at)
      values (${roomId}, ${memberId}, now())
    `).rejects.toMatchObject({ code: "23514" });

    await sql`
      insert into room_players (room_id, user_id)
      values (${roomId}, ${memberId})
    `;

    await expect(sql`
      update room_players
      set best_score = 20.0
      where room_id = ${roomId} and user_id = ${memberId}
    `).rejects.toMatchObject({ code: "23514" });

    await expect(sql`
      update room_players
      set best_achieved_at = now()
      where room_id = ${roomId} and user_id = ${memberId}
    `).rejects.toMatchObject({ code: "23514" });

    await sql`
      update room_players
      set best_score = 20.0, best_achieved_at = now()
      where room_id = ${roomId} and user_id = ${memberId}
    `;

    await sql`
      update room_players
      set best_score = 21.0, best_achieved_at = now()
      where room_id = ${roomId} and user_id = ${memberId}
    `;
  });

  it("requires a threshold for counter and round achievements but not for event achievements", async () => {
    const suffix = uniqueSuffix();
    const requiredTypes = ["games_played", "daily_streak", "perfect_round"] as const;
    const optionalTypes = ["new_pb", "first_daily", "first_global"] as const;

    for (const criteriaType of requiredTypes) {
      await expect(sql`
        insert into achievements (name, description, criteria_type, criteria_description)
        values (
          ${`required_missing_${criteriaType}_${suffix}`},
          'test description',
          ${criteriaType},
          'test criteria'
        )
      `).rejects.toMatchObject({ code: "23514" });

      const rows = await sql<{ achievement_id: number }[]>`
        insert into achievements (
          name, description, criteria_type, threshold, criteria_description
        )
        values (
          ${`required_present_${criteriaType}_${suffix}`},
          'test description',
          ${criteriaType},
          5.0,
          'test criteria'
        )
        returning achievement_id
      `;
      fixtures.achievementIds.push(Number(rows[0]?.achievement_id));
    }

    for (const criteriaType of optionalTypes) {
      await expect(sql`
        insert into achievements (
          name, description, criteria_type, threshold, criteria_description
        )
        values (
          ${`optional_present_${criteriaType}_${suffix}`},
          'test description',
          ${criteriaType},
          5.0,
          'test criteria'
        )
      `).rejects.toMatchObject({ code: "23514" });

      const rows = await sql<{ achievement_id: number }[]>`
        insert into achievements (name, description, criteria_type, criteria_description)
        values (
          ${`optional_missing_${criteriaType}_${suffix}`},
          'test description',
          ${criteriaType},
          'test criteria'
        )
        returning achievement_id
      `;
      fixtures.achievementIds.push(Number(rows[0]?.achievement_id));
    }
  });

  it("keeps rooms.started_at and ended_at consistent with status", async () => {
    const creatorId = await createUser(sql, fixtures);

    async function insertRoom(
      status: "lobby" | "in_progress" | "finished" | "cancelled",
      startedAt: string | null,
      endedAt: string | null,
    ) {
      return sql<{ room_id: number }[]>`
        insert into rooms (
          room_code, creator_id, room_size, attempts_limit, status, started_at, ended_at
        )
        values (
          ${uniqueRoomCode()}, ${creatorId}, 2, 3, ${status}, ${startedAt}, ${endedAt}
        )
        returning room_id
      `;
    }

    const lobby = await insertRoom("lobby", null, null);
    fixtures.roomIds.push(Number(lobby[0]?.room_id));

    await expect(insertRoom("lobby", "2026-01-01T00:00:00Z", null)).rejects.toMatchObject({
      code: "23514",
    });

    await expect(insertRoom("lobby", null, "2026-01-01T00:00:00Z")).rejects.toMatchObject({
      code: "23514",
    });

    const inProgress = await insertRoom("in_progress", "2026-01-01T00:00:00Z", null);
    fixtures.roomIds.push(Number(inProgress[0]?.room_id));

    await expect(insertRoom("in_progress", null, null)).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      insertRoom("in_progress", "2026-01-01T00:00:00Z", "2026-01-01T00:10:00Z"),
    ).rejects.toMatchObject({ code: "23514" });

    const finished = await insertRoom("finished", "2026-01-01T00:00:00Z", "2026-01-01T00:10:00Z");
    fixtures.roomIds.push(Number(finished[0]?.room_id));

    await expect(insertRoom("finished", "2026-01-01T00:00:00Z", null)).rejects.toMatchObject({
      code: "23514",
    });

    await expect(insertRoom("finished", null, "2026-01-01T00:10:00Z")).rejects.toMatchObject({
      code: "23514",
    });

    const cancelled = await insertRoom("cancelled", null, "2026-01-01T00:10:00Z");
    fixtures.roomIds.push(Number(cancelled[0]?.room_id));

    await expect(insertRoom("cancelled", null, null)).rejects.toMatchObject({
      code: "23514",
    });

    await expect(
      insertRoom("cancelled", "2026-01-01T00:00:00Z", "2026-01-01T00:10:00Z"),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
