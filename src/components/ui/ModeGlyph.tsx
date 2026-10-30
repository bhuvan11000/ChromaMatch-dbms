import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ModeGlyphKind = "global" | "daily" | "room" | "boards" | "profile";

export interface ModeGlyphProps {
  kind: ModeGlyphKind;
  size?: "md" | "lg";
  className?: string;
}

interface ModeGlyphMeta {
  /** Visible tag used next to the glyph; meaning never depends on color. */
  tag: string;
  clipPath: string;
  plate: string;
  icon: ReactNode;
}

const GLYPHS: Record<ModeGlyphKind, ModeGlyphMeta> = {
  global: {
    tag: "Solo · Ranked",
    clipPath: "circle(50% at 50% 50%)",
    plate: "bg-accent-cyan/15 text-accent-cyan",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 3.8v16.4M3.8 12h16.4M6.2 6.2c3.4 3 8.2 3 11.6 0M6.2 17.8c3.4-3 8.2-3 11.6 0"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  daily: {
    tag: "Shared · 00:00 UTC",
    clipPath: "polygon(30% 2%, 70% 2%, 98% 30%, 98% 70%, 70% 98%, 30% 98%, 2% 70%, 2% 30%)",
    plate: "bg-accent-gold/15 text-accent-gold",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  room: {
    tag: "Private · 2–10P",
    clipPath: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)",
    plate: "bg-accent-violet/15 text-accent-violet",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
        <rect
          x="3.2"
          y="6"
          width="17.6"
          height="12"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="8" cy="12" r="1.4" fill="currentColor" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
        <circle cx="16" cy="12" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
  boards: {
    tag: "Global & Daily",
    clipPath: "polygon(12% 2%, 88% 2%, 98% 12%, 98% 64%, 50% 98%, 2% 64%, 2% 12%)",
    plate: "bg-accent-cyan/12 text-accent-cyan",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
        <rect
          x="3.5"
          y="13"
          width="4.6"
          height="7"
          rx="1.4"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <rect
          x="9.7"
          y="8.5"
          width="4.6"
          height="11.5"
          rx="1.4"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <rect
          x="15.9"
          y="4"
          width="4.6"
          height="16"
          rx="1.4"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    ),
  },
  profile: {
    tag: "Stats & badges",
    clipPath: "inset(0% round 26%)",
    plate: "bg-muted text-foreground",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
        <path
          d="M3 13.5h3l2.2-6 3.1 10 2.6-7.5 2.1 3.5h5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
};

/**
 * Mode glyph: a distinct silhouette + icon + tag, so modes never rely on color
 * alone (Architecture §5.11.5). The tag is decorative here because the mode
 * name is always rendered as text beside it.
 */
export function ModeGlyph({ kind, size = "lg", className }: ModeGlyphProps) {
  const meta = GLYPHS[kind];
  const box = size === "lg" ? "size-12" : "size-10";

  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center", box, meta.plate, className)}
      style={{ clipPath: meta.clipPath } as CSSProperties}
    >
      {meta.icon}
    </span>
  );
}

export function modeTag(kind: ModeGlyphKind): string {
  return GLYPHS[kind].tag;
}
