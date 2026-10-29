import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  dailyChallengeSummary,
  roomSummary,
  userChannelAccuracy,
  userHueRegionAccuracy,
  userModeSummary,
  userRoomProgress,
  userTrend,
} from "@/lib/db/mongo/aggregations";
import { getMongoClient, getMongoDb } from "@/lib/db/mongo/client";
import { insertGame } from "@/lib/db/mongo/historyRepo";

import { initMongo } from "../../scripts/init-mongo";

import {
  cleanupHistory,
  hsv,
  makeHistoryDocument,
  uniqueNumericId,
  type RoundSpec,
} from "./support/mongo";

const db = getMongoDb();
const userA = uniqueNumericId();
const userB = uniqueNumericId();
const challengeId = uniqueNumericId();
const roomId = uniqueNumericId();
const userIds = [userA, userB];

beforeAll(async () => {
  await initMongo(db);

  const globalOne: RoundSpec[] = [
    { target: hsv(359, 50, 50), guess: hsv(1, 60, 40), score: 8.0 },
    { target: hsv(10, 50, 50), guess: hsv(10, 50, 50), score: 10.0 },
    { target: hsv(100, 50, 50), guess: hsv(190, 100, 75), score: 5.7 },
  ];
  const globalTwo: RoundSpec[] = [
    { target: hsv(40, 50, 50), guess: hsv(40, 50, 50), score: 10.0 },
    { target: hsv(120, 50, 50), guess: hsv(120, 50, 50), score: 10.0 },
    { target: hsv(200, 50, 50), guess: hsv(200, 50, 50), score: 10.0 },
  ];
  const dailyA: RoundSpec[] = [
    { target: hsv(10, 20, 30), guess: hsv(20, 30, 40), score: 7.0, colorNumber: 1 },
    { target: hsv(100, 50, 50), guess: hsv(100, 50, 50), score: 10.0, colorNumber: 2 },
    { target: hsv(200, 50, 50), guess: hsv(20, 50, 50), score: 1.0, colorNumber: 3 },
  ];
  const roomRounds = (score: number, timedOut: [boolean, boolean, boolean]): RoundSpec[] => [
    {
      target: hsv(50, 50, 50),
      guess: hsv(60, 60, 60),
      score,
      colorNumber: 1,
      timedOut: timedOut[0],
    },
    {
      target: hsv(50, 50, 50),
      guess: hsv(60, 60, 60),
      score,
      colorNumber: 2,
      timedOut: timedOut[1],
    },
    {
      target: hsv(50, 50, 50),
      guess: hsv(60, 60, 60),
      score,
      colorNumber: 3,
      timedOut: timedOut[2],
    },
  ];
  const dailyB: RoundSpec[] = [
    { target: hsv(10, 20, 30), guess: hsv(10, 20, 30), score: 7.0, colorNumber: 1 },
    { target: hsv(100, 50, 50), guess: hsv(100, 50, 50), score: 7.0, colorNumber: 2 },
    { target: hsv(200, 50, 50), guess: hsv(200, 50, 50), score: 7.0, colorNumber: 3 },
  ];

  await insertGame(
    makeHistoryDocument({
      userId: userA,
      mode: "global",
      playedAt: new Date("2026-10-01T10:00:00.000Z"),
      totalScore: 23.7,
      rounds: globalOne,
    }),
  );
  await insertGame(
    makeHistoryDocument({
      userId: userA,
      mode: "global",
      playedAt: new Date("2026-10-02T10:00:00.000Z"),
      totalScore: 30.0,
      rounds: globalTwo,
    }),
  );
  await insertGame(
    makeHistoryDocument({
      userId: userA,
      mode: "daily",
      playedAt: new Date("2026-10-03T10:00:00.000Z"),
      totalScore: 18.0,
      dailyChallengeId: challengeId,
      rounds: dailyA,
    }),
  );
  await insertGame(
    makeHistoryDocument({
      userId: userA,
      mode: "room",
      playedAt: new Date("2026-10-04T10:00:00.000Z"),
      totalScore: 12.0,
      roomId,
      attemptNumber: 1,
      rounds: roomRounds(4.0, [true, false, true]),
    }),
  );
  await insertGame(
    makeHistoryDocument({
      userId: userA,
      mode: "room",
      playedAt: new Date("2026-10-04T11:00:00.000Z"),
      totalScore: 15.0,
      roomId,
      attemptNumber: 2,
      rounds: roomRounds(5.0, [false, true, false]),
    }),
  );
  await insertGame(
    makeHistoryDocument({
      userId: userB,
      mode: "daily",
      playedAt: new Date("2026-10-03T12:00:00.000Z"),
      totalScore: 21.0,
      dailyChallengeId: challengeId,
      rounds: dailyB,
    }),
  );
});

afterAll(async () => {
  try {
    await cleanupHistory(userIds);
  } finally {
    await getMongoClient().close();
  }
});

