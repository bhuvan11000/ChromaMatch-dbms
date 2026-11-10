"use client";

import { useState, type ReactNode } from "react";

import {
  Button,
  Card,
  Celebration,
  ScoreCountUp,
  formatScoreTenths,
  type CelebrationKind,
} from "@/components/ui";
import { MAX_GAME_SCORE, MAX_ROUND_SCORE } from "@/lib/config/constants";
import type { Hsv } from "@/lib/domain/hsv";
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

/** Daily streak lengths that earn a celebration (UI_THEME §5). */
export const STREAK_MILESTONES = [3, 7, 30] as const;

const EMPHASIZED_LINK_CLASSES =
  "cm-keycap cm-keycap-outline inline-flex min-h-12 items-center justify-center gap-2 rounded-[0.7rem] border-border bg-primary/10 px-6 py-3 font-display text-sm font-extrabold tracking-[0.055em] text-foreground uppercase select-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

const OUTLINE_LINK_CLASSES =
  "cm-keycap cm-keycap-outline inline-flex min-h-12 items-center justify-center gap-2 rounded-[0.7rem] border-border bg-transparent px-6 py-3 font-display text-sm font-extrabold tracking-[0.055em] text-foreground uppercase select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M5 4.5 15.5 10 5 15.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M6.5 3.5h7v3.8a3.5 3.5 0 0 1-7 0V3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 4.7H4.3v1.5a2.7 2.7 0 0 0 2.7 2.7M13.5 4.7h2.2v1.5a2.7 2.7 0 0 1-2.7 2.7M10 10.8v2.7M7.2 16.5h5.6M8.3 13.5h3.4l.6 3H7.7l.6-3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function RoundSplitSwatch({
  target,
  guess,
  roundNumber,
}: {
  target: Hsv;
  guess: Hsv;
  roundNumber: number;
}) {
  return (
    <div
      data-testid={`round-split-swatch-${roundNumber}`}
      className="overflow-hidden rounded-[0.75rem] border-2 border-border bg-card"
    >
      <div className="relative h-32 sm:h-36">
        <ColorSwatch
          hsv={target}
          label={`Round ${roundNumber} target colour`}
          size="fill"
          frame="none"
        />
        <span className="absolute top-2.5 left-2.5 rounded-[0.3rem] border border-white/25 bg-black/55 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.16em] text-white uppercase backdrop-blur-sm">
          Target
        </span>
        <span className="absolute right-2.5 bottom-2.5 rounded-[0.3rem] border border-white/25 bg-black/55 px-2 py-1 font-mono text-[8px] text-white/90 tabular-nums backdrop-blur-sm">
          H {target.h.toFixed(1)} · S {target.s.toFixed(1)} · V {target.v.toFixed(1)}
        </span>
      </div>

      <div className="h-0.5 bg-border" />

      <div className="relative h-32 sm:h-36">
        <ColorSwatch hsv={guess} label={`Round ${roundNumber} guess`} size="fill" frame="none" />
        <span className="absolute top-2.5 left-2.5 rounded-[0.3rem] border border-white/25 bg-black/55 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.16em] text-white uppercase backdrop-blur-sm">
          Your mix
        </span>
        <span className="absolute right-2.5 bottom-2.5 rounded-[0.3rem] border border-white/25 bg-black/55 px-2 py-1 font-mono text-[8px] text-white/90 tabular-nums backdrop-blur-sm">
          H {guess.h.toFixed(1)} · S {guess.s.toFixed(1)} · V {guess.v.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export interface GameResultProps {
  result: GameSubmitResponse;
  onPlayAgain: () => void;
  className?: string;
  /**
   * Overrides the heading copy. Used by room results; Global and Daily derive
   * theirs from `result.mode`.
   */
  header?: { kicker: string; title: string };
  /** Extra panel between the notices and the rounds (e.g. room summary). */
  summary?: ReactNode;
  /** Replaces the default Play again / leaderboard buttons. */
  actions?: ReactNode;
}

/**
 * Result screen — deliberately outside <GameStage>.
 *
 * Scores, differences and totals are rendered exactly as the server returned
 * them; this component never imports the scoring domain module.
 */
export function GameResult({
  result,
  onPlayAgain,
  className,
  header,
  summary,
  actions,
}: GameResultProps) {
  const isDaily = result.mode === "daily";
  const pb = result.pb;
  const isFirstPb = pb !== null && pb.previous === null;
  const isNewPb = pb !== null && (pb.beatExisting || isFirstPb);

  const notices: ResultNotice[] = [];

  if (pb && isNewPb) {
    notices.push({
      kind: "pb",
      title: isFirstPb
        ? isDaily
          ? "First Daily benchmark"
          : "First Global benchmark"
        : isDaily
          ? "New daily best!"
          : "New personal best!",
      subtitle: isFirstPb
        ? isDaily
          ? "Your first score of the day is on the board."
          : "Your first score is on the board."
        : `Previous best ${formatScore(pb.previous ?? 0)}.`,
      detail: isFirstPb
        ? `Set at ${formatScore(pb.current)} / ${MAX_GAME_SCORE}`
        : `+${formatScore(pb.current - (pb.previous ?? 0))} over your previous best`,
    });
  }

  // The SQL result has no "previous streak", so celebrate only on the first run
  // of the day (the only run that can extend a streak) and only at a milestone.
  const streak = isDaily ? (result.streak ?? null) : null;
  const streakMilestone =
    streak !== null &&
    isFirstPb &&
    (STREAK_MILESTONES as readonly number[]).includes(streak.current);

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
    <section aria-labelledby="game-result-heading" className={cn("cm-rise space-y-4", className)}>
      <header className="cm-cabinet overflow-hidden p-0">
        <div className="cm-marquee flex items-center justify-between gap-3 px-5 pt-4 pb-2.5 sm:px-7">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/65 uppercase">
            {header?.kicker ??
              (isDaily ? "Daily · Shared palette complete" : "Global · Flash complete")}
          </p>
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/45 uppercase">
            Result
          </p>
        </div>

        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <h2 id="game-result-heading" className="cm-stencil text-4xl leading-[0.95] sm:text-5xl">
              {header?.title ?? (isDaily ? "Daily logged." : "Palette logged.")}
            </h2>
            <p className="mt-2 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
              Three rounds · final score
            </p>
          </div>

          <div className="cm-led-well min-w-[13rem] rounded-[0.85rem] px-5 py-4 text-right">
            <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-[var(--screen-muted)] uppercase">
              Total
            </p>
            <div className="mt-1 flex items-end justify-end gap-1.5">
              <p className="font-display text-6xl leading-none font-extrabold tracking-tight text-[var(--screen-gold)]">
                <ScoreCountUp value={result.totalScore} max={MAX_GAME_SCORE} />
              </p>
              <p
                aria-hidden="true"
                className="pb-1.5 font-mono text-xs font-medium text-[var(--screen-muted)]"
              >
                / {MAX_GAME_SCORE}
              </p>
            </div>
            {result.totalGamesPlayed !== null ? (
              <p className="mt-2 font-mono text-[8px] tracking-[0.14em] text-[var(--screen-muted)] uppercase">
                Games played {result.totalGamesPlayed}
              </p>
            ) : null}
          </div>
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
              <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
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

      {summary}

      {streak && streakMilestone ? (
        <Celebration
          kind="streak"
          title={`${streak.current}-day streak!`}
          subtitle="You keep showing up."
          detail={`Longest streak ${streak.longest}`}
        />
      ) : null}

      {streak ? (
        <div
          data-testid="daily-streak"
          className="cm-console-card flex flex-wrap items-center gap-x-7 gap-y-3 rounded-[0.9rem] bg-card px-4 py-3.5"
        >
          <h3 className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
            Daily streak
          </h3>
          <p className="font-display text-lg font-extrabold tracking-tight tabular-nums">
            {streak.current}
            <span className="text-xs font-medium text-muted-foreground">
              {" "}
              {streak.current === 1 ? "day" : "days"} current
            </span>
          </p>
          <p className="font-display text-lg font-extrabold tracking-tight tabular-nums">
            {streak.longest}
            <span className="text-xs font-medium text-muted-foreground"> longest</span>
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {result.rounds.map((round) => (
          <Card key={round.roundNumber} className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border bg-muted/40 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-[0.4rem] border-2 border-border bg-foreground font-mono text-xs font-bold text-background tabular-nums shadow-[0_2px_0_var(--border-lip)]">
                  {round.roundNumber}
                </span>
                <div>
                  <h3 className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                    Round {round.roundNumber}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Target vs your mix</p>
                  {round.timedOut ? (
                    <span className="mt-1 inline-flex rounded-[0.25rem] border border-warning/45 bg-warning-soft px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.14em] text-warning uppercase">
                      Timed out
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="font-display text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
                {formatScore(round.score)}
                <span className="text-xs font-medium text-muted-foreground">
                  {" "}
                  / {MAX_ROUND_SCORE}
                </span>
              </p>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(15rem,0.9fr)] sm:items-center sm:p-5">
              <RoundSplitSwatch
                target={round.target}
                guess={round.guess}
                roundNumber={round.roundNumber}
              />

              <div>
                <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                  Channel deltas
                </p>
                <ChannelDiffBars diff={round.diff} className="mt-2" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {result.achievements.length > 0 ? (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-accent-violet">
              <AchievementIcon />
            </span>
            <h3 className="font-display text-base font-extrabold tracking-tight">Unlocked</h3>
          </div>
          <ul className="mt-3 space-y-3">
            {result.achievements.map((achievement) => (
              <li key={achievement.id} className="flex gap-3">
                <span aria-hidden="true" className="mt-1 shrink-0 text-accent-violet">
                  <span className="block size-2 rotate-45 bg-current" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">{achievement.name}</p>
                  <p className="text-xs text-muted-foreground">{achievement.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {actions ?? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Button size="lg" onClick={onPlayAgain}>
            <PlayIcon />
            Play again
          </Button>
          {isDaily ? (
            <>
              <a href="/leaderboard/daily" className={EMPHASIZED_LINK_CLASSES}>
                <TrophyIcon />
                Daily board
              </a>
              <a href="/leaderboard/global" className={OUTLINE_LINK_CLASSES}>
                <TrophyIcon />
                Global board
              </a>
            </>
          ) : (
            <>
              <a href="/leaderboard/global" className={OUTLINE_LINK_CLASSES}>
                <TrophyIcon />
                Global board
              </a>
              <a href="/leaderboard/daily" className={OUTLINE_LINK_CLASSES}>
                <TrophyIcon />
                Daily board
              </a>
            </>
          )}
        </div>
      )}
    </section>
  );
}
