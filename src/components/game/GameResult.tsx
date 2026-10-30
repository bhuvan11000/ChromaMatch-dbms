"use client";

import { useState } from "react";

import {
  Button,
  Card,
  Celebration,
  ScoreCountUp,
  formatScoreTenths,
  type CelebrationKind,
} from "@/components/ui";
import { MAX_GAME_SCORE, MAX_ROUND_SCORE } from "@/lib/config/constants";
import type { GameSubmitResponse } from "@/lib/schemas/game";
import { cn } from "@/lib/cn";

import { ChannelDiffBars } from "./ChannelDiffBars";
import { ColorSwatch } from "./ColorSwatch";

function formatScore(value: number): string {
  return formatScoreTenths(Math.round(value * 10));
}

interface ResultNotice {
  kind: CelebrationKind;
  title: string;
  subtitle: string;
  detail?: string;
}

const OUTLINE_LINK_CLASSES =
  "cm-keycap cm-keycap-outline inline-flex min-h-12 items-center justify-center gap-2 rounded-[1rem] border-2 border-border bg-transparent px-6 py-3 font-display text-base font-semibold tracking-tight text-foreground select-none hover:border-muted-foreground/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

function AchievementIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
      <path
        d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.2l5.9-.8L12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface GameResultProps {
  result: GameSubmitResponse;
  onPlayAgain: () => void;
  className?: string;
}

/**
 * Result screen — deliberately outside <GameStage>.
 *
 * Scores, differences and totals are rendered exactly as the server returned
 * them; this component never imports the scoring domain module.
 */
export function GameResult({ result, onPlayAgain, className }: GameResultProps) {
  const pb = result.pb;
  const isFirstPb = pb !== null && pb.previous === null;
  const isNewPb = pb !== null && (pb.beatExisting || isFirstPb);

  const notices: ResultNotice[] = [];

  if (pb && isNewPb) {
    notices.push({
      kind: "pb",
      title: isFirstPb ? "First Global benchmark" : "New personal best!",
      subtitle: isFirstPb
        ? "Your first score is on the board."
        : `Previous best ${formatScore(pb.previous ?? 0)}.`,
      detail: isFirstPb
        ? `Set at ${formatScore(pb.current)} / ${MAX_GAME_SCORE}`
        : `+${formatScore(pb.current - (pb.previous ?? 0))} over your previous best`,
    });
  }

  for (const achievement of result.achievements) {
    notices.push({
      kind: "achievement",
      title: achievement.name,
      subtitle: achievement.description,
    });
  }

  const [noticeIndex, setNoticeIndex] = useState(0);
  const activeNotice =
    notices.length > 0 ? notices[Math.min(noticeIndex, notices.length - 1)] : undefined;

  return (
    <section aria-labelledby="game-result-heading" className={cn("space-y-5", className)}>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.22em] text-muted-foreground uppercase">
            Global · Game complete
          </p>
          <h2
            id="game-result-heading"
            className="mt-1 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          >
            Palette logged.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Three rounds, scored by the server.</p>
        </div>

        <div className="cm-console-card rounded-[1.25rem] border border-border bg-card px-5 py-4 text-right">
          <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
            Total
          </p>
          <p className="mt-1 font-display text-5xl font-bold tracking-tight">
            <ScoreCountUp value={result.totalScore} max={MAX_GAME_SCORE} />
            <span aria-hidden="true" className="text-2xl font-semibold text-muted-foreground">
              {" "}
              / {MAX_GAME_SCORE}
            </span>
          </p>
          {result.totalGamesPlayed !== null ? (
            <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Games played {result.totalGamesPlayed}
            </p>
          ) : null}
        </div>
      </header>

      {notices.length > 0 && activeNotice ? (
        <div className="space-y-2">
          <Celebration
            key={`${noticeIndex}-${activeNotice.kind}-${activeNotice.title}`}
            kind={activeNotice.kind}
            title={activeNotice.title}
            subtitle={activeNotice.subtitle}
            detail={activeNotice.detail}
          />
          {notices.length > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Notice {noticeIndex + 1} / {notices.length}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNoticeIndex((index) => (index + 1) % notices.length)}
              >
                Next notice
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {result.rounds.map((round) => (
          <Card key={round.roundNumber} className="flex flex-col p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-mono text-[11px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                Round {round.roundNumber}
              </h2>
              <p className="font-mono text-lg font-bold text-foreground tabular-nums">
                {formatScore(round.score)}
                <span className="text-xs font-medium text-muted-foreground">
                  {" "}
                  / {MAX_ROUND_SCORE}
                </span>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Target
                </p>
                <ColorSwatch
                  hsv={round.target}
                  label={`Round ${round.roundNumber} target colour`}
                  size="sm"
                />
              </div>
              <div>
                <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Your guess
                </p>
                <ColorSwatch
                  hsv={round.guess}
                  label={`Round ${round.roundNumber} guess`}
                  size="sm"
                />
              </div>
            </div>

            <ChannelDiffBars diff={round.diff} className="mt-4" />
          </Card>
        ))}
      </div>

      {result.achievements.length > 0 ? (
        <Card className="p-5">
          <h2 className="text-lg font-bold tracking-tight">Unlocked this game</h2>
          <ul className="mt-3 space-y-3">
            {result.achievements.map((achievement) => (
              <li key={achievement.id} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-accent-violet">
                  <AchievementIcon />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{achievement.name}</p>
                  <p className="text-xs text-muted-foreground">{achievement.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onPlayAgain} className="sm:flex-1">
          Play again
        </Button>
        <a href="/leaderboard/global" className={cn(OUTLINE_LINK_CLASSES, "sm:flex-1")}>
          Leaderboard
        </a>
      </div>
    </section>
  );
}