describe("MongoDB aggregations", () => {
  it("summarizes only Global and Daily games per mode", async () => {
    const summary = await userModeSummary(userA);

    expect(summary.map((entry) => entry.mode)).toEqual(["daily", "global"]);
    expect(summary.some((entry) => entry.mode === "room")).toBe(false);

    const global = summary.find((entry) => entry.mode === "global");
    expect(global?.games).toBe(2);
    expect(global?.avgScore).toBeCloseTo(26.85);
    expect(global?.bestScore).toBe(30.0);
    expect(global?.worstScore).toBe(23.7);

    const daily = summary.find((entry) => entry.mode === "daily");
    expect(daily?.games).toBe(1);
    expect(daily?.avgScore).toBeCloseTo(18.0);
    expect(daily?.bestScore).toBe(18.0);
    expect(daily?.worstScore).toBe(18.0);
  });

  it("builds daily and weekly trends without room games", async () => {
    const daily = await userTrend(
      userA,
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-10-04T23:59:59.999Z"),
      "day",
    );

    expect(daily.map((point) => point.bucketStart)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(daily.map((point) => point.games)).toEqual([1, 1, 1]);
    expect(daily[0]?.avgScore).toBeCloseTo(23.7);
    expect(daily[1]?.avgScore).toBeCloseTo(30.0);
    expect(daily[2]?.avgScore).toBeCloseTo(18.0);

    const weekly = await userTrend(
      userA,
      new Date("2026-09-28T00:00:00.000Z"),
      new Date("2026-10-04T23:59:59.999Z"),
      "week",
    );

    expect(weekly).toHaveLength(1);
    expect(weekly[0]?.bucketStart).toBe("2026-09-28");
    expect(weekly[0]?.games).toBe(3);
    expect(weekly[0]?.avgScore).toBeCloseTo(23.9);
  });

  it("computes circular hue difference and channel averages", async () => {
    const accuracy = await userChannelAccuracy(userA);

    expect(accuracy.rounds).toBe(9);
    expect(accuracy.avgAbsDiff.h).toBeCloseTo(282 / 9);
    expect(accuracy.avgAbsDiff.s).toBeCloseTo(70 / 9);
    expect(accuracy.avgAbsDiff.v).toBeCloseTo(5.0);
  });

  it("buckets hue regions and keeps room games out", async () => {
    const regions = await userHueRegionAccuracy(userA);
    const byRange = new Map(regions.map((region) => [`${region.from}-${region.to}`, region]));

    expect(byRange.get("0-30")?.rounds).toBe(2);
    expect(byRange.get("0-30")?.avgScore).toBeCloseTo(8.5);

    expect(byRange.get("30-60")?.rounds).toBe(1);
    expect(byRange.get("30-60")?.avgScore).toBeCloseTo(10.0);

    expect(byRange.get("90-120")?.rounds).toBe(2);
    expect(byRange.get("90-120")?.avgScore).toBeCloseTo(7.85);

    expect(byRange.get("120-150")?.rounds).toBe(1);
    expect(byRange.get("180-210")?.rounds).toBe(2);
    expect(byRange.get("180-210")?.avgScore).toBeCloseTo(5.5);

    expect(byRange.get("330-360")?.rounds).toBe(1);
    expect(byRange.get("330-360")?.avgScore).toBeCloseTo(8.0);
    expect(regions.some((region) => region.from === 0 && region.to === 360)).toBe(false);
  });

  it("summarizes a Daily challenge by color number and distinct players", async () => {
    const summary = await dailyChallengeSummary(challengeId);
    const byColor = new Map(summary.map((entry) => [entry.colorNumber, entry]));

    expect(summary).toHaveLength(3);
    expect(byColor.get(1)).toMatchObject({ colorNumber: 1, rounds: 2, players: 2 });
    expect(byColor.get(1)?.avgScore).toBeCloseTo(7.0);
    expect(byColor.get(2)).toMatchObject({ colorNumber: 2, rounds: 2, players: 2 });
    expect(byColor.get(2)?.avgScore).toBeCloseTo(8.5);
    expect(byColor.get(3)).toMatchObject({ colorNumber: 3, rounds: 2, players: 2 });
    expect(byColor.get(3)?.avgScore).toBeCloseTo(4.0);
  });

  it("summarizes a room by color number and timeouts", async () => {
    const summary = await roomSummary(roomId);

    expect(summary).toHaveLength(3);
    for (const color of [1, 2, 3]) {
      const entry = summary.find((item) => item.colorNumber === color);
      expect(entry?.avgScore).toBeCloseTo(4.5);
      expect(entry?.timeouts).toBe(1);
    }
  });

  it("lists one player's attempts in a room in attempt order", async () => {
    const progress = await userRoomProgress(roomId, userA);

    expect(progress.map((entry) => entry.attemptNumber)).toEqual([1, 2]);
    expect(progress.map((entry) => entry.totalScore)).toEqual([12.0, 15.0]);
    expect(progress[0]?.playedAt.toISOString()).toBe("2026-10-04T10:00:00.000Z");
    expect(progress[1]?.playedAt.toISOString()).toBe("2026-10-04T11:00:00.000Z");
  });
});
