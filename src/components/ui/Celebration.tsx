"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type CelebrationKind = "pb" | "achievement" | "streak" | "room-win";

export interface CelebrationMeta {
  badgeLabel: string;
  shapeName: "octagon" | "diamond" | "pill" | "hexagon";
  defaultTitle: string;
}

const CELEBRATION_META: Record<CelebrationKind, CelebrationMeta> = {
  pb: { badgeLabel: "NEW PB", shapeName: "octagon", defaultTitle: "New personal best!" },
  achievement: {
    badgeLabel: "UNLOCKED",
    shapeName: "diamond",
    defaultTitle: "Achievement unlocked!",
  },
  streak: { badgeLabel: "STREAK", shapeName: "pill", defaultTitle: "Daily streak extended!" },
  "room-win": { badgeLabel: "1ST PLACE", shapeName: "hexagon", defaultTitle: "Room champion!" },
};

/** Pure lookup used by tests and by result screens that need the badge text. */
export function getCelebrationMeta(kind: CelebrationKind): CelebrationMeta {
  return CELEBRATION_META[kind];
}

/** Formats integer tenths without floating-point drift (253 → "25.3"). */
export function formatScoreTenths(tenths: number): string {
  const safe = Number.isFinite(tenths) ? Math.round(tenths) : 0;
  const sign = safe < 0 ? "-" : "";
  const absolute = Math.abs(safe);
  return `${sign}${Math.floor(absolute / 10)}.${absolute % 10}`;
}

export interface ScoreCountUpProps {
  /** Final score, 0–30, one decimal. */
  value: number;
  max?: number;
  durationMs?: number;
  className?: string;
}

/**
 * Counts a score from 0.0 to its final value in integer tenths.
 * SSR and reduced-motion users see the final value immediately; the animated
 * value is hidden from assistive tech so it is announced only once.
 */
export function ScoreCountUp({ value, max = 30, durationMs = 900, className }: ScoreCountUpProps) {
  const targetTenths = Math.round(value * 10);
  const [displayTenths, setDisplayTenths] = useState(targetTenths);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || durationMs <= 0) {
      // Settle on the final value without an animated pass. The rAF callback is
      // asynchronous, so this never triggers a cascading render from the effect.
      const settle = requestAnimationFrame(() => setDisplayTenths(targetTenths));
      return () => cancelAnimationFrame(settle);
    }

    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      // ease-out cubic keeps the last tenths readable before settling
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayTenths(Math.round(targetTenths * eased));

      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [durationMs, targetTenths]);

  const label = `${formatScoreTenths(targetTenths)} out of ${formatScoreTenths(Math.round(max * 10))}`;

  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <span aria-hidden="true" data-testid="score-count-up" className="font-mono tabular-nums">
        {formatScoreTenths(displayTenths)}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

const BADGE_CLIP: Record<CelebrationMeta["shapeName"], string> = {
  octagon: "polygon(30% 2%, 70% 2%, 98% 30%, 98% 70%, 70% 98%, 30% 98%, 2% 70%, 2% 30%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  pill: "inset(0% round 9999px)",
  hexagon: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)",
};

const KIND_BADGE: Record<CelebrationKind, string> = {
  pb: "bg-accent-gold text-accent-gold",
  achievement: "bg-accent-violet text-accent-violet",
  streak: "bg-accent-cyan text-accent-cyan",
  "room-win": "bg-primary text-primary",
};

const KIND_TEXT: Record<CelebrationKind, string> = {
  pb: "text-accent-gold",
  achievement: "text-accent-violet",
  streak: "text-accent-cyan",
  "room-win": "text-primary",
};

const CHIP_COLORS = [
  "#ff5e5b",
  "#ffb800",
  "#34d399",
  "#22d3ee",
  "#a78bfa",
  "#f43f5e",
  "#facc15",
  "#2dd4bf",
  "#38bdf8",
  "#c084fc",
  "#fb923c",
  "#4ade80",
];

