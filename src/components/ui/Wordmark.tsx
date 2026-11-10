import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type WordmarkSize = "sm" | "md" | "lg";

export interface WordmarkProps {
  size?: WordmarkSize;
  /** Optional short tagline under the wordmark. */
  subtitle?: string;
  /** Optional trailing slot, e.g. an account chip. */
  aside?: ReactNode;
  className?: string;
}

const MARK_SIZE: Record<WordmarkSize, string> = {
  sm: "size-8 rounded-[0.5rem]",
  md: "size-10 rounded-[0.6rem]",
  lg: "size-12 rounded-[0.75rem]",
};

const WORD_SIZE: Record<WordmarkSize, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

const SUBTITLE_SIZE: Record<WordmarkSize, string> = {
  sm: "text-[8px]",
  md: "text-[9px]",
  lg: "text-[10px]",
};

/**
 * Cabinet badge: three overlapping light filters with an additive white core.
 * The mark is the brand's prism; the underlined "Match" carries the spectrum.
 */
function FilterTrioMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden border-2 border-border bg-[#15121d] shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_3px_0_var(--border-lip)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/18 to-transparent"
      />
      <svg viewBox="0 0 40 40" fill="none" className="relative size-[82%]">
        <rect x="3.5" y="6" width="22" height="22" rx="6" fill="#21d4e0" fillOpacity="0.92" />
        <rect x="11" y="9.5" width="22" height="22" rx="6" fill="#ff4f6d" fillOpacity="0.84" />
        <rect x="8" y="13.5" width="22" height="22" rx="6" fill="#ffd166" fillOpacity="0.9" />
        <rect x="13.5" y="15.5" width="8" height="8" rx="2.2" fill="#fffaf0" />
      </svg>
    </span>
  );
}

export function Wordmark({ size = "md", subtitle, aside, className }: WordmarkProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <FilterTrioMark className={MARK_SIZE[size]} />
      <div className="min-w-0">
        <p
          className={cn(
            "font-display leading-none font-extrabold tracking-[-0.05em] uppercase",
            WORD_SIZE[size],
          )}
        >
          Chroma
          <span className="relative inline-block">
            Match
            <span
              aria-hidden="true"
              className="cm-spectrum-bar absolute -bottom-1 left-0 h-[3px] w-full rounded-full"
            />
          </span>
        </p>
        {subtitle ? (
          <p
            className={cn(
              "mt-1.5 font-mono font-bold tracking-[0.16em] text-muted-foreground uppercase",
              SUBTITLE_SIZE[size],
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {aside ? <div className="ml-auto shrink-0">{aside}</div> : null}
    </div>
  );
}
