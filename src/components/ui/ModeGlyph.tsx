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
 * Little arcade pins: an anodised rim, a dark instrument plate, and a bold
 * mini-scene. The object and the scene are deliberately redundant so the token
 * still reads without colour. Brand colours are hard-coded here because these
 * are illustrations, not chrome.
 */
const GLYPHS: Record<ModeGlyphKind, ModeGlyphMeta> = {
  global: {
    clipPath: "circle(50% at 50% 50%)",
    rim: "bg-accent-cyan",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <circle cx="12" cy="12" r="7.2" fill="#e9e6df" fillOpacity="0.08" />
        <path d="M12 4.8a7.2 7.2 0 0 1 6.2 3.6L12 12Z" fill="#22d3ee" />
        <path d="M18.2 8.4A7.2 7.2 0 0 1 12 19.2V12Z" fill="#f43f5e" />
        <path d="M12 19.2A7.2 7.2 0 0 1 5.8 8.4L12 12Z" fill="#facc15" />
        <ellipse
          cx="12"
          cy="12"
          rx="3.1"
          ry="7.2"
          stroke="#e9e6df"
          strokeWidth="0.9"
          opacity="0.35"
        />
        <circle cx="12" cy="12" r="1.15" fill="#18181c" />
      </svg>
    ),
  },
  daily: {
    clipPath: "polygon(30% 2%, 70% 2%, 98% 30%, 98% 70%, 70% 98%, 30% 98%, 2% 70%, 2% 30%)",
    rim: "bg-accent-gold",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <path
          d="M5.4 17.6h13.2"
          stroke="#e9e6df"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path d="M6.8 17.6a5.2 5.2 0 0 1 10.4 0Z" fill="#facc15" />
        <path
          d="M12 4.7v2.5M6.3 7.3l1.8 1.8M17.7 7.3l-1.8 1.8M4.1 13.3h2.3M17.6 13.3h2.3"
          stroke="#facc15"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  room: {
    clipPath: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)",
    rim: "bg-accent-violet",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <rect
          x="2.8"
          y="7.2"
          width="18.4"
          height="9.6"
          rx="2.6"
          fill="#e9e6df"
          fillOpacity="0.08"
          stroke="#e9e6df"
          strokeWidth="1.4"
        />
        <circle cx="6.1" cy="10" r="1" stroke="#e9e6df" strokeWidth="1" />
        <circle cx="9.8" cy="13" r="1.4" fill="#a78bfa" />
        <circle cx="13" cy="13" r="1.4" fill="#a78bfa" />
        <circle cx="16.2" cy="13" r="1.4" fill="#a78bfa" />
      </svg>
    ),
  },
  boards: {
    clipPath: "polygon(12% 2%, 88% 2%, 98% 12%, 98% 64%, 50% 98%, 2% 64%, 2% 12%)",
    rim: "bg-primary",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <path
          d="m12 2.4.9 1.9 2.1.3-1.5 1.5.3 2.1-1.8-1-1.8 1 .3-2.1-1.5-1.5 2.1-.3.9-1.9Z"
          fill="#facc15"
        />
        <rect x="3.2" y="12.8" width="4.8" height="7.2" rx="1.3" fill="#22d3ee" />
        <rect x="9.6" y="9.1" width="4.8" height="10.9" rx="1.3" fill="#facc15" />
        <rect x="16" y="14.1" width="4.8" height="5.9" rx="1.3" fill="#f43f5e" />
      </svg>
    ),
  },
  profile: {
    clipPath: "inset(0% round 30%)",
    rim: "bg-success",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full">
        <rect
          x="2.9"
          y="9.2"
          width="5.2"
          height="11"
          rx="1.5"
          fill="#22d3ee"
          stroke="#18181c"
          strokeWidth="0.5"
          transform="rotate(-15 5.5 14.7)"
        />
        <rect
          x="9.4"
          y="7"
          width="5.2"
          height="13.2"
          rx="1.5"
          fill="#facc15"
          stroke="#18181c"
          strokeWidth="0.5"
        />
        <rect
          x="16"
          y="9.2"
          width="5.2"
          height="11"
          rx="1.5"
          fill="#f43f5e"
          stroke="#18181c"
          strokeWidth="0.5"
          transform="rotate(15 18.6 14.7)"
        />
      </svg>
    ),
  },
};

/**
 * Mode pin: coloured rim, dark plate, bold mini-scene. Decorative by design —
 * always render the mode name as the visible label.
 */
export function ModeGlyph({ kind, size = "lg", className }: ModeGlyphProps) {
  const meta = GLYPHS[kind];
  const box = size === "lg" ? "size-16" : "size-12";
  const inset = size === "lg" ? "inset-[4px]" : "inset-[3px]";
  const iconBox = size === "lg" ? "size-9" : "size-7";

  return (
    <span
      aria-hidden="true"
      data-mode={kind}
      className={cn(
        "cm-mode-token relative flex shrink-0 items-center justify-center",
        box,
        meta.rim,
        className,
      )}
      style={{ clipPath: meta.clipPath } as CSSProperties}
    >
      <span
        className={cn("absolute bg-[#18181c]", inset)}
        style={{ clipPath: meta.clipPath } as CSSProperties}
      />
      <span
        className={cn("absolute bg-gradient-to-b from-white/15 via-white/5 to-transparent", inset)}
        style={{ clipPath: meta.clipPath } as CSSProperties}
      />
      <span className={cn("relative", iconBox)}>{meta.icon}</span>
    </span>
  );
}
