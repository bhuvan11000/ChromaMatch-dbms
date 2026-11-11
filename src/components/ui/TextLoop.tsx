"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/cn";

const VIEW_W = 1200;
const VIEW_H = 180;
const CENTER_Y = VIEW_H / 2;
const EDGE_FADE = 0.08;

export interface TextLoopProps {
  text?: string;
  separator?: string;
  /** Pixels per second along the path. */
  speed?: number;
  direction?: "forward" | "reverse";
  curviness?: number;
  fontSize?: number;
  className?: string;
}

interface Metrics {
  length: number;
  reps: number;
}

function buildWave(curviness: number): string {
  const amplitude = Math.min(64, Math.max(0, curviness) * 1.1);
  return [
    `M -200 ${CENTER_Y}`,
    `Q -100 ${CENTER_Y - amplitude} 0 ${CENTER_Y}`,
    `T 200 ${CENTER_Y}`,
    `T 400 ${CENTER_Y}`,
    `T 600 ${CENTER_Y}`,
    `T 800 ${CENTER_Y}`,
    `T 1000 ${CENTER_Y}`,
    `T 1200 ${CENTER_Y}`,
    `T 1400 ${CENTER_Y}`,
  ].join(" ");
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

/**
 * Adapted from ReactBits "Text Loop" (reactbits.dev/text-animations/text-loop).
 *
 * A seamless text marquee on a curved SVG path. The original uses GSAP; this
 * version uses the same two-textPath/offset technique with a small rAF loop,
 * so it adds no dependency. The loop is decorative and pauses when hidden,
 * when hovered, and under reduced motion.
 */
export function TextLoop({
  text = "Trust your eye",
  separator = "✦",
  speed = 64,
  direction = "forward",
  curviness = 48,
  fontSize = 36,
  className,
}: TextLoopProps) {
  const rawId = useId();
  const pathId = `text-loop-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fadeId = `${pathId}-fade`;
  const maskId = `${pathId}-mask`;
  const rootRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const headRef = useRef<SVGTextPathElement>(null);
  const tailRef = useRef<SVGTextPathElement>(null);
  const pausedRef = useRef(false);

  const path = useMemo(() => buildWave(curviness), [curviness]);
  const unit = useMemo(() => `${text.toUpperCase()}\u00A0${separator}\u00A0`, [separator, text]);
  const textStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${fontSize}px`,
      fontWeight: 800,
      letterSpacing: "2px",
    }),
    [fontSize],
  );

  const [metrics, setMetrics] = useState<Metrics>({ length: 0, reps: 1 });

  useEffect(() => {
    const pathElement = pathRef.current;
    const measureElement = measureRef.current;
    if (!pathElement || !measureElement) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      try {
        const length = pathElement.getTotalLength();
        const unitWidth = measureElement.getComputedTextLength();
        if (!length || !unitWidth) return;
        const reps = Math.max(1, Math.ceil(length / unitWidth));
        setMetrics((current) =>
          current.length === length && current.reps === reps ? current : { length, reps },
        );
      } catch {
        // SVG measurement can fail before layout; the next fonts.ready pass retries.
      }
    };

    measure();
    void document.fonts?.ready.then(measure).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [path, unit, fontSize]);

  useEffect(() => {
    const root = rootRef.current;
    const head = headRef.current;
    const tail = tailRef.current;
    const { length } = metrics;
    if (!root || !head || !tail || !length) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const sign = direction === "reverse" ? -1 : 1;
    let travel = 0;
    let frame = 0;
    let last = performance.now();
    let running = false;

    const apply = () => {
      const offset = wrap(travel, length);
      head.setAttribute("startOffset", String(offset));
      tail.setAttribute("startOffset", String(offset - length));
    };

    apply();
    if (reduced) return;

    const tick = (now: number) => {
      frame = 0;
      const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!pausedRef.current) travel += speed * sign * delta;
      apply();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) start();
            else stop();
          })
        : null;

    const onEnter = () => {
      pausedRef.current = true;
    };
    const onLeave = () => {
      pausedRef.current = false;
    };

    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointerleave", onLeave);

    if (observer) observer.observe(root);
    else start();

    return () => {
      observer?.disconnect();
      stop();
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [direction, metrics, speed]);

  const loopText = unit.repeat(metrics.reps);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-testid="text-loop"
      className={cn("relative w-full overflow-hidden select-none", className)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
      >
        <defs>
          <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset={EDGE_FADE} stopColor="#ffffff" stopOpacity="1" />
            <stop offset={1 - EDGE_FADE} stopColor="#ffffff" stopOpacity="1" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW_W} height={VIEW_H}>
            <rect width={VIEW_W} height={VIEW_H} fill={`url(#${fadeId})`} />
          </mask>
        </defs>

        <text ref={measureRef} className="invisible" style={textStyle} aria-hidden="true">
          {unit}
        </text>

        <g mask={`url(#${maskId})`} className={metrics.length ? undefined : "opacity-0"}>
          <path ref={pathRef} id={pathId} d={path} fill="none" />
          <text
            style={textStyle}
            fill="currentColor"
            dominantBaseline="central"
            aria-hidden="true"
            textLength={metrics.length || undefined}
            lengthAdjust="spacing"
          >
            <textPath ref={headRef} href={`#${pathId}`} startOffset={0}>
              {loopText}
            </textPath>
          </text>
          <text
            style={textStyle}
            fill="currentColor"
            dominantBaseline="central"
            aria-hidden="true"
            textLength={metrics.length || undefined}
            lengthAdjust="spacing"
          >
            <textPath ref={tailRef} href={`#${pathId}`} startOffset={0}>
              {loopText}
            </textPath>
          </text>
        </g>
      </svg>
    </div>
  );
}
