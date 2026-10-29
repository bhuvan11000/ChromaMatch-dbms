/**
 * Random play-order shuffling — Architecture §5.4.4.
 *
 * Fisher–Yates over indices using Node's crypto RNG. `randomPermutation(3)`
 * returns 0-based indices; callers translate them to colour numbers 1–3.
 */

import { randomInt } from "node:crypto";

export function randomPermutation(n: number): number[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError("The permutation length must be a non-negative integer.");
  }

  const indices = Array.from({ length: n }, (_, index) => index);

  for (let current = n - 1; current > 0; current -= 1) {
    const swapWith = randomInt(current + 1);
    const value = indices[current];
    indices[current] = indices[swapWith];
    indices[swapWith] = value;
  }

  return indices;
}

/** Validate a 1-based colour-number permutation of `[1, 2, 3]`. */
export function isPermutationOf123(values: readonly number[]): boolean {
  if (values.length !== 3) {
    return false;
  }

  const seen = new Set<number>();

  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || value > 3) {
      return false;
    }
    seen.add(value);
  }

  return seen.size === 3;
}
