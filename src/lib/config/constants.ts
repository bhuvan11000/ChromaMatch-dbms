/**
 * Shared constants — the single source of truth for Architecture §5.3.1.
 * Do not duplicate these values elsewhere in the codebase.
 */

/** Number of rounds in one game. */
export const ROUNDS_PER_GAME = 3 as const;

/** Duration the target color is shown before the guess controls appear (ms). */
export const REVEAL_MS = 5000 as const;

/** Maximum score for a single round. */
export const MAX_ROUND_SCORE = 10 as const;

/** Maximum score for a complete game. */
export const MAX_GAME_SCORE = 30 as const;

/** Hue bounds (degrees). Hues are circular; 360 is equivalent to 0. */
export const HUE_MIN = 0 as const;
export const HUE_MAX = 360 as const;

/** Saturation bounds (percent). */
export const SAT_MIN = 0 as const;
export const SAT_MAX = 100 as const;

/** Value/brightness bounds (percent). */
export const VAL_MIN = 0 as const;
export const VAL_MAX = 100 as const;

/** HSV values are stored and displayed with one decimal place. */
export const HSV_DECIMALS = 1 as const;

export type HsvChannel = "h" | "s" | "v";

/** Channel weights used by the scoring formula; they must sum to 1. */
export const SCORE_WEIGHTS = {
  h: 1 / 3,
  s: 1 / 3,
  v: 1 / 3,
} as const;

export type ScoreWeights = typeof SCORE_WEIGHTS;
export type ScoreChannel = keyof ScoreWeights;

/** Minimum number of members required to start a room. */
export const ROOM_MIN_SIZE = 2 as const;

/** Maximum number of members allowed in a room (adopted default, Architecture §6). */
export const ROOM_MAX_SIZE = 10 as const;

/** Allowed per-round room timers in seconds; null means no timer. */
export const ROOM_TIMER_OPTIONS = [null, 5, 10, 15] as const;

export type RoomTimerSeconds = (typeof ROOM_TIMER_OPTIONS)[number];

/** Allowed attempts per room member. */
export const ROOM_ATTEMPT_OPTIONS = [3, 5] as const;

export type RoomAttemptLimit = (typeof ROOM_ATTEMPT_OPTIONS)[number];

/** Room codes are 8 characters drawn from ROOM_CODE_ALPHABET. */
export const ROOM_CODE_LENGTH = 8 as const;

/** Room-code alphabet without look-alike characters (0, 1, I, L, O). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" as const;

/** Game tokens expire after 2 hours. */
export const GAME_TOKEN_TTL_SECONDS = 7200 as const;

/** Anti-cheat lower bound for a complete game (3 × 5 s reveal, minus slack). */
export const GAME_MIN_ELAPSED_SECONDS = 13 as const;

/** Session lifetime: 7 days. */
export const SESSION_TTL_SECONDS = 604800 as const;

/** Default and maximum page sizes for leaderboards and admin lists. */
export const LEADERBOARD_DEFAULT_LIMIT = 50 as const;
export const LEADERBOARD_MAX_LIMIT = 100 as const;

/** Polling intervals for room views (ms). */
export const LOBBY_POLL_MS = 2000 as const;
export const ROOM_POLL_MS = 3000 as const;

/** Initial slider position for every guess round (adopted default, Architecture §6). */
export const SLIDER_DEFAULTS = {
  h: 180,
  s: 50,
  v: 50,
} as const;

export type SliderDefaults = typeof SLIDER_DEFAULTS;

/** Whether live room standings are visible during play (adopted default, Architecture §6). */
export const SHOW_LIVE_STANDINGS = true as const;

/** Whether banned players may log in and play (adopted default, Architecture §6). */
export const BANNED_CAN_PLAY = true as const;
