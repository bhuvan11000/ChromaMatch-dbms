import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findChallengeByDate: vi.fn(),
  listChallengeColors: vi.fn(),
  findDailyBest: vi.fn(),
  findUserDailyStreak: vi.fn(),
  ensureDailyChallenge: vi.fn(),
  generateDailyColors: vi.fn(),
}));

vi.mock("@/lib/db/pg/queries/daily", () => ({
  findChallengeByDate: mocks.findChallengeByDate,
  listChallengeColors: mocks.listChallengeColors,
  findDailyBest: mocks.findDailyBest,
  findUserDailyStreak: mocks.findUserDailyStreak,
}));

vi.mock("@/lib/db/pg/functions", () => ({
  ensureDailyChallenge: mocks.ensureDailyChallenge,
}));

vi.mock("@/lib/domain/colors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain/colors")>();
  return { ...actual, generateDailyColors: mocks.generateDailyColors };
});

import { AUTH_TEST_ENV, resetAuthEnv, stubAuthEnv } from "../support/auth";
import {
  getChallengeByDate,
  getOrCreateToday,
  getTodaySummary,
} from "@/lib/services/dailyChallengeService";

const NOW = new Date("2026-10-29T09:15:00.000Z");
const TODAY = "2026-10-29";

const GENERATED = [
  { h: 1, s: 2, v: 3 },
  { h: 4, s: 5, v: 6 },
  { h: 7, s: 8, v: 9 },
] as const;

const STORED = [
  { h: 214.6, s: 62, v: 80.5 },
  { h: 12, s: 90, v: 70 },
  { h: 301.3, s: 45.5, v: 33 },
] as const;

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.generateDailyColors.mockReturnValue([...GENERATED]);
});

