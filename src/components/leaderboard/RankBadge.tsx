import { cn } from "@/lib/cn";

export interface RankBadgeProps {
  rank: number;
  className?: string;
}

function MedalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5">
      <circle cx="8" cy="6" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.1 8.7 5.2 13l2.8-1.5 2.8 1.5-.9-4.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Rank pill. The number is always visible; the medal is a redundant cue for the
 * top three, so rank never depends on colour alone (UI_THEME §1).
 */
export function RankBadge({ rank, className }: RankBadgeProps) {
  const isTopThree = rank <= 3;

  return (
    <span
      className={cn(
        "inline-flex min-w-10 items-center justify-center gap-1 rounded-full border px-2 py-1 font-mono text-xs font-bold tabular-nums",
        isTopThree
          ? "border-accent-gold/45 bg-accent-gold/10 text-accent-gold"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {isTopThree ? <MedalIcon /> : null}
      {rank}
    </span>
  );
}
