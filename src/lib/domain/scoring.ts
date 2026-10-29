/**
 * Server-authoritative scoring — Architecture §5.4.1.
 *
 * All arithmetic is performed in integer tenths so that round and game totals
 * do not drift. The client never computes or submits these values.
 */

import { MAX_ROUND_SCORE, ROUNDS_PER_GAME, SCORE_WEIGHTS } from "@/lib/config/constants";

import { fromTenths, type Hsv, isValidHsv, toTenths } from "./hsv";

export interface RoundDiff {
  h: number;
  s: number;
  v: number;
}

export interface RoundResult {
  score: number;
  diff: RoundDiff;
}

export interface GameResult {
  rounds: [RoundResult, RoundResult, RoundResult];
  total: number;
}

const MAX_HUE_TENTHS = 1800;
const HUE_CIRCLE_TENTHS = 3600;
const PERCENT_TENTHS = 1000;

export function scoreRound(target: Hsv, guess: Hsv): RoundResult {
  if (!isValidHsv(target)) {
    throw new RangeError("Invalid target HSV value.");
  }
  if (!isValidHsv(guess)) {
    throw new RangeError("Invalid guess HSV value.");
  }

  const targetHue = toTenths(target.h);
  const targetSaturation = toTenths(target.s);
  const targetValue = toTenths(target.v);
  const guessHue = toTenths(guess.h);
  const guessSaturation = toTenths(guess.s);
  const guessValue = toTenths(guess.v);

  let hueTenths = Math.abs(targetHue - guessHue);
  if (hueTenths > MAX_HUE_TENTHS) {
    hueTenths = HUE_CIRCLE_TENTHS - hueTenths;
  }

  const saturationTenths = Math.abs(targetSaturation - guessSaturation);
  const valueTenths = Math.abs(targetValue - guessValue);

  const hueDistance = hueTenths / MAX_HUE_TENTHS;
  const saturationDistance = saturationTenths / PERCENT_TENTHS;
  const valueDistance = valueTenths / PERCENT_TENTHS;

  const distance = Math.sqrt(
    SCORE_WEIGHTS.h * hueDistance ** 2 +
      SCORE_WEIGHTS.s * saturationDistance ** 2 +
      SCORE_WEIGHTS.v * valueDistance ** 2,
  );

  const raw = MAX_ROUND_SCORE * (1 - distance);
  const clamped = Math.min(MAX_ROUND_SCORE, Math.max(0, raw));
  const score = fromTenths(toTenths(clamped));

  return {
    score,
    diff: {
      h: fromTenths(hueTenths),
      s: fromTenths(saturationTenths),
      v: fromTenths(valueTenths),
    },
  };
}

export function scoreGame(targets: [Hsv, Hsv, Hsv], guesses: [Hsv, Hsv, Hsv]): GameResult {
  if (!Array.isArray(targets) || targets.length !== ROUNDS_PER_GAME) {
    throw new RangeError(`Exactly ${ROUNDS_PER_GAME} targets are required.`);
  }
  if (!Array.isArray(guesses) || guesses.length !== ROUNDS_PER_GAME) {
    throw new RangeError(`Exactly ${ROUNDS_PER_GAME} guesses are required.`);
  }

  const rounds: [RoundResult, RoundResult, RoundResult] = [
    scoreRound(targets[0], guesses[0]),
    scoreRound(targets[1], guesses[1]),
    scoreRound(targets[2], guesses[2]),
  ];

  const totalTenths = rounds.reduce((sum, round) => sum + toTenths(round.score), 0);

  return {
    rounds,
    total: fromTenths(totalTenths),
  };
}
