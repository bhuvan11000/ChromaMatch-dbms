import { describe, expect, it } from "vitest";

import {
  gameMachineReducer,
  initialGameMachineState,
  type GameMachineState,
} from "@/hooks/useGameMachine";
import { REVEAL_MS, ROUNDS_PER_GAME, SLIDER_DEFAULTS } from "@/lib/config/constants";
import type { Hsv } from "@/lib/domain/hsv";
import type { GameStartResponse, GameSubmitResponse } from "@/lib/schemas/game";

const TARGETS: Hsv[] = [
  { h: 214.6, s: 62, v: 80.5 },
  { h: 12, s: 90, v: 70 },
  { h: 301.3, s: 45.5, v: 33 },
];

const GAME: GameStartResponse = {
  gameToken: "signed-game-token",
  mode: "global",
  revealMs: REVEAL_MS,
  timerSeconds: null,
  expiresAt: "2026-10-30T12:00:00.000Z",
  challengeDate: null,
  roomCode: null,
  rounds: TARGETS.map((target, index) => ({ roundNumber: index + 1, target })),
};

const RESULT: GameSubmitResponse = {
  mode: "global",
  totalScore: 25.3,
  rounds: TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target,
    guess: { ...SLIDER_DEFAULTS },
    score: [9.7, 9.9, 5.7][index] ?? 0,
    diff: { h: 5.6, s: 3.5, v: 3.5 },
  })),
  totalGamesPlayed: 1,
  pb: {
    scope: "global",
    previous: null,
    current: 25.3,
    updated: true,
    beatExisting: false,
  },
  streak: null,
  achievements: [],
  room: null,
};

function starting(): GameMachineState {
  return gameMachineReducer(initialGameMachineState, { type: "START" });
}

function revealing(): GameMachineState {
  return gameMachineReducer(starting(), { type: "GAME_STARTED", game: GAME });
}

function guessing(): GameMachineState {
  return gameMachineReducer(revealing(), { type: "REVEAL_ENDED" });
}

function submitting(): GameMachineState {
  let state = guessing();

  for (let round = 0; round < ROUNDS_PER_GAME; round += 1) {
    state = gameMachineReducer(state, {
      type: "SET_GUESS",
      guess: { h: 100 + round, s: 50, v: 50 },
    });
    state = gameMachineReducer(state, { type: "SUBMIT_GUESS" });

    if (round < ROUNDS_PER_GAME - 1) {
      state = gameMachineReducer(state, { type: "REVEAL_ENDED" });
    }
  }

  return state;
}

