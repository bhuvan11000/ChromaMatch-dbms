import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GlobalGameView } from "@/components/game";
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
  gameToken: "signed-game-token",
  mode: "global",
  revealMs: REVEAL_MS,
  timerSeconds: null,
  expiresAt: "2026-10-30T12:00:00.000Z",
  challengeDate: null,
  roomCode: null,
  rounds: FIXED_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target: { h: target.h, s: target.s, v: target.v },
  })),
};

const RESULT: GameSubmitResponse = {
  mode: "global",
  totalScore: EXPECTED_TOTAL,
  rounds: FIXED_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target: { h: target.h, s: target.s, v: target.v },
    guess: FIXED_GUESSES[index] ?? SLIDER_DEFAULTS,
    score: EXPECTED_ROUND_SCORES[index] ?? 0,
    diff: { h: 5.6, s: 3.5, v: 3.5 },
  })),
  totalGamesPlayed: 1,
  pb: {
    scope: "global",
    previous: null,
    current: EXPECTED_TOTAL,
    updated: true,
    beatExisting: false,
  },
  streak: null,
  achievements: [
    { id: 1, name: "First Global Game", description: "Complete your first Global game." },
  ],
  room: null,
};

function starting(): GameMachineState {
  return gameMachineReducer(initialGameMachineState, { type: "START" });
}

function revealing(): GameMachineState {
  return gameMachineReducer(starting(), { type: "GAME_STARTED", game: GAME });
}

function submitting(): GameMachineState {
  let state = gameMachineReducer(revealing(), { type: "REVEAL_ENDED" });

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

function renderView(state: GameMachineState): string {
  return renderToStaticMarkup(
    <GlobalGameView
      state={state}
      start={() => undefined}
      setGuess={() => undefined}
      submitGuess={() => undefined}
      retry={() => undefined}
      playAgain={() => undefined}
    />,
  );
}

describe("GlobalGameView", () => {
  it("unmounts the target swatch when the reveal ends", () => {
    const reveal = revealing();
    const revealHtml = renderView(reveal);

    expect(revealHtml).toContain('data-testid="target-swatch"');
    expect(revealHtml).toContain("Target colour");
    expect(revealHtml).toContain('role="progressbar"');

    const guess = gameMachineReducer(reveal, { type: "REVEAL_ENDED" });
    const guessHtml = renderView(guess);

    expect(guessHtml).not.toContain('data-testid="target-swatch"');
    expect(guessHtml).toContain('data-testid="guess-preview"');
    expect(guessHtml).toContain("Submit guess");
    expect(guessHtml).toContain("Hue");
    expect(guessHtml).toContain("Saturation");
    expect(guessHtml).toContain("Value");
  });

  it("renders the total, all three round breakdowns and result notices", () => {
    const result = gameMachineReducer(submitting(), {
      type: "SUBMIT_SUCCEEDED",
      result: RESULT,
    });
    const html = renderView(result);

    expect(html).toContain('data-testid="celebration"');
    expect(html).toContain("First Global benchmark");
    expect(html).toContain("25.3");
    expect(html).toContain("Round 1");
    expect(html).toContain("Round 2");
    expect(html).toContain("Round 3");
    expect(html).toContain('data-testid="round-split-swatch-1"');
    expect(html).toContain("Target");
    expect(html).toContain("Your mix");
    expect(html).toContain("First Global Game");
    expect(html).toContain("Play again");
    expect(html).toContain("Global board");
    expect(html).toContain("Daily board");
  });
});
