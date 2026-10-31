import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";
import { utcDateString } from "@/lib/domain/time";
import { getDaily, getGlobal } from "@/lib/services/leaderboardService";

import {
  addDailyBest,
  banUser,
  cleanupFixtures,
  createChallenge,
  createFixtures,
  createUser,
  setGlobalBest,
} from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();
const NOW = new Date("2026-10-31T12:00:00.000Z");

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("leaderboardService against the real views", () => {
  it("reads Global entries in deterministic order, excludes banned players, paginates and returns me", async () => {
    const top = await createUser(sql, fixtures);
    const earlier = await createUser(sql, fixtures);
    const firstTie = await createUser(sql, fixtures);
    const secondTie = await createUser(sql, fixtures);
    const later = await createUser(sql, fixtures);
    const banned = await createUser(sql, fixtures);
    const noPb = await createUser(sql, fixtures);

    await setGlobalBest(sql, top, 30, "2000-01-01T09:00:00.000Z");
    await setGlobalBest(sql, earlier, 25, "2000-01-01T08:00:00.000Z");
    await setGlobalBest(sql, firstTie, 25, "2000-01-01T10:00:00.000Z");
    await setGlobalBest(sql, secondTie, 25, "2000-01-01T10:00:00.000Z");
    await setGlobalBest(sql, later, 25, "2000-01-01T11:00:00.000Z");
    await setGlobalBest(sql, banned, 30, "2000-01-01T07:00:00.000Z");
    await banUser(sql, banned);

    const ids = new Set([top, earlier, firstTie, secondTie, later, banned, noPb]);
    const board = await getGlobal({ limit: 100, offset: 0 }, later);
    const ours = board.entries.filter((entry) => ids.has(entry.userId));

    expect(ours.map((entry) => entry.userId)).toEqual([top, earlier, firstTie, secondTie, later]);
    expect(ours.map((entry) => entry.rank)).toEqual(
      [...ours.map((entry) => entry.rank)].sort((a, b) => a - b),
    );
    expect(board.entries.some((entry) => entry.userId === banned)).toBe(false);
    expect(board.entries.some((entry) => entry.userId === noPb)).toBe(false);
    expect(board.me).toEqual({ rank: ours[4]?.rank, score: 25 });
    expect(board.total).toBeGreaterThanOrEqual(ours.length);

    const bannedBoard = await getGlobal({ limit: 100, offset: 0 }, banned);
    expect(bannedBoard.me).toBeNull();

    const noPbBoard = await getGlobal({ limit: 100, offset: 0 }, noPb);
    expect(noPbBoard.me).toBeNull();

    const full = await getGlobal({ limit: 4, offset: 0 });
    const firstPage = await getGlobal({ limit: 2, offset: 0 });
    const secondPage = await getGlobal({ limit: 2, offset: 2 });

    expect(firstPage.total).toBe(full.total);
    expect(firstPage.entries).toEqual(full.entries.slice(0, 2));
    expect(secondPage.entries).toEqual(full.entries.slice(2, 4));
    expect(firstPage.entries).toHaveLength(2);
    expect(secondPage.entries).toHaveLength(2);
  });

  it("reads Daily entries, excludes banned players, paginates and returns me", async () => {
    const day = await createChallenge(sql, fixtures, "1800-01-01");

    const earlier = await createUser(sql, fixtures);
    const tieA = await createUser(sql, fixtures);
    const tieB = await createUser(sql, fixtures);
    const later = await createUser(sql, fixtures);
    const banned = await createUser(sql, fixtures);
    const noScore = await createUser(sql, fixtures);

    await addDailyBest(sql, earlier, day.challengeId, 20, "2026-02-01T08:00:00.000Z");
    await addDailyBest(sql, tieA, day.challengeId, 20, "2026-02-01T10:00:00.000Z");
    await addDailyBest(sql, tieB, day.challengeId, 20, "2026-02-01T10:00:00.000Z");
    await addDailyBest(sql, later, day.challengeId, 20, "2026-02-01T11:00:00.000Z");
    await addDailyBest(sql, banned, day.challengeId, 30, "2026-02-01T07:00:00.000Z");
    await banUser(sql, banned);

    const ids = new Set([earlier, tieA, tieB, later, banned, noScore]);
    const board = await getDaily({ date: day.date, limit: 100, offset: 0 }, later, NOW);
    const ours = board.entries.filter((entry) => ids.has(entry.userId));

    expect(board.date).toBe(day.date);
    expect(ours.map((entry) => entry.userId)).toEqual([earlier, tieA, tieB, later]);
    expect(ours.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
    expect(board.entries.some((entry) => entry.userId === banned)).toBe(false);
    expect(board.entries.some((entry) => entry.userId === noScore)).toBe(false);
    expect(board.me).toEqual({ rank: 4, score: 20 });
    expect(board.total).toBe(4);

    const bannedBoard = await getDaily({ date: day.date, limit: 50, offset: 0 }, banned, NOW);
    expect(bannedBoard.me).toBeNull();

    const full = await getDaily({ date: day.date, limit: 4, offset: 0 }, undefined, NOW);
    const firstPage = await getDaily({ date: day.date, limit: 2, offset: 0 }, undefined, NOW);
    const secondPage = await getDaily({ date: day.date, limit: 2, offset: 2 }, undefined, NOW);

    expect(firstPage.entries).toEqual(full.entries.slice(0, 2));
    expect(secondPage.entries).toEqual(full.entries.slice(2, 4));
  });

  it("defaults Daily to today UTC and returns an empty page when the challenge does not exist", async () => {
    const today = await getDaily({ limit: 50, offset: 0 }, undefined, NOW);
    expect(today.date).toBe(utcDateString(NOW));

    const missing = await getDaily({ date: "0001-01-01", limit: 50, offset: 0 }, undefined, NOW);
    expect(missing).toEqual({
      entries: [],
      total: 0,
      me: null,
      date: "0001-01-01",
    });
  });

  it("rejects future and impossible Daily dates with INVALID_DATE", async () => {
    await expect(
      getDaily({ date: "2999-01-01", limit: 50, offset: 0 }, undefined, NOW),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });

    await expect(
      getDaily({ date: "2026-02-30", limit: 50, offset: 0 }, undefined, NOW),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });

    await expect(
      getDaily({ date: "not-a-date", limit: 50, offset: 0 }, undefined, NOW),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });
  });
});
