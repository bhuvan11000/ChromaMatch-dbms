import type { AchievementItemResponse } from "@/lib/schemas/stats";
import { cn } from "@/lib/cn";

function EarnedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
      <circle cx="12" cy="12" r="8.3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m8.2 12.3 2.4 2.4 5.2-5.3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
      <rect
        x="5.2"
        y="10.2"
        width="13.6"
        height="9.2"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8.2 10.2V7.8a3.8 3.8 0 0 1 7.6 0v2.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="14.7" r="1.2" fill="currentColor" />
    </svg>
  );
}

export interface AchievementGridProps {
  achievements: AchievementItemResponse[];
}

/** All achievement definitions, earned first, with visible criteria text. */
export function AchievementGrid({ achievements }: AchievementGridProps) {
  const ordered = [...achievements].sort(
    (a, b) => Number(b.earned) - Number(a.earned) || a.id - b.id,
  );

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((achievement) => (
        <li key={achievement.id}>
          <div
            data-earned={achievement.earned ? "true" : "false"}
            className={cn(
              "relative flex h-full min-w-0 flex-col overflow-hidden rounded-[0.9rem] border-2 border-border p-4",
              achievement.earned
                ? "bg-card shadow-[0_4px_0_var(--border-lip)]"
                : "border-dashed bg-muted/30 text-muted-foreground",
            )}
          >
            {achievement.earned ? (
              <span aria-hidden="true" className="cm-spectrum-bar absolute inset-x-0 top-0 h-1" />
            ) : null}

            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-[0.5rem] border-2",
                  achievement.earned
                    ? "border-border bg-accent-gold/15 text-accent-gold"
                    : "border-border/45 bg-muted text-muted-foreground",
                )}
              >
                {achievement.earned ? <EarnedIcon /> : <LockedIcon />}
              </span>
              <div className="flex flex-col items-end gap-1">
                <span className="font-mono text-[8px] font-bold tracking-[0.12em] text-muted-foreground/70">
                  BADGE {String(achievement.id).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "rounded-[0.25rem] border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] uppercase",
                    achievement.earned
                      ? "border-success/45 bg-success/10 text-success"
                      : "border-border/50 bg-card text-muted-foreground",
                  )}
                >
                  {achievement.earned ? "Earned" : "Locked"}
                </span>
              </div>
            </div>

            <h3 className="mt-3 font-display text-sm font-extrabold tracking-tight text-foreground">
              {achievement.name}
            </h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
              {achievement.criteriaDescription}
            </p>

            {achievement.earned && achievement.earnedAt ? (
              <time
                dateTime={achievement.earnedAt}
                className="mt-3 border-t border-dashed border-border/40 pt-2 font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase"
              >
                {achievement.earnedAt.slice(0, 10)}
              </time>
            ) : (
              <p className="mt-3 border-t border-dashed border-border/40 pt-2 font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
                Keep mixing
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
