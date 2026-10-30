"use client";

import type { CSSProperties } from "react";

import { Button, Card, ErrorMessage, ModeGlyph, Spinner, Wordmark } from "@/components/ui";
import type { Hsv } from "@/lib/domain/hsv";
import type { GameMachineState } from "@/hooks/useGameMachine";

import { ColorSwatch } from "./ColorSwatch";
import { GameResult } from "./GameResult";
import { GameStage } from "./GameStage";
import { HsvSliders } from "./HsvSliders";
import { RoundProgress } from "./RoundProgress";

const STAGE_KEYCAP_STYLE = { "--keycap-lip": "var(--stage-border)" } as CSSProperties;

function PageHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <ModeGlyph kind="global" size="md" />
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Mode
          </p>
          <h1 className="truncate text-xl font-bold tracking-tight">Global</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="/home"
          className="inline-flex min-h-9 items-center rounded-[0.625rem] px-2 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          ← Home
        </a>
        <Wordmark size="sm" />
      </div>
    </header>
  );
}

function StageSubmitButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={STAGE_KEYCAP_STYLE}
      className="cm-keycap cm-keycap-secondary inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-stage-border bg-stage-surface px-6 py-3 font-display text-base font-semibold tracking-tight text-stage-fg select-none hover:bg-stage-border focus-visible:ring-2 focus-visible:ring-stage-fg focus-visible:ring-offset-2 focus-visible:ring-offset-stage-bg focus-visible:outline-none"
    >
      Submit guess
    </button>
  );
}

function GameFallback({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <ErrorMessage title="Game unavailable" message={message} onRetry={retry} />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <a
          href="/home"
          className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          Back to home
        </a>
      </p>
    </div>
  );
}

export interface GlobalGameViewProps {
  state: GameMachineState;
  start: () => void;
  setGuess: (guess: Hsv) => void;
  submitGuess: () => void;
  retry: () => void;
  playAgain: () => void;
}

/**
 * Presentational Global game screen. All transitions come from the reducer, so
 * the reveal/guess/result states can be rendered directly in component tests.
 */
export function GlobalGameView({
  state,
  start,
  setGuess,
  submitGuess,
  retry,
  playAgain,
}: GlobalGameViewProps) {
  function renderPhase() {
    switch (state.phase) {
      case "IDLE":
        return (
          <Card elevated className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <ModeGlyph kind="global" size="lg" />
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight">Global</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Three random colours. Five seconds each. No guess timer.
                </p>
              </div>
            </div>

            <ul className="mt-6 grid gap-2 sm:grid-cols-3">
              {["3 rounds", "5s reveal", "Score /30"].map((item) => (
                <li
                  key={item}
                  className="rounded-[0.875rem] border border-border bg-muted/60 px-3 py-2 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
                >
                  {item}
                </li>
              ))}
            </ul>

            <Button size="lg" onClick={start} className="mt-6 w-full sm:w-auto">
              Start game
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Guesses stay in this tab until you submit.
            </p>
          </Card>
        );

      case "STARTING":
        return (
          <Card elevated className="p-6 sm:p-8">
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <Spinner size="lg" label="Mixing colours" />
              <p className="text-sm text-muted-foreground">Mixing three random colours…</p>
            </div>
          </Card>
        );

      case "ROUND_REVEAL": {
        const target = state.game?.rounds[state.roundIndex]?.target;

        if (!state.game || !target) {
          return <GameFallback message="The round could not be loaded." retry={retry} />;
        }

        return (
          <>
            <RoundProgress
              currentRound={state.roundIndex + 1}
              completedRounds={state.guesses.length}
              className="mb-3"
            />
            <GameStage
              roundNumber={state.roundIndex + 1}
              modeLabel="Global"
              phaseLabel="Memorise swatch"
              countdown={{
                remainingMs: state.revealRemainingMs,
                totalMs: state.game.revealMs,
                label: "Reveal window",
              }}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-stage-muted uppercase">
                    Target colour
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-stage-muted uppercase">
                    Hold it
                  </p>
                </div>
                <ColorSwatch
                  hsv={target}
                  label={`Round ${state.roundIndex + 1} target colour`}
                  size="reveal"
                  tone="stage"
                  testId="target-swatch"
                />
              </div>
            </GameStage>
          </>
        );
      }

      case "ROUND_GUESS": {
        if (!state.game) {
          return <GameFallback message="The round could not be loaded." retry={retry} />;
        }

        return (
          <>
            <RoundProgress
              currentRound={state.roundIndex + 1}
              completedRounds={state.guesses.length}
              className="mb-3"
            />
            <GameStage
              roundNumber={state.roundIndex + 1}
              modeLabel="Global"
              phaseLabel="Recreate from memory"
              footer={<StageSubmitButton onClick={submitGuess} />}
            >
              <HsvSliders value={state.currentGuess} onChange={setGuess} />
            </GameStage>
          </>
        );
      }

      case "SUBMITTING":
        return (
          <Card elevated className="p-6 sm:p-8">
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <Spinner size="lg" label="Scoring your guesses" />
              <p className="text-sm text-muted-foreground">Scoring your mix…</p>
            </div>
          </Card>
        );

      case "RESULT":
        return state.result ? (
          <GameResult result={state.result} onPlayAgain={playAgain} />
        ) : (
          <GameFallback message="The result could not be loaded." retry={retry} />
        );

      case "ERROR":
        return state.error ? (
          <div className="mx-auto max-w-xl">
            <ErrorMessage
              title={
                state.error.retry === "start"
                  ? "Couldn't start the game"
                  : "Couldn't score the game"
              }
              message={state.error.message}
              onRetry={retry}
              retryLabel="Try again"
            />
            {state.error.retry === "submit" ? (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Your guesses are still in this tab.
              </p>
            ) : null}
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <a
                href="/home"
                className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                Back to home
              </a>
            </p>
          </div>
        ) : (
          <GameFallback message="The game could not be recovered." retry={retry} />
        );

      default:
        return <GameFallback message="The game state is unavailable." retry={retry} />;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader />
      <div className="mt-6">{renderPhase()}</div>
    </div>
  );
}
