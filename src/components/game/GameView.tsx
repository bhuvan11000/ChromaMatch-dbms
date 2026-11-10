"use client";

import type { CSSProperties, ReactNode } from "react";

import { Button, ErrorMessage, ModeGlyph, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ROUNDS_PER_GAME } from "@/lib/config/constants";
import type { Hsv } from "@/lib/domain/hsv";
import { getGuessCountdown, type GameMachineState } from "@/hooks/useGameMachine";
import type { GameMode } from "@/lib/schemas/game";

import { ColorSwatch } from "./ColorSwatch";
import { GameResult } from "./GameResult";
import { GameStage } from "./GameStage";
import { HsvSliders } from "./HsvSliders";
import { RoundProgress } from "./RoundProgress";
import { RoundScoreReveal } from "./RoundScoreReveal";

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
    kicker: "Global · Random palette",
    title: "Flash. Mix. Repeat.",
    blurb: "Three random colours. Five seconds each. Rebuild them from memory.",
    cta: "Play Global",
    startingHint: "Three random colours incoming",
    chips: ["3 rounds", "5s flash", "Score /30"],
    note: "Guesses stay in this tab until you submit.",
  },
  daily: {
    name: "Daily",
    kicker: "Daily · One shared palette",
    title: "One palette. Everyone.",
    blurb: "Same palette for everyone today. Five seconds per colour.",
    cta: "Play Daily",
    startingHint: "Today's shared palette incoming",
    chips: ["3 rounds", "5s flash", "Best of the day"],
    note: "Your best score of the day counts. Play as often as you like.",
  },
  room: {
    name: "Room",
    kicker: "Room · Shared palette",
    title: "Same palette. Your room.",
    blurb: "Everyone in the room gets the same three colours, in their own order.",
    cta: "Play attempt",
    startingHint: "Your room's palette incoming",
    chips: ["3 rounds", "5s flash", "Score /30"],
    note: "Guesses stay in this tab until you submit.",
  },
};

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M4.5 10h10M10.5 6 14.5 10l-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M6 4.5 15.5 10 6 15.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <ModeGlyph kind={mode} size="md" />
        <div className="min-w-0">
          <p className="cm-eyebrow text-muted-foreground">Mode</p>
          <h1 className="mt-0.5 truncate text-2xl font-extrabold tracking-tight">{title}</h1>
        </div>
      </div>

      <a
        href={backHref}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-[0.5rem] border-2 border-border bg-card px-3 py-1.5 font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase shadow-[0_2px_0_var(--border-lip)] transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <span aria-hidden="true">←</span>
        {backLabel.replace("← ", "")}
      </a>
    </header>
  );
}