/** Deterministic 12-chip burst; radii alternate so the arc reads as a calibration chart. */
const CHIPS = CHIP_COLORS.map((color, index) => {
  const angle = (index / CHIP_COLORS.length) * Math.PI * 2 - Math.PI / 2;
  const radius = index % 2 === 0 ? 104 : 78;
  return {
    color,
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
    rotate: `${index * 37}deg`,
  };
});

function KindIcon({ kind }: { kind: CelebrationKind }) {
  if (kind === "achievement") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
        <path
          d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.2l5.9-.8L12 3Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "streak") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
        <path
          d="M12.5 3.5c.8 3.2-1.6 4.4-1.6 6.7 0 1.2.8 2 1.8 2 1.6 0 2.6-1.4 2.6-3.2 2 1.7 3.2 4 3.2 6.2A6.5 6.5 0 0 1 5.5 15c0-3.6 2.2-6.7 4.4-8.8.4 1.5 1.1 2 1.9 2 .4 0 .7-.2.7-1.7v-3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "room-win") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
        <path
          d="M8 4h8v4.5a4 4 0 0 1-8 0V4Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M8 5.5H5.2v1.8A3.3 3.3 0 0 0 8.5 10.6M16 5.5h2.8v1.8a3.3 3.3 0 0 1-3.3 3.3M12 12.5V16M8.5 20h7M10 16h4l.8 4H9.2l.8-4Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
      <path
        d="M3.5 17.5 9 12l3.2 3.2L20 7.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 7.5H20V13"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface CelebrationProps {
  kind: CelebrationKind;
  title?: string;
  subtitle?: string;
  /** Small monospace detail, e.g. "+3.2 over your previous best". */
  detail?: ReactNode;
  /** Set false to render nothing; useful while a result screen is still loading. */
  active?: boolean;
  className?: string;
}

/**
 * Result-screen celebration only. Never render this inside <GameStage>.
 *
 * The celebration carries meaning through four channels: monospace tag,
 * distinct shape, icon and text — so it survives grayscale and reduced motion.
 */
export function Celebration({
  kind,
  title,
  subtitle,
  detail,
  active = true,
  className,
}: CelebrationProps) {
  if (!active) return null;

  const meta = CELEBRATION_META[kind];
  const clipPath = BADGE_CLIP[meta.shapeName];

  return (
    <div
      data-testid="celebration"
      data-celebration-kind={kind}
      data-celebration-shape={meta.shapeName}
      role="status"
      className={cn(
        "cm-console-card relative overflow-hidden rounded-[1.25rem] border-2 border-accent-gold/35 bg-card p-5 text-card-foreground sm:p-6",
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {CHIPS.map((chip, index) => (
          <span
            key={index}
            className="cm-burst-chip"
            style={
              {
                backgroundColor: chip.color,
                "--chip-x": `${chip.x}px`,
                "--chip-y": `${chip.y}px`,
                "--chip-rotate": chip.rotate,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div
          className={cn(
            "cm-celebration-badge relative flex size-16 shrink-0 items-center justify-center",
            KIND_BADGE[kind],
          )}
          style={{ clipPath }}
        >
          <span aria-hidden="true" className="absolute inset-[3px] bg-card" style={{ clipPath }} />
          <span className="relative">
            <KindIcon kind={kind} />
          </span>
        </div>

        <div className="min-w-0">
          <p
            className={cn(
              "font-mono text-[10px] font-bold tracking-[0.22em] uppercase",
              KIND_TEXT[kind],
            )}
          >
            [{meta.badgeLabel}]
          </p>
          <p className="mt-1 font-display text-xl font-bold tracking-tight sm:text-2xl">
            {title ?? meta.defaultTitle}
          </p>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          {detail ? (
            <p className="mt-2 font-mono text-xs font-medium text-muted-foreground tabular-nums">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
