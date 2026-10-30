import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ModeGlyphKind = "global" | "daily" | "room" | "boards" | "profile";

export interface ModeGlyphProps {
  kind: ModeGlyphKind;
  size?: "md" | "lg";
  className?: string;
}

interface ModeGlyphMeta {
  clipPath: string;
  rim: string;
  icon: ReactNode;
}

/*
 * These are little arcade tokens: a coloured rim around a dark instrument
 * plate. Each mode has a distinct silhouette AND a distinct mini-illustration,
 * so the cards never rely on colour alone. Brand colours are hard-coded here on
 * purpose — they are illustrations, not chrome.
 */
const GLYPHS: Record<ModeGlyphKind, ModeGlyphMeta> = {
  global: {
    clipPath: "circle(50% at 50% 50%)",
    rim: "bg-accent-cyan",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="12" r="6.4" stroke="#e9e6df" strokeWidth="1.4" />
        <path
          d="M5.6 12h12.8M12 5.6c-2.1 2.2-2.1 10.6 0 12.8M12 5.6c2.1 2.2 2.1 10.6 0 12.8"
          stroke="#e9e6df"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.4"
        />
        <circle cx="9.2" cy="9.4" r="1.5" fill="#22d3ee" />
        <circle cx="15" cy="10.2" r="1.2" fill="#f43f5e" />
        <circle cx="12.3" cy="15.2" r="1.3" fill="#facc15" />
      </svg>
    ),
  },
  daily: {
    clipPath: "polygon(30% 2%, 70% 2%, 98% 30%, 98% 70%, 70% 98%, 30% 98%, 2% 70%, 2% 30%)",
    rim: "bg-accent-gold",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="10.5" r="4.2" fill="#facc15" />
        <path
          d="M12 2.8v2.1M12 16.1v2.1M4.3 10.5h2.1M17.6 10.5h2.1M6.6 5.1l1.5 1.5M15.9 14.4l1.5 1.5M17.4 5.1 15.9 6.6M8.1 14.4l-1.5 1.5"
          stroke="#facc15"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M6 19.8h12"
          stroke="#e9e6df"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    ),
  },
  room: {
    clipPath: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)",
    rim: "bg-accent-violet",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <rect x="3.4" y="7" width="17.2" height="11" rx="2.5" stroke="#e9e6df" strokeWidth="1.4" />
        <circle cx="8" cy="12.5" r="1.2" fill="#a78bfa" />
        <circle cx="11.6" cy="12.5" r="1.2" fill="#a78bfa" />
        <circle cx="15.2" cy="12.5" r="1.2" fill="#a78bfa" />
        <path
          d="M6.6 9.6h4"
          stroke="#e9e6df"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    ),
  },
  boards: {
    clipPath: "polygon(12% 2%, 88% 2%, 98% 12%, 98% 64%, 50% 98%, 2% 64%, 2% 12%)",
    rim: "bg-primary",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <rect x="3.5" y="13" width="4.6" height="6.5" rx="1.2" fill="#22d3ee" />
        <rect x="9.7" y="8.5" width="4.6" height="11" rx="1.2" fill="#facc15" />
        <rect x="15.9" y="14.5" width="4.6" height="5" rx="1.2" fill="#f43f5e" />
        <path
          d="m12 2.8.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3L12 2.8Z"
          fill="#ff6b2c"
        />
      </svg>
    ),
  },
  profile: {
    clipPath: "inset(0% round 30%)",
    rim: "bg-success",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <rect
          x="3.6"
          y="9.5"
          width="5"
          height="10"
          rx="1.4"
          fill="#22d3ee"
          transform="rotate(-14 6.1 14.5)"
        />
        <rect x="9.5" y="7.5" width="5" height="12" rx="1.4" fill="#facc15" />
        <rect
          x="15.4"
          y="9.5"
          width="5"
          height="10"
          rx="1.4"
          fill="#f43f5e"
          transform="rotate(14 17.9 14.5)"
        />
      </svg>
    ),
  },
};

/**
 * Mode token: a coloured rim, a dark plate, and a distinct mini-illustration.
 * Decorative by design — always render the mode name as the visible label.
 */
export function ModeGlyph({ kind, size = "lg", className }: ModeGlyphProps) {
  const meta = GLYPHS[kind];
  const box = size === "lg" ? "size-14" : "size-11";
  const iconBox = size === "lg" ? "size-7" : "size-6";

  return (
    <span
      aria-hidden="true"
      data-mode={kind}
      className={cn("relative flex shrink-0 items-center justify-center", box, meta.rim, className)}
      style={{ clipPath: meta.clipPath } as CSSProperties}
    >
      <span
        className="absolute inset-[3px] bg-[#18181c]"
        style={{ clipPath: meta.clipPath } as CSSProperties}
      />
      <span
        className="absolute inset-[3px] bg-gradient-to-b from-white/10 via-transparent to-transparent"
        style={{ clipPath: meta.clipPath } as CSSProperties}
      />
      <span className={cn("relative", iconBox)}>{meta.icon}</span>
    </span>
  );
}
