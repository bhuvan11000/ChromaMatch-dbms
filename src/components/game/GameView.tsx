"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  Button,
  Card,
  ErrorMessage,
  ModeGlyph,
  Spinner,
  TestStrip,
  Wordmark,
} from "@/components/ui";
import { ROUNDS_PER_GAME } from "@/lib/config/constants";
import type { Hsv } from "@/lib/domain/hsv";
import { getGuessCountdown, type GameMachineState } from "@/hooks/useGameMachine";
import type { GameMode } from "@/lib/schemas/game";

import { ColorSwatch } from "./ColorSwatch";
import { GameResult } from "./GameResult";
import { GameStage } from "./GameStage";
import { HsvSliders } from "./HsvSliders";
import { RoundProgress } from "./RoundProgress";

const STAGE_KEYCAP_STYLE = { "--keycap-lip": "var(--stage-border)" } as CSSProperties;

interface ModeCopy {
  name: string;
  kicker: string;
  title: string;
  blurb: string;
  cta: string;
  startingHint: string;
  chips: readonly string[];
  note: string;
}

/** Per-mode copy. Only words differ between modes; the layout is shared. */
const MODE_COPY: Record<GameMode, ModeCopy> = {
  global: {
    name: "Global",
    kicker: "Global · random palette",
    title: "Flash. Mix. Repeat.",
    blurb: "Three random colours. Five seconds each. Rebuild them from memory.",
    cta: "Play Global",
    startingHint: "Three random colours incoming",
    chips: ["3 rounds", "5s flash", "Score /30"],
    note: "Guesses stay in this tab until you submit.",
  },
  daily: {
    name: "Daily",
    kicker: "Daily · one shared palette",
    title: "Same mix. Everyone.",
    blurb: "Same palette for everyone today. One shared daily mix, five seconds each.",
    cta: "Play Daily",
    startingHint: "Today's shared palette incoming",
    chips: ["3 rounds", "5s flash", "Best of the day"],
    note: "Your best score of the day counts. Play as often as you like.",
  },
  room: {
    name: "Room",
    kicker: "Room · shared palette",
    title: "Same mix. Your room.",
    blurb: "Everyone in the room gets the same three colours, in their own order.",
    cta: "Play attempt",
    startingHint: "Your room's palette incoming",
    chips: ["3 rounds", "5s flash", "Score /30"],
    note: "Guesses stay in this tab until you submit.",
  },
};

function PageHeader({
  mode,
  title,
  backHref,
  backLabel,
}: {
  mode: GameMode;
  title: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <ModeGlyph kind={mode} size="md" />
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Mode
          </p>
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <a
          href={backHref}
          className="inline-flex min-h-9 items-center rounded-[0.625rem] px-2 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          {backLabel}
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
      className="cm-keycap cm-keycap-secondary inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] border border-stage-fg/20 bg-stage-fg px-6 py-3 font-display text-base font-semibold tracking-tight text-stage-bg select-none hover:bg-white focus-visible:ring-2 focus-visible:ring-stage-fg focus-visible:ring-offset-2 focus-visible:ring-offset-stage-bg focus-visible:outline-none sm:w-auto"
    >
      Submit guess
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
        <path
          d="M4.5 10h10M10.5 6 14.5 10l-4 4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function PlayArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M4.5 10h10M10.5 6 14.5 10l-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GameFallback({
  message,
  retry,
  backHref,
  backLabel,
}: {
  message: string;
  retry: () => void;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <ErrorMessage title="Game unavailable" message={message} onRetry={retry} />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <a
          href={backHref}
          className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          {backLabel}
        </a>
      </p>
    </div>
  );
}

export interface GameViewProps {
  /** Which mode's copy to use. Layout, stage and result are shared. */
  mode: GameMode;
  /** Room mode: shown in the stage HUD as "Room CODE". */
  roomCode?: string;
  /** Where the header back link goes; defaults to /home. */
  backHref?: string;
  backLabel?: string;
  /** Replaces the default result screen (room attempts use `RoomResult`). */
  renderResult?: (result: NonNullable<GameMachineState["result"]>) => ReactNode;
  state: GameMachineState;
  start: () => void;
  setGuess: (guess: Hsv) => void;
  submitGuess: () => void;
  retry: () => void;
  playAgain: () => void;
}

/**
 * Presentational game screen shared by Global and Daily. All transitions come
 * from the reducer, so the reveal/guess/result states can be rendered directly
 * in component tests.
 */
