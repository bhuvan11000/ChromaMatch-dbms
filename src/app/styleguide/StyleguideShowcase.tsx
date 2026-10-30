"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { GameStage } from "@/components/game";
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
            <GameStage
              roundNumber={2}
              modeLabel="Global"
              phaseLabel="Memorise"
              countdown={{ remainingMs, totalMs: 5000, label: "Reveal" }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div
                  aria-label="Target swatch"
                  role="img"
                  className="h-32 w-full rounded-[0.875rem] border border-stage-border bg-stage-surface sm:h-40 sm:w-56"
                  style={{ backgroundColor: "hsl(206 62% 51%)" }}
                />
                <p className="font-mono text-[10px] tracking-[0.18em] text-stage-muted uppercase">
                  Target swatch
                </p>
              </div>
            </GameStage>
            <Button variant="outline" size="sm" onClick={runCountdown} disabled={countdownRunning}>
              {countdownRunning ? "Counting…" : "Run countdown"}
            </Button>
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
