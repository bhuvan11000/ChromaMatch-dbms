import { Card } from "@/components/ui";
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
          <Card
            data-earned={achievement.earned ? "true" : "false"}
            className={cn(
              "flex h-full min-w-0 flex-col p-4",
              achievement.earned
                ? "border-success/45 bg-card"
                : "border-dashed bg-muted/25 text-muted-foreground",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border",
                  achievement.earned
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {achievement.earned ? <EarnedIcon /> : <LockedIcon />}
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] uppercase",
                  achievement.earned
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {achievement.earned ? "Earned" : "Locked"}
              </span>
            </div>

            <h3 className="mt-3 text-sm font-bold tracking-tight text-foreground">
              {achievement.name}
            </h3>
            <p className="mt-1 flex-1 text-xs text-muted-foreground">
              {achievement.criteriaDescription}
            </p>

            {achievement.earned && achievement.earnedAt ? (
              <time
                dateTime={achievement.earnedAt}
                className="mt-3 font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase"
              >
                {achievement.earnedAt.slice(0, 10)}
              </time>
            ) : (
              <p className="mt-3 font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
                Keep mixing
              </p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
