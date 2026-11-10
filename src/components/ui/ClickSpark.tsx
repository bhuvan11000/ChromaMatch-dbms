"use client";

import { useEffect, useRef, type ReactNode } from "react";

const BURST_COLORS = ["#ff3b5c", "#ff7a1a", "#ffd000", "#16d39a", "#00b8e6", "#a855f7"];
const SPARK_COUNT = 12;
const BURST_MS = 560;
const CANVAS_SIZE = 220;

interface Burst {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  start: number;
  ratio: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Adapted from ReactBits "Click Spark" (https://reactbits.dev).
 *
 * A tiny electrical pop on every primary press. Canvas-only, decorative and
 * reduced-motion-safe: when the OS asks for less motion, no listener is
 * installed and nothing is drawn.
 */
export function ClickSpark({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce) return;

    const rootEl = root;
    const layerEl = layer;
    const bursts: Burst[] = [];
    let raf = 0;

    function remove(burst: Burst) {
      burst.canvas.remove();
      const index = bursts.indexOf(burst);
      if (index >= 0) bursts.splice(index, 1);
    }

    function frame(now: number) {
      raf = 0;

      for (const burst of [...bursts]) {
        const progress = Math.min(1, (now - burst.start) / BURST_MS);
        const ctx = burst.ctx;
        const center = CANVAS_SIZE / 2;
        const fade = 1 - progress;

        ctx.setTransform(burst.ratio, 0, 0, burst.ratio, 0, 0);
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        ctx.globalAlpha = fade * 0.45;
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2 * fade;
        ctx.beginPath();
        ctx.arc(center, center, 6 + easeOutCubic(progress) * 68, 0, Math.PI * 2);
        ctx.stroke();

        ctx.lineCap = "round";
        ctx.lineWidth = 2;
        for (let index = 0; index < SPARK_COUNT; index += 1) {
          const angle = (index / SPARK_COUNT) * Math.PI * 2 - Math.PI / 2;
          const travel = (30 + (index % 4) * 13) * easeOutCubic(progress);
          const length = (11 - (index % 3)) * (1 - progress);
          const x1 = center + Math.cos(angle) * travel;
          const y1 = center + Math.sin(angle) * travel;
          const x2 = center + Math.cos(angle) * (travel + length);
          const y2 = center + Math.sin(angle) * (travel + length);

          ctx.globalAlpha = fade;
          ctx.strokeStyle = BURST_COLORS[index % BURST_COLORS.length] ?? "#ffd000";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        if (progress >= 1) remove(burst);
      }

      if (bursts.length > 0) raf = requestAnimationFrame(frame);
    }

    function spawn(clientX: number, clientY: number) {
      const rect = layerEl.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE * ratio;
      canvas.height = CANVAS_SIZE * ratio;
      canvas.setAttribute("aria-hidden", "true");
      Object.assign(canvas.style, {
        position: "absolute",
        left: `${clientX - rect.left - CANVAS_SIZE / 2}px`,
        top: `${clientY - rect.top - CANVAS_SIZE / 2}px`,
        width: `${CANVAS_SIZE}px`,
        height: `${CANVAS_SIZE}px`,
        pointerEvents: "none",
        display: "block",
      });

      layerEl.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        canvas.remove();
        return;
      }

      bursts.push({ canvas, ctx, start: performance.now(), ratio });
      while (bursts.length > 8) {
        const oldest = bursts[0];
        if (oldest) remove(oldest);
      }
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary) return;
      spawn(event.clientX, event.clientY);
    }

    function handleClick(event: MouseEvent) {
      if (event.detail !== 0) return;
      const target = event.target instanceof Element ? event.target : rootEl;
      const rect = target.getBoundingClientRect();
      spawn(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    rootEl.addEventListener("pointerdown", handlePointerDown);
    rootEl.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(raf);
      rootEl.removeEventListener("pointerdown", handlePointerDown);
      rootEl.removeEventListener("click", handleClick);
      for (const burst of [...bursts]) remove(burst);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative isolate min-h-dvh w-full">
      {children}
      <span
        ref={layerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[45] overflow-hidden"
      />
    </div>
  );
}
