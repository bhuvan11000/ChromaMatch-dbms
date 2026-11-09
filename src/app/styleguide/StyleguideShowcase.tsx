"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import {
  ChannelDiffBars,
  ColorSwatch,
  GameResult,
  GameStage,
  GameView,
  HsvSliders,
  RoundProgress,
} from "@/components/game";
import {
  AccuracyChart,
  AchievementGrid,
  HistoryList,
  HueRegionChart,
  StatsCards,
  TrendChart,
} from "@/components/profile";
import { JoinForm, RoomCreateForm, RoomPanel, RoomResult } from "@/components/rooms";
import {
  Button,
  Card,
  Celebration,
  EmptyState,
  ErrorMessage,
  Input,
  Modal,
  ModeGlyph,
  ScoreCountUp,
  Spinner,
  TestStrip,
  Wordmark,
  useToast,
  type CelebrationKind,
} from "@/components/ui";
import { initialGameMachineState } from "@/hooks/useGameMachine";
import type { Hsv } from "@/lib/domain/hsv";
import type { GameSubmitResponse } from "@/lib/schemas/game";
import type { RoomState } from "@/lib/schemas/rooms";
import type {
  AchievementItemResponse,
  HistoryItemResponse,
  MyStatsResponse,
  StatsChannelAccuracy,
  StatsHueRegion,
  StatsTrendPoint,
} from "@/lib/schemas/stats";

const NOOP = () => undefined;

const DAILY_TARGETS: Hsv[] = [
  { h: 214.6, s: 62, v: 80.5 },
  { h: 12, s: 90, v: 70 },
  { h: 301.3, s: 45.5, v: 33 },
];

const DAILY_RESULT: GameSubmitResponse = {
  mode: "daily",
  totalScore: 25.3,
  rounds: DAILY_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target,
    guess: { h: target.h + 5, s: target.s - 2, v: target.v - 2 },
    score: [9.7, 9.9, 5.7][index] ?? 0,
    diff: { h: 5.6, s: 3.5, v: 3.5 },
  })),
  totalGamesPlayed: 12,
  pb: {
    scope: "daily",
    previous: 22,
    current: 25.3,
    updated: true,
    beatExisting: true,
  },
  streak: { current: 3, longest: 7 },
  achievements: [
    { id: 1, name: "First Daily Game", description: "Complete your first Daily game." },
  ],
  room: null,
};

const ROOM_MEMBERS: RoomState["members"] = [
  {
    userId: 1,
    username: "alice",
    isCreator: true,
    status: "active",
    attemptsUsed: 0,
    bestScore: null,
    joinedAt: "2026-10-29T12:00:00.000Z",
  },
  {
    userId: 2,
    username: "bob",
    isCreator: false,
    status: "active",
    attemptsUsed: 1,
    bestScore: 24.5,
    joinedAt: "2026-10-29T12:01:00.000Z",
  },
];

const ROOM_STANDINGS: NonNullable<RoomState["standings"]> = [
  { rank: 1, userId: 2, username: "bob", bestScore: 24.5 },
  { rank: null, userId: 1, username: "alice", bestScore: null },
];

const ROOM_LOBBY: RoomState = {
  code: "ABCD2345",
  status: "lobby",
  roomSize: 4,
  timerSeconds: 10,
  attemptsLimit: 3,
  creatorId: 1,
  createdAt: "2026-10-29T12:00:00.000Z",
  startedAt: null,
  endedAt: null,
  me: {
    userId: 1,
    isCreator: true,
    status: "active",
    attemptsUsed: 0,
    attemptsRemaining: 3,
    bestScore: null,
  },
  members: ROOM_MEMBERS,
  standings: ROOM_STANDINGS,
};

const ROOM_IN_PROGRESS: RoomState = {
  ...ROOM_LOBBY,
  status: "in_progress",
  startedAt: "2026-10-29T12:05:00.000Z",
  me: { ...ROOM_LOBBY.me, attemptsUsed: 1, attemptsRemaining: 2, bestScore: 20 },
};

const ROOM_RESULT: GameSubmitResponse = {
  mode: "room",
  totalScore: 25.3,
  rounds: DAILY_TARGETS.map((target, index) => ({
    roundNumber: index + 1,
    target,
    guess: { h: target.h + 5, s: target.s - 2, v: target.v - 2 },
    score: [9.7, 9.9, 5.7][index] ?? 0,
    diff: { h: 5.6, s: 3.5, v: 3.5 },
    timedOut: index === 1,
  })),
  totalGamesPlayed: null,
  pb: null,
  streak: null,
  achievements: [],
  room: {
    attemptNumber: 2,
    bestScore: 27.5,
    isNewBest: true,
    attemptsRemaining: 1,
    memberStatus: "active",
    roomStatus: "in_progress",
  },
};

