import Link from "next/link";
import type { ReactNode } from "react";

import { ModeGlyph } from "@/components/ui/ModeGlyph";
import { cn } from "@/lib/cn";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path
        d="M4 10h11M10.5 5.5 15 10l-4.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GlobalCabinet() {
  return (
    <section
      aria-labelledby="global-cabinet-heading"
      className="cm-cabinet cm-rise flex h-full flex-col overflow-hidden p-0"
      style={{ animationDelay: "80ms" }}
    >
      <div className="cm-marquee flex items-center justify-between gap-3 px-5 pt-4 pb-2.5">
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-white/60 uppercase">
          Cabinet 01
        </p>
        <div aria-hidden="true" className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#16d39a]" />
          <span className="size-2 rounded-full bg-[#ffd000]" />
          <span className="size-2 rounded-full bg-[#ff3b5c]" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ModeGlyph kind="global" />
            <div>
              <p className="cm-eyebrow text-muted-foreground">Random palette</p>
              <h2
                id="global-cabinet-heading"
                className="mt-0.5 text-2xl font-extrabold tracking-tight"
              >
                Global
              </h2>
            </div>
          </div>
          <span className="cm-sticker -rotate-2 text-primary-ink">All-time</span>
        </div>

        <div aria-hidden="true" className="cm-screen mt-5 overflow-hidden rounded-[0.9rem]">
          <div className="flex items-center justify-between border-b border-[var(--screen-line)] px-4 py-2.5 font-mono text-[9px] font-bold tracking-[0.18em] uppercase">
            <span className="text-[var(--screen-muted)]">Round 01 / 03</span>
            <span className="flex items-center gap-1.5 text-[var(--screen-cyan)]">
              <span className="cm-live-dot size-1.5 rounded-full bg-current" />
              Ready
            </span>
          </div>
          <div className="flex items-end justify-between gap-4 px-4 py-5">
            <div>
              <p className="font-mono text-[9px] tracking-[0.16em] text-[var(--screen-muted)] uppercase">
                Memorise for
              </p>
              <p className="cm-led-gold mt-1 font-display text-5xl leading-none font-extrabold tracking-tight">
                5.0<span className="ml-1 text-xl text-[var(--screen-muted)]">s</span>
              </p>
            </div>
            <div className="flex items-end gap-2">
              {["#ff3b5c", "#ffd000", "#16d39a"].map((color, index) => (
                <div key={color} className="flex flex-col items-center gap-1.5">
                  <span
                    className="h-12 w-8 rounded-[0.35rem] border border-white/20 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] sm:h-14 sm:w-9"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-mono text-[8px] text-[var(--screen-muted)]">
                    0{index + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Three random colours. Rebuild each one from memory.
        </p>

        <div className="mt-auto pt-5">
          <Link
            href="/play/global"
            className="cm-keycap cm-keycap-primary inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-[0.8rem] border-border bg-primary px-6 py-3 font-display text-sm font-extrabold tracking-[0.055em] text-primary-foreground uppercase hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Play Global
            <ArrowIcon />
          </Link>
          <p className="mt-2.5 text-center font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            Score out of 30
          </p>
        </div>
      </div>
    </section>
  );
}

function PanelHeader({
  kind,
  eyebrow,
  title,
  action,
}: {
  kind: "room" | "boards" | "profile";
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <ModeGlyph kind={kind} />
        <div className="min-w-0">
          <p className="cm-eyebrow text-muted-foreground">{eyebrow}</p>
          <h2 className="mt-0.5 truncate text-lg font-extrabold tracking-tight">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

export function RoomsCard({ className }: { className?: string }) {
  return (
    <Link
      href="/rooms"
      className={cn(
        "group block rounded-[1.25rem] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className,
      )}
    >
      <div className="cm-console-card cm-rise flex h-full flex-col rounded-[1.25rem] bg-card p-5 transition-transform duration-150 group-hover:-translate-y-1">
        <PanelHeader
          kind="room"
          eyebrow="Private lobby"
          title="Custom Room"
          action={
            <span className="rounded-full border-2 border-border bg-muted px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              2–10
            </span>
          }
        />

        <div aria-hidden="true" className="mt-5 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((slot) => (
            <span
              key={slot}
              className={cn(
                "grid aspect-square place-items-center rounded-[0.6rem] border-2 border-dashed border-border/45 font-mono text-sm font-bold",
                slot === 0
                  ? "border-solid border-primary/50 bg-primary/10 text-primary-ink"
                  : "text-muted-foreground/60",
              )}
            >
              {slot === 0 ? "P1" : "+"}
            </span>
          ))}
        </div>

        <p className="mt-3 text-sm text-muted-foreground">Same three colours. Best score wins.</p>

        <span className="mt-auto inline-flex items-center gap-1.5 pt-4 font-mono text-[10px] font-bold tracking-[0.14em] text-foreground uppercase">
          Open rooms
          <ArrowIcon />
        </span>
      </div>
    </Link>
  );
}

export function BoardsCard({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="boards-card-heading"
      className={cn(
        "cm-console-card cm-rise flex h-full flex-col rounded-[1.25rem] bg-card p-5",
        className,
      )}
      style={{ animationDelay: "140ms" }}
    >
      <PanelHeader
        kind="boards"
        eyebrow="High scores"
        title="Leaderboards"
        action={<span className="cm-sticker -rotate-2 text-accent-gold">Ranked</span>}
      />

      <div className="mt-4 grid grid-cols-3 items-end gap-2" aria-hidden="true">
        {[
          { rank: 2, height: "h-10", color: "bg-[#c9c4ba]" },
          { rank: 1, height: "h-14", color: "bg-[#ffd166]" },
          { rank: 3, height: "h-8", color: "bg-[#cf8a5a]" },
        ].map((step) => (
          <div key={step.rank} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "w-full rounded-t-[0.4rem] border-2 border-border border-b-0",
                step.height,
                step.color,
              )}
            />
            <span className="font-mono text-[9px] font-bold text-muted-foreground">
              #{step.rank}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        <Link
          href="/leaderboard/global"
          className="inline-flex min-h-10 items-center justify-between gap-2 rounded-[0.65rem] border-2 border-border bg-muted/60 px-3 py-2 font-mono text-[10px] font-bold tracking-[0.12em] uppercase transition-colors hover:bg-muted"
        >
          Global board
          <ArrowIcon />
        </Link>
        <Link
          href="/leaderboard/daily"
          className="inline-flex min-h-10 items-center justify-between gap-2 rounded-[0.65rem] border-2 border-border bg-muted/60 px-3 py-2 font-mono text-[10px] font-bold tracking-[0.12em] uppercase transition-colors hover:bg-muted"
        >
          Daily board
          <ArrowIcon />
        </Link>
      </div>
    </section>
  );
}

export function ProfileCard({ className }: { className?: string }) {
  return (
    <Link
      href="/profile"
      className={cn(
        "group block rounded-[1.25rem] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className,
      )}
    >
      <div className="cm-console-card cm-rise relative flex h-full flex-col justify-between overflow-hidden rounded-[1.25rem] bg-card p-5 transition-transform duration-150 group-hover:-translate-y-1 sm:p-6">
        <div aria-hidden="true" className="cm-spectrum-bar absolute inset-x-0 top-0 h-1.5" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ModeGlyph kind="profile" />
            <div>
              <p className="cm-eyebrow text-muted-foreground">Your station</p>
              <h2 className="mt-0.5 text-lg font-extrabold tracking-tight">Profile</h2>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-muted px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Personal
          </span>
        </div>

        <p className="mt-4 max-w-sm text-sm text-muted-foreground">
          Your best scores, streaks, badges and every finished run.
        </p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t-2 border-dashed border-border/40 pt-4">
          <div className="flex items-center gap-4">
            {["PB", "STREAK", "BADGES"].map((label) => (
              <span
                key={label}
                className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
              >
                {label}
              </span>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.14em] text-foreground uppercase">
            Open
            <ArrowIcon />
          </span>
        </div>
      </div>
    </Link>
  );
}
