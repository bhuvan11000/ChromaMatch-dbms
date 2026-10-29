import { describe, expect, it } from "vitest";

import { isPermutationOf123, randomPermutation } from "@/lib/domain/shuffle";

describe("random permutations (Architecture §5.4.4)", () => {
  it("always returns a valid permutation of 3", () => {
    for (let run = 0; run < 1000; run += 1) {
      const order = randomPermutation(3);

      expect(order).toHaveLength(3);
      expect(new Set(order)).toEqual(new Set([0, 1, 2]));
      expect(isPermutationOf123(order.map((index) => index + 1))).toBe(true);
    }
  });

  it("produces all six orders with a reasonably uniform spread", () => {
    const counts = new Map<string, number>();
    const runs = 6000;

    for (let run = 0; run < runs; run += 1) {
      const key = randomPermutation(3).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect([...counts.keys()].sort()).toEqual(["012", "021", "102", "120", "201", "210"]);

    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });

  it("handles zero, one and larger lengths", () => {
    expect(randomPermutation(0)).toEqual([]);
    expect(randomPermutation(1)).toEqual([0]);
    expect(randomPermutation(10).sort((left, right) => left - right)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("rejects invalid lengths", () => {
    expect(() => randomPermutation(-1)).toThrow(RangeError);
    expect(() => randomPermutation(1.5)).toThrow(RangeError);
  });

  it("validates 1-based colour-number permutations", () => {
    expect(isPermutationOf123([1, 2, 3])).toBe(true);
    expect(isPermutationOf123([3, 1, 2])).toBe(true);
    expect(isPermutationOf123([0, 1, 2])).toBe(false);
    expect(isPermutationOf123([1, 2, 2])).toBe(false);
    expect(isPermutationOf123([1, 2])).toBe(false);
    expect(isPermutationOf123([1, 2, 4])).toBe(false);
  });
});