const PROFILE_STATS: MyStatsResponse = {
  global: { bestScore: 24.6, achievedAt: "2026-10-17T14:32:08.000Z" },
  totalGamesPlayed: 41,
  daily: {
    currentStreak: 3,
    longestStreak: 7,
    lastPlayedDate: "2026-10-20",
    todayBest: 25.3,
  },
  achievementsEarned: 1,
  historyAvailable: true,
  history: null,
};

const PROFILE_ACHIEVEMENTS: AchievementItemResponse[] = [
  {
    id: 1,
    name: "First Global Game",
    description: "Complete your first Global game.",
    criteriaDescription: "Complete your first Global game.",
    earned: true,
    earnedAt: "2026-10-17T14:32:08.000Z",
  },
  {
    id: 2,
    name: "Centurion",
    description: "Complete 100 games.",
    criteriaDescription: "Complete 100 games.",
    earned: false,
    earnedAt: null,
  },
];

const PROFILE_HISTORY: HistoryItemResponse[] = [
  {
    id: "profile-global",
    mode: "global",
    playedAt: "2026-10-21T09:15:00.000Z",
    totalScore: 24.6,
    rounds: DAILY_TARGETS.map((target, index) => ({
      roundNumber: index + 1,
      target,
      guess: { h: target.h + 5, s: target.s - 2, v: target.v - 2 },
      score: [9.7, 9.9, 5.7][index] ?? 0,
    })),
  },
  {
    id: "profile-room",
    mode: "room",
    playedAt: "2026-10-20T18:00:00.000Z",
    totalScore: 22.1,
    roomId: 7,
    attemptNumber: 2,
    rounds: DAILY_TARGETS.map((target, index) => ({
      roundNumber: index + 1,
      colorNumber: index + 1,
      target,
      guess: { h: target.h + 8, s: target.s - 4, v: target.v - 4 },
      score: [8.1, 7.9, 6.1][index] ?? 0,
      timedOut: index === 1,
    })),
  },
];

const PROFILE_TREND: StatsTrendPoint[] = [
  { bucketStart: "2026-10-17", games: 2, avgScore: 18.4 },
  { bucketStart: "2026-10-18", games: 1, avgScore: 21.2 },
  { bucketStart: "2026-10-19", games: 3, avgScore: 19.7 },
  { bucketStart: "2026-10-20", games: 2, avgScore: 23.1 },
  { bucketStart: "2026-10-21", games: 1, avgScore: 24.6 },
];

const PROFILE_ACCURACY: StatsChannelAccuracy = {
  rounds: 123,
  avgAbsDiff: { h: 9.4, s: 7.2, v: 6.8 },
};

const PROFILE_HUE_REGIONS: StatsHueRegion[] = [
  { from: 0, to: 30, rounds: 11, avgScore: 7.3 },
  { from: 30, to: 60, rounds: 8, avgScore: 8.1 },
  { from: 60, to: 90, rounds: 6, avgScore: 7.9 },
  { from: 90, to: 120, rounds: 9, avgScore: 8.4 },
  { from: 120, to: 150, rounds: 4, avgScore: 6.8 },
  { from: 150, to: 180, rounds: 5, avgScore: 7.1 },
  { from: 180, to: 210, rounds: 7, avgScore: 7.7 },
  { from: 210, to: 240, rounds: 10, avgScore: 8.6 },
  { from: 240, to: 270, rounds: 5, avgScore: 7.4 },
  { from: 270, to: 300, rounds: 6, avgScore: 7.8 },
  { from: 300, to: 330, rounds: 8, avgScore: 8.2 },
  { from: 330, to: 360, rounds: 7, avgScore: 8.9 },
];

const SURFACE_TOKENS = [
  { name: "Background", token: "--background" },
  { name: "Card", token: "--card" },
  { name: "Card elevated", token: "--card-elevated" },
  { name: "Muted", token: "--muted" },
  { name: "Border", token: "--border" },
  { name: "Input well", token: "--input" },
];

const ACTION_TOKENS = [
  { name: "Primary", token: "--primary" },
  { name: "Primary lip", token: "--primary-lip" },
  { name: "Ring", token: "--ring" },
  { name: "Success", token: "--success" },
  { name: "Warning", token: "--warning" },
  { name: "Danger", token: "--danger" },
];

