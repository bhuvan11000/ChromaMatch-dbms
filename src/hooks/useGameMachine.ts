"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { ApiError, apiClient } from "@/lib/api-client";
import { REVEAL_MS, ROUNDS_PER_GAME, SLIDER_DEFAULTS } from "@/lib/config/constants";
import type { Hsv } from "@/lib/domain/hsv";
import type { ErrorCode } from "@/lib/errors";
import {
  gameStartResponseSchema,
  gameSubmitResponseSchema,
  type GameStartResponse,
  type GameSubmitResponse,
} from "@/lib/schemas/game";

export type GameMachinePhase =
  "IDLE" | "STARTING" | "ROUND_REVEAL" | "ROUND_GUESS" | "SUBMITTING" | "RESULT" | "ERROR";

export type GameRetryTarget = "start" | "submit";

export interface GameMachineError {
  code: ErrorCode;
  message: string;
  retry: GameRetryTarget;
}

export interface GameMachineState {
  phase: GameMachinePhase;
  game: GameStartResponse | null;
  /** Zero-based index into the current game's play order. */
  roundIndex: number;
  /** Guesses recorded so far, in play order. */
  guesses: Hsv[];
  currentGuess: Hsv;
  timedOut: boolean[];
  revealRemainingMs: number;
  result: GameSubmitResponse | null;
  error: GameMachineError | null;
  startNonce: number;
  submitNonce: number;
}

export type GameMachineEvent =
  | { type: "START" }
  | { type: "GAME_STARTED"; game: GameStartResponse }
  | { type: "START_FAILED"; code: ErrorCode; message: string }
  | { type: "REVEAL_TICK"; remainingMs: number }
  | { type: "REVEAL_ENDED" }
  | { type: "SET_GUESS"; guess: Hsv }
  | { type: "SUBMIT_GUESS"; timedOut?: boolean }
  | { type: "SUBMIT_SUCCEEDED"; result: GameSubmitResponse }
  | { type: "SUBMIT_FAILED"; code: ErrorCode; message: string }
  | { type: "RETRY" }
  | { type: "RESET" };

function defaultGuess(): Hsv {
  return { ...SLIDER_DEFAULTS };
}

function defaultTimedOut(): boolean[] {
  return Array.from({ length: ROUNDS_PER_GAME }, () => false);
}

export const initialGameMachineState: GameMachineState = {
  phase: "IDLE",
  game: null,
  roundIndex: 0,
  guesses: [],
  currentGuess: defaultGuess(),
  timedOut: defaultTimedOut(),
  revealRemainingMs: 0,
  result: null,
  error: null,
  startNonce: 0,
  submitNonce: 0,
};

/**
 * Pure game state machine — Architecture §5.11.2.
 *
 * Invalid events return the same state object, so a guess cannot be submitted
 * from IDLE/STARTING/ROUND_REVEAL/submitting and rounds cannot be skipped.
 */
export function gameMachineReducer(
  state: GameMachineState,
  event: GameMachineEvent,
): GameMachineState {
  switch (event.type) {
    case "START": {
      if (
        state.phase === "STARTING" ||
        state.phase === "ROUND_REVEAL" ||
        state.phase === "ROUND_GUESS" ||
        state.phase === "SUBMITTING"
      ) {
        return state;
      }

      return {
        ...initialGameMachineState,
        phase: "STARTING",
        currentGuess: defaultGuess(),
        timedOut: defaultTimedOut(),
        startNonce: state.startNonce + 1,
        submitNonce: state.submitNonce + 1,
      };
    }

    case "GAME_STARTED": {
      if (state.phase !== "STARTING") return state;

      return {
        ...state,
        phase: "ROUND_REVEAL",
        game: event.game,
        roundIndex: 0,
        guesses: [],
        currentGuess: defaultGuess(),
        timedOut: defaultTimedOut(),
        revealRemainingMs: event.game.revealMs,
        result: null,
        error: null,
      };
    }

    case "START_FAILED": {
      if (state.phase !== "STARTING") return state;

      return {
        ...state,
        phase: "ERROR",
        error: { code: event.code, message: event.message, retry: "start" },
      };
    }

    case "REVEAL_TICK": {
      if (state.phase !== "ROUND_REVEAL") return state;

      const total = state.game?.revealMs ?? REVEAL_MS;
      const remaining = Math.max(0, Math.min(total, event.remainingMs));

      return { ...state, revealRemainingMs: remaining };
    }

    case "REVEAL_ENDED": {
      if (state.phase !== "ROUND_REVEAL") return state;

      return {
        ...state,
        phase: "ROUND_GUESS",
        currentGuess: defaultGuess(),
        revealRemainingMs: 0,
      };
    }

    case "SET_GUESS": {
      if (state.phase !== "ROUND_GUESS") return state;

      return { ...state, currentGuess: event.guess };
    }

    case "SUBMIT_GUESS": {
      if (state.phase !== "ROUND_GUESS") return state;

      const guesses = [...state.guesses];
      guesses[state.roundIndex] = state.currentGuess;

      const timedOut = [...state.timedOut];
      timedOut[state.roundIndex] = event.timedOut ?? false;

      if (state.roundIndex + 1 < ROUNDS_PER_GAME) {
        return {
          ...state,
          phase: "ROUND_REVEAL",
          roundIndex: state.roundIndex + 1,
          guesses,
          timedOut,
          currentGuess: defaultGuess(),
          revealRemainingMs: state.game?.revealMs ?? REVEAL_MS,
        };
      }

      return {
        ...state,
        phase: "SUBMITTING",
        guesses,
        timedOut,
        revealRemainingMs: 0,
        submitNonce: state.submitNonce + 1,
      };
    }

    case "SUBMIT_SUCCEEDED": {
      if (state.phase !== "SUBMITTING") return state;

      return {
        ...state,
        phase: "RESULT",
        result: event.result,
        error: null,
      };
    }

    case "SUBMIT_FAILED": {
      if (state.phase !== "SUBMITTING") return state;

      return {
        ...state,
        phase: "ERROR",
        error: { code: event.code, message: event.message, retry: "submit" },
      };
    }

    case "RETRY": {
      if (state.phase !== "ERROR" || !state.error) return state;

      if (state.error.retry === "start") {
        return {
          ...state,
          phase: "STARTING",
          error: null,
          game: null,
          roundIndex: 0,
          guesses: [],
          currentGuess: defaultGuess(),
          timedOut: defaultTimedOut(),
          revealRemainingMs: 0,
          result: null,
          startNonce: state.startNonce + 1,
        };
      }

      return {
        ...state,
        phase: "SUBMITTING",
        error: null,
        submitNonce: state.submitNonce + 1,
      };
    }

    case "RESET":
      return initialGameMachineState;

    default:
      return state;
  }
}

