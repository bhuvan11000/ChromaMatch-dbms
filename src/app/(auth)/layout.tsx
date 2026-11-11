import type { ReactNode } from "react";

import { ModeGlyph, TestStrip, ThemeToggle, Wordmark } from "@/components/ui";

const POSTER_MODES = [
  { kind: "global", label: "Global", detail: "Random palette" },
  { kind: "daily", label: "Daily", detail: "One shared mix" },
  { kind: "room", label: "Rooms", detail: "Bring your crew" },
] as const;

/** Shared shell for the public auth screens — the cabinet's front door. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main id="main-content" className="relative min-h-dvh overflow-hidden">
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
        {/* Left: the poster side of the cabinet. */}
        <section
          aria-label="About ChromaMatch"
          className="cm-marquee relative hidden min-h-dvh flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14"
        >
          <div
            aria-hidden="true"
            className="cm-halftone pointer-events-none absolute inset-0 opacity-35"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 size-[26rem] rounded-full border-[3rem] border-white/5"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 bottom-24 size-[22rem] rotate-12 rounded-[3rem] border-2 border-white/10"
          />

          <div className="relative z-10 flex items-center justify-between gap-6">
            <Wordmark size="md" />
            <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/45 uppercase">
              Colour memory arcade
            </p>
          </div>

          <div className="relative z-10 max-w-xl py-10">
            <p className="cm-eyebrow text-[var(--screen-gold)]">A colour memory arcade</p>
            <h1 className="cm-display mt-4 text-[clamp(3.6rem,7vw,6.4rem)] text-[var(--marquee-fg)]">
              Trust
              <br />
              your
              <br />
              <span className="relative inline-block text-primary">
                eye.
                <span
                  aria-hidden="true"
                  className="cm-spectrum-bar absolute -bottom-2 left-0 h-2 w-full rounded-full"
                />
              </span>
            </h1>
            <p className="mt-7 max-w-md text-lg leading-relaxed text-white/70">
              A colour shows for five seconds. Then you rebuild it from memory.
            </p>

            <div className="mt-8 max-w-md -rotate-1">
              <TestStrip size="lg" mystery />
            </div>

            <dl className="mt-8 grid max-w-md grid-cols-3 gap-3">
              {POSTER_MODES.map((mode) => (
                <div
                  key={mode.kind}
                  className="rounded-[0.9rem] border border-white/15 bg-white/5 px-3 py-3"
                >
                  <dt className="flex items-center gap-2">
                    <ModeGlyph kind={mode.kind} size="md" />
                    <span className="font-display text-sm font-bold text-white">{mode.label}</span>
                  </dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative z-10 flex justify-end">
            <div aria-hidden="true" className="cm-speaker h-6 w-24 text-white/25" />
          </div>
        </section>

        {/* Right: the access terminal. */}
        <section className="relative flex items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
          <div
            aria-hidden="true"
            className="cm-darkroom-grid pointer-events-none absolute inset-0 opacity-60"
          />
          <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
            <ThemeToggle />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 h-1.5 w-full bg-[var(--spectrum-gradient)] lg:hidden"
          />

          <div className="relative w-full max-w-md">
            <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
              <Wordmark size="sm" />
              <span className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
                Player access
              </span>
            </div>

            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