const STAGE_TOKENS = [
  { name: "Stage bg", token: "--stage-bg" },
  { name: "Stage surface", token: "--stage-surface" },
  { name: "Stage border", token: "--stage-border" },
  { name: "Stage text", token: "--stage-fg" },
  { name: "Stage muted", token: "--stage-muted" },
];

const CELEBRATION_KINDS: CelebrationKind[] = ["pb", "achievement", "streak", "room-win"];

const CELEBRATION_LABELS: Record<CelebrationKind, string> = {
  pb: "Personal best",
  achievement: "Achievement",
  streak: "Streak",
  "room-win": "Room win",
};

function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-10">
      <p className="font-mono text-[10px] font-bold tracking-[0.24em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h2 id={id} className="mt-2 text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Swatches({ items }: { items: { name: string; token: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.token} className="rounded-[0.875rem] border border-border bg-card p-2.5">
          <div
            aria-hidden="true"
            className="h-12 w-full rounded-[0.5rem] border border-border"
            style={{ backgroundColor: `var(${item.token})` }}
          />
          <p className="mt-2 text-xs font-semibold">{item.name}</p>
          <p className="font-mono text-[10px] break-all text-muted-foreground">{item.token}</p>
        </div>
      ))}
    </div>
  );
}

export function StyleguideShowcase() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationKind>("pb");
  const [celebrationRun, setCelebrationRun] = useState(0);
  const [scoreRun, setScoreRun] = useState(0);
  const [guess, setGuess] = useState<Hsv>({ h: 214.6, s: 62, v: 80.5 });

  // Stage countdown demo; the only motion permitted inside the stage.
  const [countdownRunning, setCountdownRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(5000);

  useEffect(() => {
    if (!countdownRunning) return;

    const endsAt = Date.now() + 5000;
    const timer = setInterval(() => {
      const left = Math.max(0, endsAt - Date.now());
      setRemainingMs(left);
      if (left === 0) {
        clearInterval(timer);
        setCountdownRunning(false);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [countdownRunning]);

  function runCountdown() {
    setRemainingMs(5000);
    setCountdownRunning(true);
  }

  function showCelebration(kind: CelebrationKind) {
    setCelebration(kind);
    setCelebrationRun((run) => run + 1);
    setScoreRun((run) => run + 1);
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl px-3.5 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Wordmark size="lg" subtitle="Studio console · styleguide" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Every control, every state
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Dev-only reference. Tokens, states, the stage and celebrations.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center rounded-[0.875rem] border-2 border-border px-4 font-display text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Back to /home
          </Link>
        </div>
      </header>

      <div className="mt-10 space-y-10">
        <Section
          id="brand"
          eyebrow="Brand"
          title="Marks & test strips"
          description="Three filters, one additive core. The test strip is the playful version of the spectrum."
        >
          <Card className="flex flex-col gap-8 p-6">
            <div className="flex flex-wrap items-center gap-10">
              <Wordmark size="sm" />
              <Wordmark size="md" />
              <Wordmark size="lg" subtitle="Colour memory arcade" />
            </div>
            <div className="space-y-3">
              <TestStrip size="sm" mystery />
              <TestStrip size="md" />
              <TestStrip size="lg" mystery />
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Spectrum bar
              </p>
              <div aria-hidden="true" className="cm-spectrum-bar h-2 w-full rounded-full" />
            </div>
          </Card>
        </Section>

        <Section
          id="tokens"
          eyebrow="Tokens"
          title="Chrome & calibration"
          description="Neutral chrome, fixed stage, semantic status."
        >
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                UI chrome
              </h3>
              <Swatches items={SURFACE_TOKENS} />
            </div>
            <div>
              <h3 className="mb-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Actions & status
              </h3>
              <Swatches items={ACTION_TOKENS} />
            </div>
            <div>
              <h3 className="mb-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Fixed game stage (never themed)
              </h3>
              <Swatches items={STAGE_TOKENS} />
            </div>
          </div>
        </Section>

        <Section
          id="type"
          eyebrow="Typography"
          title="Display · body · numbers"
          description="Space Grotesk, Plus Jakarta Sans, JetBrains Mono."
        >
          <Card className="space-y-6 p-6">
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Display / Space Grotesk
              </p>
              <p className="mt-1 font-display text-4xl font-bold tracking-tight">
                Calibrate the eye
              </p>
              <p className="mt-1 font-display text-xl font-semibold">
                Three swatches, one honest score
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Body / Plus Jakarta Sans
              </p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Hue is a circle. The shortest way around it wins.
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Numeric / JetBrains Mono
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                H 214.6° · S 62.0% · V 80.5%
              </p>
              <p className="font-mono text-sm text-muted-foreground tabular-nums">
                Score 25.3 / 30.0 · Room ABCD2345 · 00:04.8
              </p>
            </div>
          </Card>
        </Section>

        <Section
          id="buttons"
          eyebrow="Controls"
          title="Tactile keycaps"
          description="Press to feel the 2 px depression. Focus always shows."
        >
          <div className="space-y-6">
            <Card className="space-y-4 p-6">
              <h3 className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Variants
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
              </div>
              <h3 className="pt-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Sizes
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button size="icon" aria-label="Aperture action">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                    <path
                      d="M12 4v8l6 4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </Button>
              </div>
              <h3 className="pt-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                States
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button loading>Calibrating…</Button>
                <Button disabled>Disabled</Button>
                <Button variant="outline" disabled>
                  Disabled outline
                </Button>
              </div>
            </Card>
          </div>
        </Section>

        <Section
          id="forms"
          eyebrow="Forms"
          title="Recessed input wells"
          description="Errors pair icon, border and text."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-5 p-6">
              <Input
                label="Username"
                placeholder="colourhunter"
                hint="Letters, numbers, underscores."
              />
              <Input
                label="Email"
                type="email"
                defaultValue="not-an-email"
                error="Enter a valid email."
              />
              <Input label="Password" type="password" disabled defaultValue="disabled-value" />
            </Card>
            <Card className="space-y-4 p-6">
              <ErrorMessage
                title="Room is full"
                message="Someone beat you to the last stool. Try another code."
                onRetry={() => undefined}
              />
              <ErrorMessage message="That game token expired. Start a fresh game." />
            </Card>
            <Card className="p-6">
              <EmptyState
                title="No attempts yet"
                description="Play a round and give this board something to look at."
                action={
                  <Button size="sm" variant="outline">
                    Play a round
                  </Button>
                }
              />
            </Card>
          </div>
        </Section>

        <Section
          id="surfaces"
          eyebrow="Surfaces"
          title="Cards, dialogs, notifications"
          description="Icon shape carries the status; colour is a bonus."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-bold">Console card</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Neutral surface. Colour belongs to the swatches.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setModalOpen(true)}>
                  Open modal
                </Button>
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-bold">Toast stack</h3>
              <p className="mt-2 text-sm text-muted-foreground">Circle, shield, octagon.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast({ title: "New swatch loaded", description: "Round 2 is ready." })
                  }
                >
                  Info
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "Achievement unlocked",
                      description: "Sharp Eye — 9.5 in one round.",
                      variant: "success",
                    })
                  }
                >
                  Success
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "Couldn't load the board",
                      description: "The database is taking a nap.",
                      variant: "error",
                    })
                  }
                >
                  Error
                </Button>
              </div>
            </Card>
            <Card className="flex items-center gap-6 p-6">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
              <span className="text-sm text-muted-foreground">Aperture spinners</span>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-bold">Mode tokens</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Five silhouettes, five mini-scenes.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <ModeGlyph kind="global" size="md" />
                <ModeGlyph kind="daily" size="md" />
                <ModeGlyph kind="room" size="md" />
                <ModeGlyph kind="boards" size="md" />
                <ModeGlyph kind="profile" size="md" />
              </div>
            </Card>
          </div>
        </Section>

        <Section
          id="stage"
          eyebrow="Game stage"
          title="The fixed gray"
          description="Fixed #1e1e1e. Identical for every player and theme. Countdown only."
        >
          <div className="space-y-4">
            <RoundProgress currentRound={2} completedRounds={1} />
            <GameStage
              roundNumber={2}
              modeLabel="Global"
              phaseLabel="Memorise"
              countdown={{ remainingMs, totalMs: 5000, label: "Reveal" }}
            >
              <ColorSwatch
                hsv={{ h: 214.6, s: 62, v: 80.5 }}
                label="Target swatch"
                size="reveal"
                tone="stage"
              />
            </GameStage>
            <GameStage roundNumber={2} modeLabel="Global" phaseLabel="Recreate">
              <HsvSliders value={guess} onChange={setGuess} />
            </GameStage>
            <Card className="p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Result breakdown
              </p>
              <ChannelDiffBars diff={{ h: 5.6, s: 3.5, v: 3.5 }} className="mt-3" />
            </Card>
            <Card className="p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Result split well
              </p>
              <div className="mt-3 overflow-hidden rounded-[1rem] border border-border">
                <div className="relative h-28">
                  <ColorSwatch
                    hsv={{ h: 214.6, s: 62, v: 80.5 }}
                    label="Target colour"
                    size="fill"
                    frame="none"
                  />
                  <span className="absolute top-2 left-2 rounded-full border border-white/20 bg-black/50 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.16em] text-white uppercase">
                    Target
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="relative h-28">
                  <ColorSwatch hsv={guess} label="Your mix" size="fill" frame="none" />
                  <span className="absolute top-2 left-2 rounded-full border border-white/20 bg-black/50 px-2 py-1 font-mono text-[8px] font-bold tracking-[0.16em] text-white uppercase">
                    Your mix
                  </span>
                </div>
              </div>
            </Card>
            <Button variant="outline" size="sm" onClick={runCountdown} disabled={countdownRunning}>
              {countdownRunning ? "Counting…" : "Run countdown"}
            </Button>
          </div>
        </Section>

        <Section
          id="daily"
          eyebrow="Daily"
          title="Shared palette"
          description="Everyone gets the same three colours; the daily best and streak are the only differences."
        >
          <div className="space-y-4">
            <GameView
              mode="daily"
              state={initialGameMachineState}
              start={NOOP}
              setGuess={NOOP}
              submitGuess={NOOP}
              retry={NOOP}
              playAgain={NOOP}
            />
            <GameResult result={DAILY_RESULT} onPlayAgain={NOOP} />
          </div>
        </Section>

        <Section
          id="rooms"
          eyebrow="Rooms"
          title="Lobby, play and result"
          description="Private code, shared palette, independent attempts. The stage and result well are the same components as Global and Daily."
        >
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <RoomPanel
                state={ROOM_LOBBY}
                onStart={NOOP}
                onLeave={NOOP}
                onPlay={NOOP}
                onCopyLink={NOOP}
                copied={false}
              />
              <RoomPanel
                state={ROOM_IN_PROGRESS}
                onStart={NOOP}
                onLeave={NOOP}
                onPlay={NOOP}
                onCopyLink={NOOP}
                copied={false}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <RoomCreateForm onSubmit={NOOP} />
              </Card>
              <Card className="p-5">
                <JoinForm onSubmit={NOOP} />
              </Card>
            </div>
            <RoomResult
              result={ROOM_RESULT}
              roomCode="ABCD2345"
              onNextAttempt={NOOP}
              onBackToRoom={NOOP}
            />
          </div>
        </Section>

        <Section
          id="profile"
          eyebrow="Profile"
          title="Stats, badges and the logbook"
          description="Counters keep working while history charts degrade; earned and locked badges always carry text."
        >
          <div className="space-y-5">
            <StatsCards stats={PROFILE_STATS} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="min-w-0 p-4">
                <h3 className="text-sm font-bold tracking-tight">Score trend</h3>
                <TrendChart points={PROFILE_TREND} />
              </Card>
              <Card className="min-w-0 p-4">
                <h3 className="text-sm font-bold tracking-tight">Channel accuracy</h3>
                <AccuracyChart accuracy={PROFILE_ACCURACY} />
              </Card>
              <Card className="min-w-0 p-4 lg:col-span-2">
                <h3 className="text-sm font-bold tracking-tight">Hue regions</h3>
                <HueRegionChart regions={PROFILE_HUE_REGIONS} />
              </Card>
            </div>

            <AchievementGrid achievements={PROFILE_ACHIEVEMENTS} />
            <HistoryList items={PROFILE_HISTORY} />
          </div>
        </Section>

        <Section
          id="celebration"
          eyebrow="Celebrations"
          title="Result-screen feedback"
          description="Results only. Tag, shape, icon, text."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {CELEBRATION_KINDS.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant={celebration === kind ? "primary" : "outline"}
                  onClick={() => showCelebration(kind)}
                >
                  {CELEBRATION_LABELS[kind]}
                </Button>
              ))}
            </div>

            <Celebration
              key={`${celebration}-${celebrationRun}`}
              kind={celebration}
              detail={
                celebration === "streak"
                  ? "7 days · longest 12"
                  : celebration === "room-win"
                    ? "Best attempt 27.4"
                    : "+3.2 over your best"
              }
            />

            <Card className="flex flex-wrap items-center gap-4 p-6">
              <div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  Score count-up
                </p>
                <p className="mt-1 font-display text-5xl font-bold">
                  <ScoreCountUp key={scoreRun} value={27.4} />
                  <span className="text-muted-foreground"> / 30.0</span>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setScoreRun((run) => run + 1)}>
                Replay count-up
              </Button>
            </Card>
          </div>
        </Section>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Leave the room?"
        description="Your remaining attempts are forfeited. Your best score stays."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => setModalOpen(false)}>
              Leave
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">You can’t rejoin once you leave.</p>
      </Modal>
    </main>
  );
}