export function GameView({
  mode,
  roomCode,
  backHref = "/home",
  backLabel = "← Home",
  renderResult,
  state,
  start,
  setGuess,
  submitGuess,
  retry,
  playAgain,
}: GameViewProps) {
  const copy = MODE_COPY[mode];
  const stageLabel = mode === "room" && roomCode ? `Room ${roomCode}` : copy.name;
  const guessCountdown = getGuessCountdown(state);
  const errorBackLabel = backHref === "/home" ? "Back to home" : "Back to room";
  const fallback = (message: string) => (
    <GameFallback message={message} retry={retry} backHref={backHref} backLabel={errorBackLabel} />
  );

  function renderPhase() {
    switch (state.phase) {
      case "IDLE":
        return (
          <Card elevated className="relative overflow-hidden p-0">
            <div aria-hidden="true" className="cm-spectrum-bar h-1.5 w-full" />

            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex min-w-0 items-start gap-4">
                  <ModeGlyph kind={mode} size="lg" />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                      {copy.kicker}
                    </p>
                    <h2 className="mt-1 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
                      {copy.title}
                    </h2>
                    <p className="mt-2 max-w-md text-sm text-muted-foreground">{copy.blurb}</p>
                  </div>
                </div>

                <div className="w-full max-w-[11rem] shrink-0">
                  <TestStrip size="md" mystery className="-rotate-1" />
                  <p className="mt-2 text-center font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                    Three wells. No peeking.
                  </p>
                </div>
              </div>

              <ul className="mt-6 grid gap-2 sm:grid-cols-3">
                {copy.chips.map((item) => (
                  <li
                    key={item}
                    className="rounded-[0.875rem] border border-border bg-muted/60 px-3 py-2.5 font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
                  >
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={start}>
                  {copy.cta}
                  <PlayArrowIcon />
                </Button>
                <p className="text-xs text-muted-foreground">{copy.note}</p>
              </div>
            </div>
          </Card>
        );

      case "STARTING":
        return (
          <Card elevated className="p-6 sm:p-8">
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <Spinner size="lg" label="Mixing colours" />
              <p className="font-display text-lg font-bold tracking-tight">
                Calibrating the stage…
              </p>
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                {copy.startingHint}
              </p>
            </div>
          </Card>
        );

      case "ROUND_REVEAL": {
        const target = state.game?.rounds[state.roundIndex]?.target;

        if (!state.game || !target) {
          return fallback("The round could not be loaded.");
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
              modeLabel={stageLabel}
              phaseLabel="Memorise swatch"
              countdown={{
                remainingMs: state.revealRemainingMs,
                totalMs: state.game.revealMs,
                label: "Reveal window",
              }}
            >
              <div className="relative overflow-hidden rounded-[0.875rem] border-2 border-stage-border">
                <ColorSwatch
                  hsv={target}
                  label={`Round ${state.roundIndex + 1} target colour`}
                  size="canvas"
                  tone="stage"
                  frame="none"
                  testId="target-swatch"
                />
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
                  <span className="self-start rounded-full border border-white/20 bg-black/50 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.18em] text-white uppercase">
                    Target colour
                  </span>
                  <span className="self-end rounded-full border border-white/20 bg-black/50 px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] text-white/80 uppercase">
                    Hold it
                  </span>
                </div>
              </div>
            </GameStage>
          </>
        );
      }

      case "ROUND_GUESS": {
        if (!state.game) {
          return fallback("The round could not be loaded.");
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
              modeLabel={stageLabel}
              phaseLabel="Recreate from memory"
              countdown={guessCountdown ? { ...guessCountdown, hint: "Lock it in." } : null}
              footer={
                <div className="flex justify-end">
                  <StageSubmitButton onClick={submitGuess} />
                </div>
              }
            >
              <HsvSliders
                value={state.currentGuess}
                onChange={setGuess}
                roundLabel={`${String(state.roundIndex + 1).padStart(2, "0")} / ${String(
                  ROUNDS_PER_GAME,
                ).padStart(2, "0")}`}
              />
            </GameStage>
          </>
        );
      }

      case "SUBMITTING":
        return (
          <Card elevated className="p-6 sm:p-8">
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <Spinner size="lg" label="Scoring your guesses" />
              <p className="font-display text-lg font-bold tracking-tight">Developing your mix…</p>
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Three rounds, one honest score
              </p>
            </div>
          </Card>
        );

      case "RESULT":
        return state.result ? (
          renderResult ? (
            renderResult(state.result)
          ) : (
            <GameResult result={state.result} onPlayAgain={playAgain} />
          )
        ) : (
          <GameFallback
            message="The result could not be loaded."
            retry={retry}
            backHref={backHref}
            backLabel={errorBackLabel}
          />
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
          fallback("The game could not be recovered.")
        );

      default:
        return fallback("The game state is unavailable.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader mode={mode} title={copy.name} backHref={backHref} backLabel={backLabel} />
      <div className="mt-6">{renderPhase()}</div>
    </div>
  );
}
