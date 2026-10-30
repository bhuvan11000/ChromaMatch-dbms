import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a tactile hover lift; use only when the whole card is clickable. */
  interactive?: boolean;
  /** Slightly raised surface for dialogs and focal panels. */
  elevated?: boolean;
}

export function Card({ className, interactive = false, elevated = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "cm-console-card rounded-[1.25rem] border border-border text-card-foreground",
        elevated ? "bg-card-elevated shadow-md" : "bg-card shadow-sm",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-muted-foreground/40 hover:shadow-md focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-display text-lg font-bold tracking-tight text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 p-6 pt-0", className)} {...props} />;
}
