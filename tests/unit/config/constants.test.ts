import { describe, expect, it } from "vitest";

import {
  BANNED_CAN_PLAY,
  GAME_MIN_ELAPSED_SECONDS,
  GAME_TOKEN_TTL_SECONDS,
  HSV_DECIMALS,
  HUE_MAX,
  HUE_MIN,
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  LOBBY_POLL_MS,
  MAX_GAME_SCORE,
  MAX_ROUND_SCORE,
  REVEAL_MS,
  ROOM_ATTEMPT_OPTIONS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_MAX_SIZE,
  ROOM_MIN_SIZE,
  ROOM_POLL_MS,
  ROOM_TIMER_OPTIONS,
  ROUNDS_PER_GAME,
  SAT_MAX,
  SAT_MIN,
  SCORE_WEIGHTS,
  SESSION_TTL_SECONDS,
  SHOW_LIVE_STANDINGS,
  SLIDER_DEFAULTS,
  VAL_MAX,
  VAL_MIN,
} from "@/lib/config/constants";

describe("Architecture §5.3.1 constants", () => {
  it("matches the specified game values", () => {
    expect(ROUNDS_PER_GAME).toBe(3);
    expect(REVEAL_MS).toBe(5000);
    expect(MAX_ROUND_SCORE).toBe(10);
    expect(MAX_GAME_SCORE).toBe(30);
    expect(GAME_TOKEN_TTL_SECONDS).toBe(7200);
    expect(GAME_MIN_ELAPSED_SECONDS).toBe(13);
  });

  it("matches the specified HSV values", () => {
    expect(HUE_MIN).toBe(0);
    expect(HUE_MAX).toBe(360);
    expect(SAT_MIN).toBe(0);
    expect(SAT_MAX).toBe(100);
    expect(VAL_MIN).toBe(0);
    expect(VAL_MAX).toBe(100);
    expect(HSV_DECIMALS).toBe(1);
    expect(SLIDER_DEFAULTS).toEqual({ h: 180, s: 50, v: 50 });
  });

  it("matches the specified room values", () => {
    expect(ROOM_MIN_SIZE).toBe(2);
    expect(ROOM_MAX_SIZE).toBe(10);
    expect(ROOM_TIMER_OPTIONS).toEqual([null, 5, 10, 15]);
    expect(ROOM_ATTEMPT_OPTIONS).toEqual([3, 5]);
    expect(ROOM_CODE_LENGTH).toBe(8);
    expect(ROOM_CODE_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
  });

  it("matches the specified limits, polling intervals and flags", () => {
    expect(SESSION_TTL_SECONDS).toBe(604800);
    expect(LEADERBOARD_DEFAULT_LIMIT).toBe(50);
    expect(LEADERBOARD_MAX_LIMIT).toBe(100);
    expect(LOBBY_POLL_MS).toBe(2000);
    expect(ROOM_POLL_MS).toBe(3000);
    expect(SHOW_LIVE_STANDINGS).toBe(true);
    expect(BANNED_CAN_PLAY).toBe(true);
  });

  it("uses a room-code alphabet without look-alike characters", () => {
    const letters = ROOM_CODE_ALPHABET.split("");
    expect(letters).toHaveLength(31);
    expect(new Set(letters).size).toBe(31);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it("has scoring weights that sum to 1 within 1e-9", () => {
    const sum = SCORE_WEIGHTS.h + SCORE_WEIGHTS.s + SCORE_WEIGHTS.v;
    expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
    expect(Object.keys(SCORE_WEIGHTS)).toEqual(["h", "s", "v"]);
  });
});