function toMachineError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
  };
}

export interface UseGameMachineResult {
  state: GameMachineState;
  start: () => void;
  setGuess: (guess: Hsv) => void;
  submitGuess: () => void;
  retry: () => void;
  playAgain: () => void;
}

/**
 * Small effect layer around the pure reducer:
 *  - start/submit API calls guarded by request nonces (StrictMode-safe);
 *  - a performance.now()-based rAF reveal window;
 *  - a beforeunload warning while a game is in progress.
 *
 * Guesses, token and result all live in React state only. Nothing is written
 * to localStorage, sessionStorage or cookies.
 */
export function useGameMachine(): UseGameMachineResult {
  const [state, dispatch] = useReducer(gameMachineReducer, initialGameMachineState);

  const startRequestRef = useRef<string | null>(null);
  const submitRequestRef = useRef<string | null>(null);

  const start = useCallback(() => dispatch({ type: "START" }), []);
  const setGuess = useCallback((guess: Hsv) => dispatch({ type: "SET_GUESS", guess }), []);
  const submitGuess = useCallback(() => dispatch({ type: "SUBMIT_GUESS" }), []);
  const retry = useCallback(() => dispatch({ type: "RETRY" }), []);
  const playAgain = start;

  useEffect(() => {
    if (state.phase !== "STARTING") return;

    const requestKey = `start:${state.startNonce}`;
    if (startRequestRef.current === requestKey) return;
    startRequestRef.current = requestKey;

    apiClient
      .post<GameStartResponse>(
        "/games/start",
        { mode: "global" },
        { schema: gameStartResponseSchema },
      )
      .then((game) => dispatch({ type: "GAME_STARTED", game }))
      .catch((error: unknown) => {
        const mapped = toMachineError(error);
        dispatch({ type: "START_FAILED", code: mapped.code, message: mapped.message });
      });
  }, [state.phase, state.startNonce]);

  useEffect(() => {
    if (state.phase !== "SUBMITTING" || !state.game || state.guesses.length !== ROUNDS_PER_GAME) {
      return;
    }

    const requestKey = `submit:${state.game.gameToken}:${state.submitNonce}`;
    if (submitRequestRef.current === requestKey) return;
    submitRequestRef.current = requestKey;

    apiClient
      .post<GameSubmitResponse>(
        "/games/submit",
        { gameToken: state.game.gameToken, guesses: state.guesses },
        { schema: gameSubmitResponseSchema },
      )
      .then((result) => dispatch({ type: "SUBMIT_SUCCEEDED", result }))
      .catch((error: unknown) => {
        const mapped = toMachineError(error);
        dispatch({ type: "SUBMIT_FAILED", code: mapped.code, message: mapped.message });
      });
  }, [state.phase, state.game, state.guesses, state.submitNonce]);

  useEffect(() => {
    if (state.phase !== "ROUND_REVEAL" || !state.game) return;

    const totalMs = state.game.revealMs;
    const startedAt = performance.now();
    let frame = 0;

    const tick = () => {
      const remainingMs = Math.max(0, totalMs - (performance.now() - startedAt));

      if (remainingMs <= 0) {
        dispatch({ type: "REVEAL_ENDED" });
        return;
      }

      dispatch({ type: "REVEAL_TICK", remainingMs });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.roundIndex, state.game]);

  const inProgress = state.game !== null && state.phase !== "RESULT";

  useEffect(() => {
    if (!inProgress) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [inProgress]);

  return { state, start, setGuess, submitGuess, retry, playAgain };
}
