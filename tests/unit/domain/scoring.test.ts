import { describe, expect, it } from "vitest";

import { fromTenths, type Hsv, toTenths } from "@/lib/domain/hsv";
import { scoreGame, scoreRound } from "@/lib/domain/scoring";

const VECTOR_1_TARGET: Hsv = { h: 214.6, s: 62, v: 80.5 };
const VECTOR_1_GUESS: Hsv = { h: 209, s: 58.5, v: 77 };
const VECTOR_4_TARGET: Hsv = { h: 359, s: 50, v: 50 };
const VECTOR_4_GUESS: Hsv = { h: 1, s: 50, v: 50 };
const VECTOR_5_TARGET: Hsv = { h: 100, s: 50, v: 50 };
const VECTOR_5_GUESS: Hsv = { h: 190, s: 100, v: 75 };

describe("round scoring (Architecture §5.4.1)", () => {
  it.each([
    {
      name: "vector 1",
      target: VECTOR_1_TARGET,
      guess: VECTOR_1_GUESS,
      expected: 9.7,
    },
    {
      name: "vector 2 — perfect match",
      target: { h: 120, s: 40, v: 40 },
      guess: { h: 120, s: 40, v: 40 },
      expected: 10.0,
    },
    {
      name: "vector 3 — worst case",
      target: { h: 0, s: 0, v: 0 },
      guess: { h: 180, s: 100, v: 100 },
      expected: 0.0,
    },
    {
      name: "vector 4 — hue wraps",
      target: VECTOR_4_TARGET,
      guess: VECTOR_4_GUESS,
      expected: 9.9,
    },
    {
      name: "vector 5",
      target: VECTOR_5_TARGET,
      guess: VECTOR_5_GUESS,
      expected: 5.7,
    },
    {
      name: "vector 6 — 360 equals 0",
      target: { h: 0, s: 70, v: 70 },
      guess: { h: 360, s: 70, v: 70 },
      expected: 10.0,
    },
  ])("scores $name as $expected", ({ target, guess, expected }) => {
    expect(scoreRound(target, guess).score).toBe(expected);
  });

  it("returns display-unit channel differences with hue on the shortest path", () => {
    expect(scoreRound(VECTOR_1_TARGET, VECTOR_1_GUESS).diff).toEqual({
      h: 5.6,
      s: 3.5,
      v: 3.5,
    });
    expect(scoreRound(VECTOR_4_TARGET, VECTOR_4_GUESS).diff).toEqual({
      h: 2,
      s: 0,
      v: 0,
    });
    expect(scoreRound({ h: 0, s: 70, v: 70 }, { h: 360, s: 70, v: 70 }).diff).toEqual({
      h: 0,
      s: 0,
      v: 0,
    });
  });

  it("is symmetric", () => {
    const pairs: Array<[Hsv, Hsv]> = [
      [VECTOR_1_TARGET, VECTOR_1_GUESS],
      [VECTOR_4_TARGET, VECTOR_4_GUESS],
      [VECTOR_5_TARGET, VECTOR_5_GUESS],
      [
        { h: 0, s: 0, v: 0 },
        { h: 180, s: 100, v: 100 },
      ],
      [
        { h: 12.3, s: 45.6, v: 78.9 },
        { h: 340.1, s: 10.2, v: 99.8 },
      ],
    ];

    for (const [left, right] of pairs) {
      expect(scoreRound(left, right)).toEqual(scoreRound(right, left));
    }
  });

  it("scores identical colours as a perfect 10", () => {
    const colours: Hsv[] = [
      { h: 0, s: 0, v: 0 },
      { h: 360, s: 100, v: 100 },
      { h: 123.4, s: 56.7, v: 89.0 },
    ];

    for (const colour of colours) {
      expect(scoreRound(colour, colour)).toEqual({
        score: 10,
        diff: { h: 0, s: 0, v: 0 },
      });
    }
  });

  it("keeps scores within bounds and on one-decimal tenths", () => {
    const samples: Hsv[] = [
      { h: 0, s: 0, v: 0 },
      { h: 360, s: 100, v: 100 },
      { h: 180, s: 50, v: 50 },
      { h: 1, s: 99, v: 1 },
      { h: 359.9, s: 0.1, v: 99.9 },
      { h: 45.5, s: 45.5, v: 45.5 },
      { h: 300, s: 75, v: 25 },
    ];

    for (const target of samples) {
      for (const guess of samples) {
        const score = scoreRound(target, guess).score;
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
        expect(score).toBe(fromTenths(toTenths(score)));
      }
    }
  });

  it("rejects invalid HSV values", () => {
    expect(() => scoreRound({ h: 361, s: 50, v: 50 }, { h: 0, s: 0, v: 0 })).toThrow(RangeError);
    expect(() => scoreRound({ h: 0, s: 0, v: 0 }, { h: 0, s: 0, v: Number.NaN })).toThrow(
      RangeError,
    );
  });
});

describe("game scoring (Architecture §5.4.1)", () => {
  it("sums the six test-vector sub-total exactly", () => {
    const result = scoreGame(
      [VECTOR_1_TARGET, VECTOR_4_TARGET, VECTOR_5_TARGET],
      [VECTOR_1_GUESS, VECTOR_4_GUESS, VECTOR_5_GUESS],
    );

    expect(result.rounds.map((round) => round.score)).toEqual([9.7, 9.9, 5.7]);
    expect(result.total).toBe(25.3);
    expect(toTenths(result.total)).toBe(253);
  });

  it("keeps game totals within bounds and on one-decimal tenths", () => {
    const result = scoreGame(
      [
        { h: 0, s: 0, v: 0 },
        { h: 180, s: 50, v: 50 },
        { h: 360, s: 100, v: 100 },
      ],
      [
        { h: 360, s: 100, v: 100 },
        { h: 180, s: 50, v: 50 },
        { h: 0, s: 0, v: 0 },
      ],
    );

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(30);
    expect(result.total).toBe(fromTenths(toTenths(result.total)));
  });

  it("requires exactly three targets and three guesses", () => {
    const valid = { h: 0, s: 0, v: 0 };

    expect(() =>
      scoreGame([valid, valid] as unknown as [Hsv, Hsv, Hsv], [valid, valid, valid]),
    ).toThrow(RangeError);
    expect(() =>
      scoreGame([valid, valid, valid], [valid, valid] as unknown as [Hsv, Hsv, Hsv]),
    ).toThrow(RangeError);
  });
});
