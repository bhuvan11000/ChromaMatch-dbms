import { describe, expect, it } from "vitest";

import {
  generateDailyColors,
  generateRandomColor,
  generateRandomColors,
  type RandomInt,
} from "@/lib/domain/colors";
import { isValidHsv } from "@/lib/domain/hsv";

function sequenceRng(values: number[]): RandomInt {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("random colour generation (Architecture §5.4.2)", () => {
  it("maps the RNG endpoints to the inclusive channel ranges", () => {
    expect(generateRandomColor(() => 0)).toEqual({ h: 0, s: 0, v: 0 });
    expect(generateRandomColor((maxExclusive) => maxExclusive - 1)).toEqual({
      h: 359.9,
      s: 100,
      v: 100,
    });
  });

  it("draws hue, saturation and value in order", () => {
    const rng = sequenceRng([10, 20, 30, 40, 50, 60, 70, 80, 90]);

    expect(generateRandomColors(3, rng)).toEqual([
      { h: 1, s: 2, v: 3 },
      { h: 4, s: 5, v: 6 },
      { h: 7, s: 8, v: 9 },
    ]);
  });

  it("produces valid, one-decimal colours with a broad uniform spread", () => {
    const colours = generateRandomColors(6000);
    const hueBuckets = [0, 0, 0, 0, 0, 0];
    const saturationBuckets = [0, 0, 0, 0];
    const valueBuckets = [0, 0, 0, 0];

    for (const colour of colours) {
      expect(isValidHsv(colour)).toBe(true);
      expect(Number(colour.h.toFixed(1))).toBe(colour.h);
      expect(Number(colour.s.toFixed(1))).toBe(colour.s);
      expect(Number(colour.v.toFixed(1))).toBe(colour.v);

      hueBuckets[Math.floor(colour.h / 60)] += 1;
      saturationBuckets[Math.min(3, Math.floor(colour.s / 25))] += 1;
      valueBuckets[Math.min(3, Math.floor(colour.v / 25))] += 1;
    }

    for (const count of hueBuckets) {
      expect(count / colours.length).toBeGreaterThan(0.1);
      expect(count / colours.length).toBeLessThan(0.25);
    }

    for (const count of [...saturationBuckets, ...valueBuckets]) {
      expect(count / colours.length).toBeGreaterThan(0.18);
      expect(count / colours.length).toBeLessThan(0.32);
    }
  });

  it("supports an empty colour list and rejects invalid counts", () => {
    expect(generateRandomColors(0)).toEqual([]);
    expect(() => generateRandomColors(-1)).toThrow(RangeError);
    expect(() => generateRandomColors(1.5)).toThrow(RangeError);
  });
});

describe("date-seeded Daily colours (Architecture §5.4.3)", () => {
  it("is deterministic for the same date and secret", () => {
    const first = generateDailyColors("2026-10-29", "test-secret");
    const second = generateDailyColors("2026-10-29", "test-secret");

    expect(first).toEqual(second);
  });

  it("matches the specified regression vector", () => {
    expect(generateDailyColors("2026-10-29", "test-secret")).toEqual([
      { h: 276.3, s: 39.3, v: 36.8 },
      { h: 0.9, s: 60.2, v: 44.3 },
      { h: 358.3, s: 26.6, v: 3.8 },
    ]);
  });

  it("differs across dates and across secrets", () => {
    const baseline = generateDailyColors("2026-10-29", "test-secret");

    expect(generateDailyColors("2026-10-30", "test-secret")).not.toEqual(baseline);
    expect(generateDailyColors("2026-10-29", "another-secret")).not.toEqual(baseline);
  });

  it("returns exactly three valid one-decimal colours", () => {
    const colours = generateDailyColors("2027-01-01", "test-secret");

    expect(colours).toHaveLength(3);

    for (const colour of colours) {
      expect(isValidHsv(colour)).toBe(true);
      expect(colour.h).toBeGreaterThanOrEqual(0);
      expect(colour.h).toBeLessThanOrEqual(359.9);
      expect(Number(colour.h.toFixed(1))).toBe(colour.h);
      expect(Number(colour.s.toFixed(1))).toBe(colour.s);
      expect(Number(colour.v.toFixed(1))).toBe(colour.v);
    }
  });
});