describe("gameMachineReducer", () => {
  it("starts in IDLE and moves through STARTING to the first reveal", () => {
    expect(initialGameMachineState.phase).toBe("IDLE");

    const started = starting();
    expect(started.phase).toBe("STARTING");
    expect(started.startNonce).toBe(1);

    const reveal = gameMachineReducer(started, { type: "GAME_STARTED", game: GAME });
    expect(reveal.phase).toBe("ROUND_REVEAL");
    expect(reveal.roundIndex).toBe(0);
    expect(reveal.game).toBe(GAME);
    expect(reveal.revealRemainingMs).toBe(REVEAL_MS);
    expect(reveal.guesses).toHaveLength(0);
  });

  it("moves from reveal to guess and resets the sliders to SLIDER_DEFAULTS", () => {
    const guess = guessing();

    expect(guess.phase).toBe("ROUND_GUESS");
    expect(guess.currentGuess).toEqual(SLIDER_DEFAULTS);
    expect(guess.revealRemainingMs).toBe(0);
  });

  it("updates the reveal countdown only while revealing", () => {
    const reveal = revealing();
    const ticked = gameMachineReducer(reveal, {
      type: "REVEAL_TICK",
      remainingMs: 2500,
    });

    expect(ticked.revealRemainingMs).toBe(2500);

    const clamped = gameMachineReducer(ticked, {
      type: "REVEAL_TICK",
      remainingMs: 999999,
    });
    expect(clamped.revealRemainingMs).toBe(REVEAL_MS);

    const guess = guessing();
    expect(gameMachineReducer(guess, { type: "REVEAL_TICK", remainingMs: 1 })).toBe(guess);
  });

  it("does not allow a guess to be submitted outside ROUND_GUESS", () => {
    const idle = initialGameMachineState;
    const start = starting();
    const reveal = revealing();
    const guess = guessing();
    const submittingState = submitting();

    expect(gameMachineReducer(idle, { type: "SUBMIT_GUESS" })).toBe(idle);
    expect(gameMachineReducer(start, { type: "SUBMIT_GUESS" })).toBe(start);
    expect(gameMachineReducer(reveal, { type: "SUBMIT_GUESS" })).toBe(reveal);
    expect(gameMachineReducer(submittingState, { type: "SUBMIT_GUESS" })).toBe(submittingState);
    expect(
      gameMachineReducer(reveal, {
        type: "SET_GUESS",
        guess: { h: 10, s: 10, v: 10 },
      }),
    ).toBe(reveal);
    expect(guess.currentGuess).toEqual(SLIDER_DEFAULTS);
  });

  it("does not allow a result to be recorded before SUBMITTING", () => {
    const guess = guessing();

    expect(gameMachineReducer(guess, { type: "SUBMIT_SUCCEEDED", result: RESULT })).toBe(guess);
  });

  it("advances one round per submitted guess and ends in SUBMITTING after three", () => {
    let state = guessing();

    for (let round = 0; round < ROUNDS_PER_GAME; round += 1) {
      state = gameMachineReducer(state, {
        type: "SET_GUESS",
        guess: { h: 120 + round, s: 40 + round, v: 60 + round },
      });
      state = gameMachineReducer(state, { type: "SUBMIT_GUESS" });

      if (round < ROUNDS_PER_GAME - 1) {
        expect(state.phase).toBe("ROUND_REVEAL");
        expect(state.roundIndex).toBe(round + 1);
        expect(state.guesses).toHaveLength(round + 1);

        state = gameMachineReducer(state, { type: "REVEAL_ENDED" });
        expect(state.phase).toBe("ROUND_GUESS");
        expect(state.currentGuess).toEqual(SLIDER_DEFAULTS);
      }
    }

    expect(state.phase).toBe("SUBMITTING");
    expect(state.guesses).toHaveLength(ROUNDS_PER_GAME);
    expect(state.guesses[2]).toEqual({ h: 122, s: 42, v: 62 });
    expect(state.submitNonce).toBe(2);
  });

  it("records the result and allows a fresh game to start", () => {
    const submittingState = submitting();
    const resultState = gameMachineReducer(submittingState, {
      type: "SUBMIT_SUCCEEDED",
      result: RESULT,
    });

    expect(resultState.phase).toBe("RESULT");
    expect(resultState.result).toBe(RESULT);

    const again = gameMachineReducer(resultState, { type: "START" });
    expect(again.phase).toBe("STARTING");
    expect(again.result).toBeNull();
    expect(again.game).toBeNull();
    expect(again.guesses).toHaveLength(0);
    expect(again.startNonce).toBe(resultState.startNonce + 1);
  });

  it("handles start failure and retries the start once", () => {
    const failed = gameMachineReducer(starting(), {
      type: "START_FAILED",
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
    });

    expect(failed.phase).toBe("ERROR");
    expect(failed.error).toEqual({
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
      retry: "start",
    });

    const retried = gameMachineReducer(failed, { type: "RETRY" });
    expect(retried.phase).toBe("STARTING");
    expect(retried.error).toBeNull();
    expect(retried.startNonce).toBe(failed.startNonce + 1);
  });

  it("keeps the guesses when a submit fails and retries the submission", () => {
    const submittingState = submitting();
    const failed = gameMachineReducer(submittingState, {
      type: "SUBMIT_FAILED",
      code: "INTERNAL_ERROR",
      message: "Something went wrong.",
    });

    expect(failed.phase).toBe("ERROR");
    expect(failed.error?.retry).toBe("submit");
    expect(failed.guesses).toEqual(submittingState.guesses);

    const retried = gameMachineReducer(failed, { type: "RETRY" });
    expect(retried.phase).toBe("SUBMITTING");
    expect(retried.error).toBeNull();
    expect(retried.guesses).toEqual(submittingState.guesses);
    expect(retried.submitNonce).toBe(failed.submitNonce + 1);

    const resultState = gameMachineReducer(retried, {
      type: "SUBMIT_SUCCEEDED",
      result: RESULT,
    });
    expect(resultState.phase).toBe("RESULT");
  });

  it("ignores invalid transitions and resets to IDLE", () => {
    const idle = initialGameMachineState;
    const start = starting();

    expect(gameMachineReducer(idle, { type: "REVEAL_ENDED" })).toBe(idle);
    expect(gameMachineReducer(idle, { type: "GAME_STARTED", game: GAME })).toBe(idle);
    expect(gameMachineReducer(start, { type: "START" })).toBe(start);
    expect(gameMachineReducer(start, { type: "RETRY" })).toBe(start);
    expect(gameMachineReducer(start, { type: "RESET" })).toBe(initialGameMachineState);
  });
});