function IntroPreview({ mode }: { mode: GameMode }) {
  return (
    <div aria-hidden="true" className="cm-screen overflow-hidden rounded-[0.85rem]">
      <div className="flex items-center justify-between border-b border-[var(--screen-line)] px-4 py-2.5 font-mono text-[9px] font-bold tracking-[0.18em] uppercase">
        <span className="text-[var(--screen-muted)]">Palette preview</span>
        <span className="text-[var(--screen-cyan)]">
          {mode === "daily" ? "Today" : mode === "room" ? "Room" : "Random"}
        </span>
      </div>

      <div className="flex gap-2 px-4 pt-4">
        {["#ff3b5c", "#ffd000", "#16d39a"].map((color) => (
          <span
            key={color}
            className="h-14 flex-1 rounded-[0.35rem] border border-white/20 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <div className="flex items-end justify-between gap-3 px-4 py-4">
        <div>
          <p className="font-mono text-[8px] tracking-[0.16em] text-[var(--screen-muted)] uppercase">
            Each colour
          </p>
          <p className="cm-led-gold font-display text-3xl leading-none font-extrabold">5.0s</p>
        </div>
        <p className="text-right font-mono text-[8px] leading-relaxed tracking-[0.14em] text-[var(--screen-muted)] uppercase">
          3 rounds
          <br />1 score
        </p>
      </div>

      <div className="grid grid-cols-3 border-t border-[var(--screen-line)]">
        {["See", "Mix", "Score"].map((step, index) => (
          <div
            key={step}
            className="flex items-center justify-center gap-1.5 border-r border-[var(--screen-line)] py-2 last:border-r-0"
          >
            <span className="font-mono text-[8px] text-[var(--screen-muted)]">0{index + 1}</span>
            <span className="font-mono text-[8px] font-bold tracking-[0.12em] text-[var(--screen-fg)] uppercase">
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageSubmitButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={STAGE_KEYCAP_STYLE}
      className="cm-keycap cm-keycap-secondary inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-[0.7rem] border-stage-fg/20 bg-stage-fg px-6 py-3 font-display text-sm font-extrabold tracking-[0.055em] text-stage-bg uppercase select-none hover:bg-white focus-visible:ring-2 focus-visible:ring-stage-fg focus-visible:ring-offset-2 focus-visible:ring-offset-stage-bg focus-visible:outline-none sm:w-auto"
    >
      Submit guess
      <ArrowIcon />
    </button>
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
          className="rounded-sm font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
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
  nextRound: () => void;
  retry: () => void;
  playAgain: () => void;
}

/**
 * Presentational game screen shared by all modes. All transitions come from
 * the reducer, so the reveal/guess/result states can be rendered directly in
 * component tests.
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
  nextRound,
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
          <div className="cm-cabinet cm-rise overflow-hidden p-0">
            <div className="cm-marquee flex items-center justify-between gap-3 px-5 pt-4 pb-2.5 sm:px-6">
              <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/65 uppercase">
                {copy.kicker}
              </p>
              <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/45 uppercase">
                3 rounds
              </p>
            </div>

            <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
              <div className="min-w-0">
                <h2 className="cm-stencil text-4xl leading-[0.95] sm:text-5xl">{copy.title}</h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {copy.blurb}
                </p>

                <ul className="mt-5 grid max-w-md grid-cols-3 gap-2">
                  {copy.chips.map((item, index) => (
                    <li
                      key={item}
                      className="rounded-[0.6rem] border-2 border-border bg-muted/55 px-3 py-2.5"
                    >
                      <span className="block font-mono text-[8px] font-bold tracking-[0.16em] text-muted-foreground">
                        0{index + 1}
                      </span>
                      <span className="mt-1 block font-display text-xs font-extrabold tracking-tight">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button size="lg" onClick={start}>
                    <PlayIcon />
                    {copy.cta}
                  </Button>
                  <p className="max-w-[15rem] font-mono text-[9px] leading-relaxed tracking-[0.06em] text-muted-foreground">
                    {copy.note}
                  </p>
                </div>
              </div>

              <IntroPreview mode={mode} />
            </div>
          </div>
        );

      case "STARTING":
        return (
          <div className="cm-cabinet overflow-hidden p-0">
            <div className="cm-marquee px-5 pt-4 pb-2.5">
              <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
                Loading
              </p>
            </div>
            <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center">
              <Spinner size="lg" label="Loading palette" />
              <p className="font-display text-2xl font-extrabold tracking-tight">
                Loading the palette…
              </p>
              <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
                {copy.startingHint}
              </p>
            </div>
          </div>
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
            <div className="cm-stage-bezel">
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
                <div className="relative overflow-hidden rounded-[0.7rem] border-2 border-stage-border">
                  <ColorSwatch
                    hsv={target}
                    label={`Round ${state.roundIndex + 1} target colour`}
                    size="canvas"
                    tone="stage"
                    frame="none"
                    testId="target-swatch"
                  />
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-[0.35rem] border border-white/25 bg-black/55 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.18em] text-white uppercase backdrop-blur-sm">
                        Target colour
                      </span>
                      <span className="rounded-[0.35rem] border border-white/25 bg-black/55 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.16em] text-white/80 uppercase backdrop-blur-sm">
                        Round {state.roundIndex + 1}
                      </span>
                    </div>
                    <span className="self-end rounded-[0.35rem] border border-white/25 bg-black/55 px-2.5 py-1 font-mono text-[9px] tracking-[0.16em] text-white/80 uppercase backdrop-blur-sm">
                      Hold it
                    </span>
                  </div>
                </div>
              </GameStage>
            </div>
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
            <div className="cm-stage-bezel">
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
            </div>
          </>
        );
      }

      case "ROUND_SCORING":
        return (
          <div className="cm-cabinet overflow-hidden p-0">
            <div className="cm-marquee px-5 pt-4 pb-2.5">
              <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
                Scoring round {state.roundIndex + 1}
              </p>
            </div>
            <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center">
              <Spinner size="lg" label="Scoring your guess" />
              <p className="font-display text-2xl font-extrabold tracking-tight">
                Reading the mix…
              </p>
              <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
                Server-scored · nothing saved yet
              </p>
            </div>
          </div>
        );

      case "ROUND_SCORE":
        return (
          <RoundScoreReveal
            roundNumber={state.roundIndex + 1}
            totalRounds={ROUNDS_PER_GAME}
            modeLabel={stageLabel}
            score={state.roundScore}
            error={state.roundScoreError}
            isLastRound={state.roundIndex + 1 >= ROUNDS_PER_GAME}
            timedOut={state.timedOut[state.roundIndex] ?? false}
            onNext={nextRound}
          />
        );

      case "SUBMITTING":
        return (
          <div className="cm-cabinet overflow-hidden p-0">
            <div className="cm-marquee px-5 pt-4 pb-2.5">
              <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
                Scoring
              </p>
            </div>
            <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center">
              <Spinner size="lg" label="Scoring your guesses" />
              <p className="font-display text-2xl font-extrabold tracking-tight">
                Scoring the round…
              </p>
              <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
                Three rounds · one score
              </p>
            </div>
          </div>
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
                className="rounded-sm font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
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

  const isFlowPhase =
    state.phase === "IDLE" ||
    state.phase === "STARTING" ||
    state.phase === "ROUND_REVEAL" ||
    state.phase === "ROUND_GUESS" ||
    state.phase === "ROUND_SCORING" ||
    state.phase === "ROUND_SCORE" ||
    state.phase === "SUBMITTING";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col lg:min-h-[calc(100dvh-11rem)]">
      <PageHeader mode={mode} title={copy.name} backHref={backHref} backLabel={backLabel} />
      <div className={cn("mt-5 flex-1", isFlowPhase && "lg:flex lg:flex-col lg:justify-center")}>
        {renderPhase()}
      </div>
    </div>
  );
}
