import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";

import {
  addRoomPlayer,
  cleanupFixtures,
  createFixtures,
  createRoom,
  createUser,
} from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

async function expectDomainError(query: PromiseLike<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code: "CM000", message: code });
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 4: room triggers", () => {
  it("installs the three triggers on the expected tables", async () => {
    const rows = await sql<{ tgname: string; table_name: string }[]>`
      select t.tgname, c.relname as table_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal
        and t.tgname in (
          'trg_room_players_before_insert',
          'trg_room_players_before_update',
          'trg_rooms_before_update'
        )
      order by t.tgname
    `;

    expect(rows).toEqual([
      { tgname: "trg_room_players_before_insert", table_name: "room_players" },
      { tgname: "trg_room_players_before_update", table_name: "room_players" },
      { tgname: "trg_rooms_before_update", table_name: "rooms" },
    ]);
  });

  describe("trg_room_players_before_insert", () => {
    it("allows joining a lobby below capacity", async () => {
      const creatorId = await createUser(sql, fixtures);
      const memberId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, { creatorId, roomSize: 2 });

      await addRoomPlayer(sql, roomId, memberId);

      const rows = await sql<{ count: string }[]>`
        select count(*) from room_players where room_id = ${roomId}
      `;
      expect(Number(rows[0]?.count)).toBe(2);
    });

    it("rejects joining a room that is not in the lobby", async () => {
      const creatorId = await createUser(sql, fixtures);
      const memberId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
      });

      await expectDomainError(addRoomPlayer(sql, roomId, memberId), "ROOM_NOT_LOBBY");
    });

    it("rejects joining a full room", async () => {
      const creatorId = await createUser(sql, fixtures);
      const secondId = await createUser(sql, fixtures);
      const thirdId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, { creatorId, roomSize: 2 });

      await addRoomPlayer(sql, roomId, secondId);
      await expectDomainError(addRoomPlayer(sql, roomId, thirdId), "ROOM_FULL");
    });

    it("allows only one of two simultaneous joins for the last slot", async () => {
      const creatorId = await createUser(sql, fixtures);
      const secondId = await createUser(sql, fixtures);
      const thirdId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, { creatorId, roomSize: 2 });

      const results = await Promise.allSettled([
        addRoomPlayer(sql, roomId, secondId),
        addRoomPlayer(sql, roomId, thirdId),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({
        code: "CM000",
        message: "ROOM_FULL",
      });
    });
  });

  describe("trg_room_players_before_update", () => {
    it("allows attempts within the limit, forward status changes and increasing best scores", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
        attemptsLimit: 3,
      });

      await sql`
        update room_players
        set attempts_used = 1, best_score = 20.0, best_achieved_at = now()
        where room_id = ${roomId} and user_id = ${creatorId}
      `;
      await sql`
        update room_players
        set attempts_used = 2, best_score = 21.0, best_achieved_at = now()
        where room_id = ${roomId} and user_id = ${creatorId}
      `;
      await sql`
        update room_players
        set attempts_used = 3, status = 'finished'
        where room_id = ${roomId} and user_id = ${creatorId}
      `;

      const rows = await sql<{ attempts_used: number; status: string; best_score: string }[]>`
        select attempts_used, status, best_score
        from room_players
        where room_id = ${roomId} and user_id = ${creatorId}
      `;

      expect(rows[0]?.attempts_used).toBe(3);
      expect(rows[0]?.status).toBe("finished");
      expect(Number(rows[0]?.best_score)).toBe(21);
    });

    it("rejects attempts_used above the room limit", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
        attemptsLimit: 3,
      });

      await expectDomainError(
        sql`
          update room_players
          set attempts_used = 4
          where room_id = ${roomId} and user_id = ${creatorId}
        `,
        "ATTEMPTS_EXHAUSTED",
      );
    });

    it("rejects increasing attempts_used after the member is no longer active", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
        attemptsLimit: 3,
      });

      await sql`
        update room_players
        set status = 'left'
        where room_id = ${roomId} and user_id = ${creatorId}
      `;

      await expectDomainError(
        sql`
          update room_players
          set attempts_used = 1
          where room_id = ${roomId} and user_id = ${creatorId}
        `,
        "MEMBER_NOT_ACTIVE",
      );
    });

    it("rejects moving a member status backwards or sideways", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
        attemptsLimit: 3,
      });

      await sql`
        update room_players
        set status = 'finished'
        where room_id = ${roomId} and user_id = ${creatorId}
      `;

      await expectDomainError(
        sql`
          update room_players
          set status = 'active'
          where room_id = ${roomId} and user_id = ${creatorId}
        `,
        "MEMBER_NOT_ACTIVE",
      );

      await expectDomainError(
        sql`
          update room_players
          set status = 'left'
          where room_id = ${roomId} and user_id = ${creatorId}
        `,
        "MEMBER_NOT_ACTIVE",
      );
    });

    it("rejects decreasing or clearing best_score", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
        attemptsLimit: 3,
      });

      await sql`
        update room_players
        set best_score = 20.0, best_achieved_at = now()
        where room_id = ${roomId} and user_id = ${creatorId}
      `;

      await expectDomainError(
        sql`
          update room_players
          set best_score = 19.9
          where room_id = ${roomId} and user_id = ${creatorId}
        `,
        "VALIDATION_ERROR",
      );

      await expectDomainError(
        sql`
          update room_players
          set best_score = null, best_achieved_at = null
          where room_id = ${roomId} and user_id = ${creatorId}
        `,
        "VALIDATION_ERROR",
      );
    });
  });

  describe("trg_rooms_before_update", () => {
    it("allows lobby -> in_progress with started_at", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, { creatorId });

      await sql`
        update rooms
        set status = 'in_progress', started_at = now()
        where room_id = ${roomId}
      `;

      const rows = await sql<{ status: string; started_at: Date | null; ended_at: Date | null }[]>`
        select status, started_at, ended_at from rooms where room_id = ${roomId}
      `;

      expect(rows[0]?.status).toBe("in_progress");
      expect(rows[0]?.started_at).not.toBeNull();
      expect(rows[0]?.ended_at).toBeNull();
    });

    it("allows in_progress -> finished with ended_at", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
      });

      await sql`
        update rooms
        set status = 'finished', ended_at = now()
        where room_id = ${roomId}
      `;

      const rows = await sql<{ status: string; started_at: Date | null; ended_at: Date | null }[]>`
        select status, started_at, ended_at from rooms where room_id = ${roomId}
      `;

      expect(rows[0]?.status).toBe("finished");
      expect(rows[0]?.started_at).not.toBeNull();
      expect(rows[0]?.ended_at).not.toBeNull();
    });

    it("allows lobby -> cancelled with ended_at", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, { creatorId });

      await sql`
        update rooms
        set status = 'cancelled', ended_at = now()
        where room_id = ${roomId}
      `;

      const rows = await sql<{ status: string; started_at: Date | null; ended_at: Date | null }[]>`
        select status, started_at, ended_at from rooms where room_id = ${roomId}
      `;

      expect(rows[0]?.status).toBe("cancelled");
      expect(rows[0]?.started_at).toBeNull();
      expect(rows[0]?.ended_at).not.toBeNull();
    });

    it("allows a non-status update while the room stays in the lobby", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, { creatorId, roomSize: 2 });

      await sql`update rooms set room_size = 3 where room_id = ${roomId}`;

      const rows = await sql<{ room_size: number }[]>`
        select room_size from rooms where room_id = ${roomId}
      `;
      expect(rows[0]?.room_size).toBe(3);
    });

    it("rejects moving the room status backwards", async () => {
      const creatorId = await createUser(sql, fixtures);
      const roomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
      });

      await expectDomainError(
        sql`
          update rooms
          set status = 'lobby', started_at = null, ended_at = null
          where room_id = ${roomId}
        `,
        "VALIDATION_ERROR",
      );
    });

    it("rejects invalid room status transitions", async () => {
      const creatorId = await createUser(sql, fixtures);
      const lobbyRoomId = await createRoom(sql, fixtures, { creatorId });

      await expectDomainError(
        sql`
          update rooms
          set status = 'finished', started_at = now(), ended_at = now()
          where room_id = ${lobbyRoomId}
        `,
        "VALIDATION_ERROR",
      );

      const finishedRoomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "finished",
      });

      await expectDomainError(
        sql`
          update rooms
          set status = 'in_progress', ended_at = null
          where room_id = ${finishedRoomId}
        `,
        "VALIDATION_ERROR",
      );

      const cancelledRoomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "cancelled",
      });

      await expectDomainError(
        sql`
          update rooms
          set status = 'in_progress', started_at = now()
          where room_id = ${cancelledRoomId}
        `,
        "VALIDATION_ERROR",
      );

      const inProgressRoomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
      });

      await expectDomainError(
        sql`
          update rooms
          set status = 'cancelled', ended_at = now()
          where room_id = ${inProgressRoomId}
        `,
        "VALIDATION_ERROR",
      );
    });

    it("rejects timestamps that do not match the room status", async () => {
      const creatorId = await createUser(sql, fixtures);

      const lobbyRoomId = await createRoom(sql, fixtures, { creatorId });
      await expectDomainError(
        sql`
          update rooms
          set status = 'in_progress'
          where room_id = ${lobbyRoomId}
        `,
        "VALIDATION_ERROR",
      );

      const inProgressRoomId = await createRoom(sql, fixtures, {
        creatorId,
        status: "in_progress",
      });
      await expectDomainError(
        sql`
          update rooms
          set status = 'finished'
          where room_id = ${inProgressRoomId}
        `,
        "VALIDATION_ERROR",
      );

      const cancelledRoomId = await createRoom(sql, fixtures, { creatorId });
      await expectDomainError(
        sql`
          update rooms
          set status = 'cancelled'
          where room_id = ${cancelledRoomId}
        `,
        "VALIDATION_ERROR",
      );

      const cancelledWithStartRoomId = await createRoom(sql, fixtures, { creatorId });
      await expectDomainError(
        sql`
          update rooms
          set status = 'cancelled', started_at = now(), ended_at = now()
          where room_id = ${cancelledWithStartRoomId}
        `,
        "VALIDATION_ERROR",
      );

      const startedWithEndRoomId = await createRoom(sql, fixtures, { creatorId });
      await expectDomainError(
        sql`
          update rooms
          set status = 'in_progress', started_at = now(), ended_at = now()
          where room_id = ${startedWithEndRoomId}
        `,
        "VALIDATION_ERROR",
      );
    });
  });
});
