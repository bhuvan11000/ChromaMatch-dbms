import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";
import { ensureDailyChallenge } from "@/lib/db/pg/functions";

import {
  cleanupFixtures,
  createFixtures,
  readChallengeColors,
  type ChallengeColor,
} from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

const COLORS_A = [
  { h: 10.0, s: 20.0, v: 30.0 },
  { h: 120.0, s: 60.0, v: 70.0 },
  { h: 300.0, s: 40.0, v: 30.0 },
] as const;

const COLORS_B = [
  { h: 200.0, s: 10.0, v: 90.0 },
  { h: 20.0, s: 80.0, v: 20.0 },
  { h: 350.0, s: 50.0, v: 50.0 },
] as const;

async function getTodayUtc(): Promise<string> {
  const rows = await sql<{ today: string }[]>`
    select (now() at time zone 'utc')::date::text as today
  `;
  const today = rows[0]?.today;
  if (!today) throw new Error("Could not read current UTC date");
  return today;
}

async function findChallengeId(date: string): Promise<number | null> {
  const rows = await sql<{ daily_challenge_id: number }[]>`
    select daily_challenge_id
    from daily_challenges
    where challenge_date = ${date}::date
  `;
  const id = rows[0]?.daily_challenge_id;
  return id === undefined ? null : Number(id);
}

async function expectDomainError(query: PromiseLike<unknown>, code: string): Promise<void> {
  await expect(query).rejects.toMatchObject({ code: "CM000", message: code });
}

function colorSignature(colors: ChallengeColor[]): Array<{ h: number; s: number; v: number }> {
  return colors.map(({ h, s, v }) => ({ h, s, v }));
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("migration 6: ensure_daily_challenge", () => {
  it("installs the function with the specified signature", async () => {
    const rows = await sql<{ args: string }[]>`
      select pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'ensure_daily_challenge'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.args).toBe("p_date date, p_colors jsonb");
  });

  it("creates one challenge with exactly 3 colors and does not overwrite them on a second call", async () => {
    const today = await getTodayUtc();
    const existingId = await findChallengeId(today);
    const existingColors = existingId === null ? null : await readChallengeColors(sql, existingId);

    const challengeId = await ensureDailyChallenge(today, COLORS_A);
    expect(Number.isSafeInteger(challengeId)).toBe(true);

    const afterFirst = await readChallengeColors(sql, challengeId);
    expect(afterFirst).toHaveLength(3);
    expect(afterFirst.map((color) => color.roundNumber)).toEqual([1, 2, 3]);

    if (existingId === null) {
      expect(colorSignature(afterFirst)).toEqual(COLORS_A);
      fixtures.challengeIds.push(challengeId);
    } else {
      expect(challengeId).toBe(existingId);
      expect(colorSignature(afterFirst)).toEqual(colorSignature(existingColors ?? []));
    }

    const secondId = await ensureDailyChallenge(today, COLORS_B);
    expect(secondId).toBe(challengeId);
    const afterSecond = await readChallengeColors(sql, challengeId);
    expect(afterSecond).toHaveLength(3);
    expect(colorSignature(afterSecond)).toEqual(colorSignature(afterFirst));
  });

  it("is race-safe: 10 parallel calls yield one challenge with exactly 3 colors", async () => {
    const today = await getTodayUtc();
    const existed = (await findChallengeId(today)) !== null;

    const ids = await Promise.all(
      Array.from({ length: 10 }, () => ensureDailyChallenge(today, COLORS_A)),
    );

    expect(new Set(ids).size).toBe(1);
    const challengeId = ids[0];
    expect(challengeId).toBeDefined();
    if (challengeId === undefined) throw new Error("No challenge id returned");

    const challenges = await sql<{ count: string }[]>`
      select count(*)
      from daily_challenges
      where challenge_date = ${today}::date
    `;
    expect(Number(challenges[0]?.count)).toBe(1);

    const colors = await readChallengeColors(sql, challengeId);
    expect(colors).toHaveLength(3);
    expect(colors.map((color) => color.roundNumber)).toEqual([1, 2, 3]);

    if (!existed) {
      fixtures.challengeIds.push(challengeId);
    }
  });

  it("rejects dates other than the current UTC date", async () => {
    const today = await getTodayUtc();
    const yesterday = new Date(`${today}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const tomorrow = new Date(`${today}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    await expect(
      ensureDailyChallenge(yesterday.toISOString().slice(0, 10), COLORS_A),
    ).rejects.toMatchObject({ code: "INVALID_DATE", status: 400 });

    await expect(
      ensureDailyChallenge(tomorrow.toISOString().slice(0, 10), COLORS_A),
    ).rejects.toMatchObject({ code: "INVALID_DATE", status: 400 });

    await expectDomainError(
      sql`select ensure_daily_challenge(null, ${JSON.stringify(COLORS_A)}::jsonb)`,
      "INVALID_DATE",
    );
  });

  it("rejects malformed color payloads", async () => {
    const today = await getTodayUtc();

    const badPayloads = [
      [],
      [{ h: 10, s: 20 }],
      [{ h: 361, s: 20, v: 30 }, COLORS_A[1], COLORS_A[2]],
      [{ h: 10, s: -1, v: 30 }, COLORS_A[1], COLORS_A[2]],
      [{ h: "10", s: 20, v: 30 }, COLORS_A[1], COLORS_A[2]],
      [{ h: 10, s: 20, v: 30 }, null, COLORS_A[2]],
      "not-an-array",
    ];

    for (const payload of badPayloads) {
      await expectDomainError(
        sql`select ensure_daily_challenge(${today}::date, ${JSON.stringify(payload)}::jsonb)`,
        "VALIDATION_ERROR",
      );
    }
  });
});
