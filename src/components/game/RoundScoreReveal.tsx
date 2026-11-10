"use client";

import type { CSSProperties } from "react";

import { Button, ErrorMessage, ScoreCountUp } from "@/components/ui";
import type { GameRoundScoreResponse } from "@/lib/schemas/game";
import { cn } from "@/lib/cn";

import { ChannelDiffBars } from "./ChannelDiffBars";
import { ColorSwatch } from "./ColorSwatch";

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

function gradeFor(score: number): { label: string; tone: string } {
  if (score >= 9.5) return { label: "Tight", tone: "text-success border-success/50 bg-success/10" };
  if (score >= 8)
    return { label: "Close", tone: "text-accent-cyan border-accent-cyan/50 bg-accent-cyan/10" };
  if (score >= 5) return { label: "Loose", tone: "text-warning border-warning/50 bg-warning-soft" };
  return { label: "Wide", tone: "text-danger border-danger/50 bg-danger-soft" };
}

const BURST_COLORS = [
  "#ff3b5c",
  "#ff7a1a",
  "#ffd000",
  "#16d39a",
  "#00b8e6",
  "#a855f7",
  "#ffd166",
  "#4be0e8",
] as const;

const SCORE_BURST = BURST_COLORS.map((color, index) => {
  const angle = (index / BURST_COLORS.length) * Math.PI * 2 - Math.PI / 2;
  const radius = index % 2 === 0 ? 118 : 86;
  return {
    color,
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
    rotate: `${index * 41}deg`,
  };
});

function ScoreBurst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {SCORE_BURST.map((chip, index) => (
        <span
          key={index}
          className="cm-burst-chip"
          style={
            {
              backgroundColor: chip.color,
              left: "42%",
              top: "28%",
              animationDelay: "650ms",
              "--chip-x": `${chip.x}px`,
              "--chip-y": `${chip.y}px`,
              "--chip-rotate": chip.rotate,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function HsvBadge({ value }: { value: { h: number; s: number; v: number } }) {
  return (
    <span className="font-mono text-[8px] tracking-[0.02em] text-white/90 tabular-nums">
      H {value.h.toFixed(1)} · S {value.s.toFixed(1)} · V {value.v.toFixed(1)}
    </span>
  );
}

function SplitWell({
  target,
  guess,
}: {
  target: GameRoundScoreResponse["target"];
  guess: GameRoundScoreResponse["guess"];
}) {
  const rows = [
    { label: "Target", value: target },
    { label: "Your mix", value: guess },
  ] as const;

  return (
    <div className="overflow-hidden rounded-[0.7rem] border-2 border-border">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={cn("relative h-24 sm:h-28", index === 0 && "border-b-2 border-border")}
        >
          <ColorSwatch hsv={row.value} label={`${row.label} colour`} size="fill" frame="none" />
          <span className="absolute top-2 left-2 rounded-[0.25rem] border border-white/25 bg-black/55 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.14em] text-white uppercase backdrop-blur-sm">
            {row.label}
          </span>
          <span className="absolute right-2 bottom-2 rounded-[0.25rem] border border-white/25 bg-black/55 px-1.5 py-0.5 backdrop-blur-sm">
            <HsvBadge value={row.value} />
          </span>
        </div>
      ))}
    </div>
  );
}

export interface RoundScoreRevealProps {
  roundNumber: number;
  totalRounds: number;
  modeLabel: string;
  score: GameRoundScoreResponse | null;
  error: { message: string } | null;
  isLastRound: boolean;
  timedOut?: boolean;
  onNext: () => void;
}

/**
 * The beat between guess and next reveal. Shows the server-scored round result
 * only; the stage stays mounted for the next round after the player advances.
 */
export function RoundScoreReveal({
  roundNumber,
  totalRounds,
  modeLabel,
  score,
  error,
  isLastRound,
  timedOut = false,
  onNext,
}: RoundScoreRevealProps) {
  const grade = score ? gradeFor(score.score) : null;
  const cells = score ? Math.round(score.score) : 0;
  const nextLabel = isLastRound ? "See total" : "Next round";

  return (
    <section data-testid="round-score" className="cm-rise">
      <div className="cm-cabinet overflow-hidden p-0">
        <div className="cm-marquee flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5 sm:px-7">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
            Round {String(roundNumber).padStart(2, "0")} score
          </p>
          <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-white/45 uppercase">
            {modeLabel}
          </p>
        </div>

        {score && grade ? (
          <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-stretch">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="cm-eyebrow text-muted-foreground">
                    Round {roundNumber} of {totalRounds}
                  </p>
                  <h2 className="cm-stencil mt-1 text-3xl leading-none sm:text-4xl">How close?</h2>
                </div>
                <span
                  className={cn(
                    "cm-grade rounded-[0.3rem] border-2 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.16em] uppercase",
                    grade.tone,
                  )}
                >
                  {grade.label}
                </span>
              </div>

              <div className="mt-4">
                <SplitWell target={score.target} guess={score.guess} />
              </div>

              <div className="mt-4">
                <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                  Channel deltas
                </p>
                <ChannelDiffBars diff={score.diff} className="mt-2" />
              </div>
            </div>

            <div className={cn("h-full", score.score >= 9.5 && "cm-star-frame rounded-[0.9rem]")}>
              <div className="cm-led-well relative flex h-full flex-col justify-between overflow-hidden rounded-[0.85rem] px-4 py-4 text-right">
                {score.score >= 9 ? <ScoreBurst /> : null}
                <div className="relative z-10">
                  <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-[var(--screen-muted)] uppercase">
                    Round score
                  </p>
                  <p className="cm-led-gold mt-1 font-display text-6xl leading-none font-extrabold tracking-tight">
                    <ScoreCountUp value={score.score} max={10} />
                  </p>
                  <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-[var(--screen-muted)] uppercase">
                    out of 10
                  </p>
                </div>

                <div className="relative z-10 mt-5">
                  <div className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "cm-score-cell h-5 flex-1 rounded-[0.12rem] border",
                          index < cells
                            ? "border-[var(--screen-gold)]/60 bg-[var(--screen-gold)]"
                            : "border-[var(--screen-line)] bg-white/5",
                        )}
                        style={{ animationDelay: `${index * 40}ms` } as CSSProperties}
                      />
                    ))}
                  </div>
                  {timedOut ? (
                    <p className="mt-2 rounded-[0.25rem] border border-warning/50 bg-warning/10 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.14em] text-warning uppercase">
                      Timed out
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="p-4 sm:p-5">
            <ErrorMessage title="Round score unavailable" message={error.message} />
            <p className="mt-3 text-sm text-muted-foreground">
              Your guess is saved in this tab. You can keep going; the final score is still
              server-scored.
            </p>
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center p-6">
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Reading the round…
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border bg-muted/25 px-4 py-3 sm:px-5">
          <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            {isLastRound ? "One more step" : `Next: round ${roundNumber + 1}`}
          </p>
          <Button size="lg" onClick={onNext}>
            {error ? "Continue" : nextLabel}
            <ArrowIcon />
          </Button>
        </div>
      </div>
    </section>
  );
}
