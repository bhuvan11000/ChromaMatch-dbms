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
  sm: "size-8 rounded-[0.625rem]",
  md: "size-10 rounded-[0.875rem]",
  lg: "size-12 rounded-[1.25rem]",
};

const WORD_SIZE: Record<WordmarkSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
};

const SUBTITLE_SIZE: Record<WordmarkSize, string> = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-xs",
};

/**
 * "Darkroom Filter Trio" — three overlapping dichroic plates inside a carbon
 * bezel, with the additive white core where all three overlap. The spectrum
 * underline is a brand flourish used outside the game stage only.
 */
function FilterTrioMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center border border-border bg-[#18181c] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_2px_0_var(--border-lip)]",
        className,
      )}
    >
      <svg viewBox="0 0 40 40" fill="none" className="size-[78%]">
        <rect x="4" y="6" width="21" height="21" rx="5" fill="#22d3ee" fillOpacity="0.9" />
        <rect x="10" y="10" width="21" height="21" rx="5" fill="#f43f5e" fillOpacity="0.82" />
        <rect x="7.5" y="13" width="21" height="21" rx="5" fill="#facc15" fillOpacity="0.86" />
        <rect x="13" y="15" width="8" height="8" rx="2" fill="#fafafa" />
      </svg>
    </span>
  );
}

export function Wordmark({ size = "md", subtitle, aside, className }: WordmarkProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <FilterTrioMark className={MARK_SIZE[size]} />
      <div className="min-w-0">
        <p
          className={cn(
            "font-display leading-none font-bold tracking-[-0.03em] text-foreground",
            WORD_SIZE[size],
          )}
        >
          Chroma
          <span className="relative inline-block">
            Match
            <span
              aria-hidden="true"
              className="cm-spectrum-bar absolute -bottom-1 left-0 h-[2px] w-full rounded-full"
            />
          </span>
        </p>
        {subtitle ? (
          <p
            className={cn(
              "mt-1.5 font-mono font-medium tracking-[0.16em] text-muted-foreground uppercase",
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
