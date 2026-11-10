"use client";

import { useRef, type CSSProperties, type HTMLAttributes, type PointerEvent } from "react";

import { cn } from "@/lib/cn";

export interface SpotlightProps extends HTMLAttributes<HTMLDivElement> {
  /** Any CSS colour; defaults to the signal orange. */
  color?: string;
}

/**
 * Adapted from ReactBits "Spotlight Card" (https://reactbits.dev).
 *
 * The surface gets one soft colour spill that follows the pointer. The child
 * card keeps its own ink border and hard shadow; this only adds light. Motion
 * is handled by a CSS opacity transition and disabled by the global
 * reduced-motion rule.
 */
export function Spotlight({
  children,
  className,
  color = "var(--primary)",
  style,
  ...props
}: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const root = ref.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    root.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    root.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={cn("cm-spotlight", className)}
      style={{ "--spot-color": color, ...style } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}
