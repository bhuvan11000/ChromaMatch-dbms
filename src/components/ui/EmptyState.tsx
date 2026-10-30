import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Decorative glyph; defaults to an empty aperture. */
  icon?: ReactNode;
  /** Optional call to action, e.g. a Button. */
  action?: ReactNode;
  className?: string;
}

function EmptyAperture() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
      <circle
        cx="12"
        cy="12"
        r="8.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray="3 3"
      />
      <path d="M12 7.5v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Friendly empty tray. Use when a list or board has no rows yet; the copy
 * should invite the next action rather than describe the absence.
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-border bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
        {icon ?? <EmptyAperture />}
      </span>
      <p className="mt-4 font-display text-base font-bold tracking-tight text-foreground">
        {title}
      </p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground text-pretty">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
