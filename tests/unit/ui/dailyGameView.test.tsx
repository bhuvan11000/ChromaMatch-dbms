import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DailyGameView } from "@/components/game";
import {
  gameMachineReducer,
  initialGameMachineState,
  type GameMachineState,
} from "@/hooks/useGameMachine";
import { REVEAL_MS, ROUNDS_PER_GAME, SLIDER_DEFAULTS } from "@/lib/config/constants";
import type { GameStartResponse, GameSubmitResponse } from "@/lib/schemas/game";

import {
  EXPECTED_ROUND_SCORES,
  EXPECTED_TOTAL,
  FIXED_GUESSES,
  FIXED_TARGETS,
} from "../support/game";

const GAME: GameStartResponse = {
  gameToken: "signed-daily-token",
  mode: "daily",
  revealMs: REVEAL_MS,
  timerSeconds: null,
  expiresAt: "2026-10-30T12:00:00.000Z",
  challengeDate: "2026-10-29",
  roomCode: null,
  rounds: FIXED_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target: { h: target.h, s: target.s, v: target.v },
  })),
};

function makeResult(overrides: Partial<GameSubmitResponse> = {}): GameSubmitResponse {
  return {
    mode: "daily",
    totalScore: EXPECTED_TOTAL,
    rounds: FIXED_TARGETS.map((target, index) => ({
      roundNumber: index + 1,
      target: { h: target.h, s: target.s, v: target.v },
      guess: FIXED_GUESSES[index] ?? SLIDER_DEFAULTS,
      score: EXPECTED_ROUND_SCORES[index] ?? 0,
      diff: { h: 5.6, s: 3.5, v: 3.5 },
    })),
    totalGamesPlayed: 4,
    pb: {
      scope: "daily",
      previous: null,
      current: EXPECTED_TOTAL,
      updated: true,
      beatExisting: false,
    },
    streak: { current: 3, longest: 7 },
    achievements: [],
    room: null,
    ...overrides,
  };
}

function starting(): GameMachineState {
  return gameMachineReducer(initialGameMachineState, { type: "START" });
}

function revealing(): GameMachineState {
  return gameMachineReducer(starting(), { type: "GAME_STARTED", game: GAME });
}

function submitting(): GameMachineState {
  let state = gameMachineReducer(revealing(), { type: "REVEAL_ENDED" });

  for (let round = 0; round < ROUNDS_PER_GAME; round += 1) {
    const guess = FIXED_GUESSES[round] ?? SLIDER_DEFAULTS;
    state = gameMachineReducer(state, { type: "SET_GUESS", guess });
    state = gameMachineReducer(state, { type: "SUBMIT_GUESS" });
    state = gameMachineReducer(state, {
      type: "ROUND_SCORED",
      score: {
        roundNumber: round + 1,
        target: FIXED_TARGETS[round] ?? SLIDER_DEFAULTS,
        guess,
        score: [9.7, 9.9, 5.7][round] ?? 0,
        diff: { h: 5.6, s: 3.5, v: 3.5 },
      },
    });
    state = gameMachineReducer(state, { type: "NEXT_ROUND" });
    if (round < ROUNDS_PER_GAME - 1) {
      state = gameMachineReducer(state, { type: "REVEAL_ENDED" });
    }
  }

  return state;
}

function renderView(state: GameMachineState): string {
  return renderToStaticMarkup(
    <DailyGameView
      state={state}
      start={() => undefined}
      setGuess={() => undefined}
      submitGuess={() => undefined}
      nextRound={() => undefined}
      retry={() => undefined}
      playAgain={() => undefined}
    />,
  );
}

function resultState(result: GameSubmitResponse): GameMachineState {
  return gameMachineReducer(submitting(), { type: "SUBMIT_SUCCEEDED", result });
}

describe("DailyGameView", () => {
  it("shows Daily copy on the intro screen", () => {
    const html = renderView(initialGameMachineState);

    expect(html).toContain("Daily");
    expect(html).toContain("Same palette for everyone");
    expect(html).toContain("Play Daily");
    expect(html).not.toContain("Play Global");
  });

  it("shows the round score before the next reveal", () => {
    const guess = FIXED_GUESSES[0] ?? SLIDER_DEFAULTS;
    let state = gameMachineReducer(revealing(), { type: "REVEAL_ENDED" });
    state = gameMachineReducer(state, { type: "SET_GUESS", guess });
    state = gameMachineReducer(state, { type: "SUBMIT_GUESS" });
    state = gameMachineReducer(state, {
      type: "ROUND_SCORED",
      score: {
        roundNumber: 1,
        target: FIXED_TARGETS[0] ?? SLIDER_DEFAULTS,
        guess,
        score: 9.7,
        diff: { h: 5.6, s: 3.5, v: 3.5 },
      },
    });

    const html = renderView(state);

    expect(html).toContain('data-testid="round-score"');
    expect(html).toContain("Round score");
    expect(html).toContain("9.7");
    expect(html).toContain("Next round");
  });

  it("unmounts the target swatch when the reveal ends", () => {
    const reveal = revealing();
    const revealHtml = renderView(reveal);

    expect(revealHtml).toContain('data-testid="target-swatch"');
    expect(revealHtml).toContain('role="progressbar"');
    expect(revealHtml).toContain("Daily");

    const guessHtml = renderView(gameMachineReducer(reveal, { type: "REVEAL_ENDED" }));

    expect(guessHtml).not.toContain('data-testid="target-swatch"');
    expect(guessHtml).toContain('data-testid="guess-preview"');
    expect(guessHtml).toContain("Submit guess");
  });

  it("renders the Daily result with daily PB copy, streak and the Daily board link", () => {
    const html = renderView(resultState(makeResult()));

    expect(html).toContain("Daily logged.");
    expect(html).toContain("First Daily benchmark");
    expect(html).not.toContain("First Global benchmark");
    expect(html).toContain('data-testid="daily-streak"');
    expect(html).toContain("current");
    expect(html).toContain("longest");
    expect(html).toContain('href="/leaderboard/daily"');
    expect(html).toContain("Daily board");
    expect(html).toContain("25.3");
    expect(html).toContain('data-testid="round-split-swatch-3"');
  });

  it("celebrates a streak only at a 3/7/30 milestone on the first run of the day", () => {
    const milestone = renderView(resultState(makeResult({ streak: { current: 3, longest: 3 } })));
    expect(milestone).toContain("3-day streak!");

    const midStreak = renderView(resultState(makeResult({ streak: { current: 4, longest: 4 } })));
    expect(midStreak).not.toContain("-day streak!");
    expect(midStreak).toContain('data-testid="daily-streak"');

    const repeatPlay = renderView(
      resultState(
        makeResult({
          streak: { current: 7, longest: 7 },
          pb: { scope: "daily", previous: 20, current: 20, updated: false, beatExisting: false },
        }),
      ),
    );
    expect(repeatPlay).not.toContain("-day streak!");
  });

  it("uses the new-daily-best copy when a Daily best is beaten", () => {
    const html = renderView(
      resultState(
        makeResult({
          pb: {
            scope: "daily",
            previous: 20,
            current: EXPECTED_TOTAL,
            updated: true,
            beatExisting: true,
          },
        }),
      ),
    );

    expect(html).toContain("New daily best!");
    expect(html).not.toContain("New personal best!");
  });
});
