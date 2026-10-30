"use client";

import { useId, type KeyboardEvent } from "react";

import {
  HSV_DECIMALS,
  HUE_MAX,
  HUE_MIN,
  SAT_MAX,
  SAT_MIN,
  VAL_MAX,
  VAL_MIN,
} from "@/lib/config/constants";
import type { Hsv } from "@/lib/domain/hsv";
import { cn } from "@/lib/cn";

import { ColorSwatch } from "./ColorSwatch";

const SLIDER_STEP = 0.1;
const SHIFT_STEP = SLIDER_STEP * 10;

interface ChannelSpec {
  key: keyof Hsv;
  label: string;
  min: number;
  max: number;
  unit: string;
  ariaUnit: string;
}

const CHANNELS: readonly ChannelSpec[] = [
  { key: "h", label: "Hue", min: HUE_MIN, max: HUE_MAX, unit: "°", ariaUnit: "degrees" },
  { key: "s", label: "Saturation", min: SAT_MIN, max: SAT_MAX, unit: "%", ariaUnit: "percent" },
  { key: "v", label: "Value", min: VAL_MIN, max: VAL_MAX, unit: "%", ariaUnit: "percent" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatValue(value: number): string {
  return value.toFixed(HSV_DECIMALS);
}

export interface HsvSlidersProps {
  value: Hsv;
  onChange: (value: Hsv) => void;
  className?: string;
}

/**
 * Three controlled HSV sliders for the guess phase.
 *
 * Native range inputs provide arrow-key support; Shift + arrow applies a
 * 10× step (1.0) for faster coarse adjustments. The live preview is a display
 * swatch only — the guess itself stays in React state.
 */
export function HsvSliders({ value, onChange, className }: HsvSlidersProps) {
  const idPrefix = useId();

  function update(spec: ChannelSpec, raw: number): void {
    if (!Number.isFinite(raw)) return;

    const next = clamp(roundTenths(raw), spec.min, spec.max);
    if (next === value[spec.key]) return;

    onChange({ ...value, [spec.key]: next });
  }

  function handleKeyDown(spec: ChannelSpec, event: KeyboardEvent<HTMLInputElement>): void {
    if (!event.shiftKey) return;

    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
    update(spec, value[spec.key] + direction * SHIFT_STEP);
  }

  return (
    <div className={cn("grid gap-5 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-start", className)}>
      <div className="min-w-0 space-y-4">
        {CHANNELS.map((spec) => {
          const inputId = `${idPrefix}-${spec.key}`;
          const channelValue = value[spec.key];

          return (
            <div key={spec.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label
                  htmlFor={inputId}
                  className="font-mono text-[11px] tracking-[0.14em] text-stage-muted uppercase"
                >
                  {spec.label}
                </label>
                <output
                  htmlFor={inputId}
                  className="font-mono text-sm font-bold text-stage-fg tabular-nums"
                >
                  {formatValue(channelValue)}
                  <span className="ml-1 text-[10px] text-stage-muted">{spec.unit}</span>
                </output>
              </div>
              <input
                id={inputId}
                type="range"
                min={spec.min}
                max={spec.max}
                step={SLIDER_STEP}
                value={formatValue(channelValue)}
                aria-valuetext={`${formatValue(channelValue)} ${spec.ariaUnit}`}
                onChange={(event) => update(spec, Number(event.currentTarget.value))}
                onKeyDown={(event) => handleKeyDown(spec, event)}
                className="mt-1 h-11 w-full cursor-pointer [accent-color:var(--stage-fg)] focus-visible:ring-2 focus-visible:ring-stage-fg focus-visible:ring-offset-2 focus-visible:ring-offset-stage-bg focus-visible:outline-none"
              />
            </div>
          );
        })}

        <p className="font-mono text-[10px] tracking-[0.14em] text-stage-muted uppercase">
          Shift + arrow = ±1.0
        </p>
      </div>

      <div className="flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-2">
        <div className="w-full max-w-[7rem] sm:max-w-none">
          <ColorSwatch
            hsv={value}
            label="Your guess"
            size="md"
            tone="stage"
            testId="guess-preview"
          />
        </div>
        <p className="font-mono text-[10px] tracking-[0.14em] text-stage-muted uppercase">
          Live mix
        </p>
      </div>
    </div>
  );
}
