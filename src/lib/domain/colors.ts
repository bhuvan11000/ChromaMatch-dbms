/**
 * Colour generation — Architecture §5.4.2 and §5.4.3.
 *
 * Global and Room colours use Node's cryptographically secure RNG. Daily
 * colours use the specified xmur3 + mulberry32 date-seeded PRNG so that every
 * server instance derives the same colours for a date without stored state.
 */

import { randomInt } from "node:crypto";

import { HUE_MAX, SAT_MAX } from "@/lib/config/constants";

import { fromTenths, type Hsv } from "./hsv";

/** Draw an integer uniformly from `[0, maxExclusive)`. */
export type RandomInt = (maxExclusive: number) => number;

/** Reserved for future colour constraints; currently empty (Architecture §5.4.2). */
export type RandomColorOptions = Record<string, never>;

const HUE_TENTHS_COUNT = HUE_MAX * 10;
const PERCENT_TENTHS_COUNT = SAT_MAX * 10 + 1;

const cryptoRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/**
 * Generate one fully random colour.
 *
 * Hue is drawn from 0.0–359.9; saturation and value are drawn from
 * 0.0–100.0 inclusive, exactly as specified in Architecture §5.4.2.
 */
export function generateRandomColor(
  rng: RandomInt = cryptoRandomInt,
  options: RandomColorOptions = {},
): Hsv {
  void options;

  return {
    h: fromTenths(rng(HUE_TENTHS_COUNT)),
    s: fromTenths(rng(PERCENT_TENTHS_COUNT)),
    v: fromTenths(rng(PERCENT_TENTHS_COUNT)),
  };
}

/** Generate `n` independent random colours. */
export function generateRandomColors(
  n: number,
  rng: RandomInt = cryptoRandomInt,
  options: RandomColorOptions = {},
): Hsv[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError("The number of colours must be a non-negative integer.");
  }

  return Array.from({ length: n }, () => generateRandomColor(rng, options));
}

/**
 * xmur3 string hash, as specified for the Daily generator in §5.4.3.
 * Module-local: the public Daily API is `generateDailyColors`.
 */
function xmur3(input: string): () => number {
  let hash = 1779033703 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
}

/** mulberry32 PRNG, seeded by the xmur3 hash (Architecture §5.4.3). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive the three Daily colours for a UTC date.
 *
 * The exact seed string and draw order are normative (Architecture §5.4.3):
 * `chromamatch-daily|${secret}|${dateUtc}`, then h1,s1,v1,h2,s2,v2,h3,s3,v3.
 */
export function generateDailyColors(dateUtc: string, secret: string): [Hsv, Hsv, Hsv] {
  const seedHash = xmur3(`chromamatch-daily|${secret}|${dateUtc}`)();
  const next = mulberry32(seedHash);

  const drawHue = () => fromTenths(Math.floor(next() * HUE_TENTHS_COUNT));
  const drawPercent = () => fromTenths(Math.floor(next() * PERCENT_TENTHS_COUNT));

  const h1 = drawHue();
  const s1 = drawPercent();
  const v1 = drawPercent();
  const h2 = drawHue();
  const s2 = drawPercent();
  const v2 = drawPercent();
  const h3 = drawHue();
  const s3 = drawPercent();
  const v3 = drawPercent();

  return [
    { h: h1, s: s1, v: v1 },
    { h: h2, s: s2, v: v2 },
    { h: h3, s: s3, v: v3 },
  ];
}