describe("getOrCreateToday", () => {
  it("returns the stored challenge without generating or ensuring", async () => {
    mocks.findChallengeByDate.mockResolvedValue({ challengeId: 118, date: TODAY });
    mocks.listChallengeColors.mockResolvedValue([...STORED]);

    const result = await getOrCreateToday(NOW);

    expect(result).toEqual({ challengeId: 118, date: TODAY, colors: [...STORED] });
    expect(mocks.findChallengeByDate).toHaveBeenCalledWith(TODAY);
    expect(mocks.generateDailyColors).not.toHaveBeenCalled();
    expect(mocks.ensureDailyChallenge).not.toHaveBeenCalled();
  });

  it("generates, ensures and re-reads the stored colours when missing", async () => {
    mocks.findChallengeByDate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ challengeId: 119, date: TODAY });
    mocks.ensureDailyChallenge.mockResolvedValue(119);
    // Another request won the race: the stored colours differ from ours.
    mocks.listChallengeColors.mockResolvedValue([...STORED]);

    const result = await getOrCreateToday(NOW);

    expect(mocks.generateDailyColors).toHaveBeenCalledWith(TODAY, AUTH_TEST_ENV.DAILY_SEED_SECRET);
    expect(mocks.ensureDailyChallenge).toHaveBeenCalledTimes(1);
    expect(mocks.ensureDailyChallenge).toHaveBeenCalledWith(TODAY, [...GENERATED]);
    expect(mocks.findChallengeByDate).toHaveBeenCalledTimes(2);
    expect(result.colors).toEqual([...STORED]);
    expect(result.challengeId).toBe(119);
  });

  it("throws INTERNAL_ERROR when nothing is stored after ensure", async () => {
    mocks.findChallengeByDate.mockResolvedValue(null);
    mocks.ensureDailyChallenge.mockResolvedValue(120);

    await expect(getOrCreateToday(NOW)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("uses the UTC date of `now`, not the local date", async () => {
    mocks.findChallengeByDate.mockResolvedValue({ challengeId: 1, date: "2026-12-31" });
    mocks.listChallengeColors.mockResolvedValue([...STORED]);

    await getOrCreateToday(new Date("2026-12-31T23:59:59.000Z"));

    expect(mocks.findChallengeByDate).toHaveBeenCalledWith("2026-12-31");
  });
});

describe("getTodaySummary", () => {
  it("never creates a challenge and returns null myBest when there is none", async () => {
    mocks.findChallengeByDate.mockResolvedValue(null);
    mocks.findUserDailyStreak.mockResolvedValue({
      current: 0,
      longest: 0,
      lastPlayedDate: null,
    });

    const summary = await getTodaySummary(7, NOW);

    expect(summary).toEqual({
      date: TODAY,
      resetsAt: "2026-10-30T00:00:00.000Z",
      serverTime: NOW.toISOString(),
      myBest: null,
      streak: { current: 0, longest: 0 },
    });
    expect(mocks.ensureDailyChallenge).not.toHaveBeenCalled();
    expect(mocks.generateDailyColors).not.toHaveBeenCalled();
    expect(mocks.findDailyBest).not.toHaveBeenCalled();
    expect(mocks.listChallengeColors).not.toHaveBeenCalled();
  });

  it("returns null myBest when the player has not played today's challenge", async () => {
    mocks.findChallengeByDate.mockResolvedValue({ challengeId: 118, date: TODAY });
    mocks.findDailyBest.mockResolvedValue(null);
    mocks.findUserDailyStreak.mockResolvedValue({
      current: 2,
      longest: 5,
      lastPlayedDate: "2026-10-28",
    });

    const summary = await getTodaySummary(7, NOW);

    expect(mocks.findDailyBest).toHaveBeenCalledWith(7, 118);
    expect(summary.myBest).toBeNull();
    expect(summary.streak).toEqual({ current: 2, longest: 5 });
  });

  it("serializes today's best as ISO", async () => {
    mocks.findChallengeByDate.mockResolvedValue({ challengeId: 118, date: TODAY });
    mocks.findDailyBest.mockResolvedValue({
      score: 25.3,
      achievedAt: new Date("2026-10-29T08:02:11.000Z"),
    });
    mocks.findUserDailyStreak.mockResolvedValue({
      current: 3,
      longest: 7,
      lastPlayedDate: TODAY,
    });

    const summary = await getTodaySummary(7, NOW);

    expect(summary.myBest).toEqual({ score: 25.3, achievedAt: "2026-10-29T08:02:11.000Z" });
    expect(summary.streak).toEqual({ current: 3, longest: 7 });
  });

  it("displays a lapsed streak as 0 but keeps the longest streak unchanged", async () => {
    mocks.findChallengeByDate.mockResolvedValue(null);
    mocks.findUserDailyStreak.mockResolvedValue({
      current: 4,
      longest: 9,
      lastPlayedDate: "2026-10-20",
    });

    const summary = await getTodaySummary(7, NOW);

    expect(summary.streak).toEqual({ current: 0, longest: 9 });
  });

  it("keeps a streak whose last play was yesterday", async () => {
    mocks.findChallengeByDate.mockResolvedValue(null);
    mocks.findUserDailyStreak.mockResolvedValue({
      current: 4,
      longest: 9,
      lastPlayedDate: "2026-10-28",
    });

    const summary = await getTodaySummary(7, NOW);

    expect(summary.streak.current).toBe(4);
  });
});

describe("getChallengeByDate", () => {
  it("rejects malformed dates", async () => {
    for (const date of ["", "2026-13-01", "2026-02-30", "29-10-2026", "tomorrow"]) {
      await expect(getChallengeByDate(date, NOW)).rejects.toMatchObject({
        code: "INVALID_DATE",
      });
    }
    expect(mocks.findChallengeByDate).not.toHaveBeenCalled();
  });

  it("rejects future dates", async () => {
    await expect(getChallengeByDate("2026-10-30", NOW)).rejects.toMatchObject({
      code: "INVALID_DATE",
    });
    expect(mocks.findChallengeByDate).not.toHaveBeenCalled();
  });

  it("returns null for a past day without a challenge and never creates one", async () => {
    mocks.findChallengeByDate.mockResolvedValue(null);

    await expect(getChallengeByDate("2026-10-01", NOW)).resolves.toBeNull();
    expect(mocks.ensureDailyChallenge).not.toHaveBeenCalled();
  });

  it("returns an existing past challenge with its colours", async () => {
    mocks.findChallengeByDate.mockResolvedValue({ challengeId: 5, date: "2026-10-01" });
    mocks.listChallengeColors.mockResolvedValue([...STORED]);

    await expect(getChallengeByDate("2026-10-01", NOW)).resolves.toEqual({
      challengeId: 5,
      date: "2026-10-01",
      colors: [...STORED],
    });
  });

  it("accepts today", async () => {
    mocks.findChallengeByDate.mockResolvedValue(null);

    await expect(getChallengeByDate(TODAY, NOW)).resolves.toBeNull();
    expect(mocks.findChallengeByDate).toHaveBeenCalledWith(TODAY);
  });
});
