"use client";

import { useId, type CSSProperties, type KeyboardEvent } from "react";

import {
  HSV_DECIMALS,
  HUE_MAX,
  HUE_MIN,
  SAT_MAX,
  SAT_MIN,
  VAL_MAX,
  VAL_MIN,
} from "@/lib/config/constants";
import { hsvToCssColor, type Hsv } from "@/lib/domain/hsv";
import { cn } from "@/lib/cn";

import { ColorSwatch } from "./ColorSwatch";

const SLIDER_STEP = 0.1;
const SHIFT_STEP = SLIDER_STEP * 10;
const HUE_STOPS = Array.from({ length: 13 }, (_, index) => index * 30);

interface ChannelSpec {
  key: keyof Hsv;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  unit: string;
  ariaUnit: string;
}

const CHANNELS: readonly ChannelSpec[] = [
  {
    key: "h",
    label: "Hue",
    shortLabel: "Hue",
    min: HUE_MIN,
    max: HUE_MAX,
    unit: "°",
    ariaUnit: "degrees",
  },
  {
    key: "s",
    label: "Saturation",
    shortLabel: "Sat",
    min: SAT_MIN,
    max: SAT_MAX,
    unit: "%",
    ariaUnit: "percent",
  },
  {
    key: "v",
    label: "Value",
    shortLabel: "Val",
    min: VAL_MIN,
    max: VAL_MAX,
    unit: "%",
    ariaUnit: "percent",
  },
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

/**
 * Build the functional ramp for one channel.
 *
 * Hue is a full rainbow; saturation and value use the current mix so the ramp
 * previews exactly what moving that channel will do. These gradients are
 * controls, not decoration.
 */
function rampFor(spec: ChannelSpec, value: Hsv): string {
  if (spec.key === "h") {
    const stops = HUE_STOPS.map(
      (hue) =>
        `${hsvToCssColor({ h: hue, s: 100, v: 100 })} ${((hue / HUE_MAX) * 100).toFixed(1)}%`,
    );
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }

  if (spec.key === "s") {
    return `linear-gradient(to right, ${hsvToCssColor({ ...value, s: 0 })}, ${hsvToCssColor({ ...value, s: 100 })})`;
  }

  return `linear-gradient(to right, ${hsvToCssColor({ ...value, v: 0 })}, ${hsvToCssColor({ ...value, v: 100 })})`;
}

function MixBadge({ value }: { value: Hsv }) {
  return (
    <span className="rounded-[0.35rem] border border-white/25 bg-black/55 px-2 py-1 font-mono text-[8px] font-medium tracking-[0.06em] text-white/90 tabular-nums backdrop-blur-sm sm:text-[9px]">
      H {formatValue(value.h)}° · S {formatValue(value.s)}% · V {formatValue(value.v)}%
    </span>
  );
}

function ViewfinderCorners() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className="absolute top-2.5 left-2.5 size-4 border-t-2 border-l-2 border-white/45" />
      <span className="absolute top-2.5 right-2.5 size-4 border-t-2 border-r-2 border-white/45" />
      <span className="absolute bottom-2.5 left-2.5 size-4 border-b-2 border-l-2 border-white/45" />
      <span className="absolute right-2.5 bottom-2.5 size-4 border-r-2 border-b-2 border-white/45" />
    </span>
  );
}

export interface HsvSlidersProps {
  value: Hsv;
  onChange: (value: Hsv) => void;
  className?: string;
  /** Decorative round label for the canvas badge, e.g. "02 / 03". */
  roundLabel?: string;
}

/**
 * The guess dock: three tactile vertical colour ramps beside a full live
 * colour canvas. The native range inputs keep keyboard support (arrow keys,
 * Shift + arrow = 1.0) and every channel exposes an accessible value.
 */
export function HsvSliders({ value, onChange, className, roundLabel }: HsvSlidersProps) {
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
    <div
      className={cn("grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-stretch", className)}
    >
      <div className="order-2 min-w-0 sm:order-1 sm:flex sm:flex-col sm:justify-center">
        <div className="rounded-[0.7rem] border border-stage-border bg-stage-surface/45 p-2">
          <div className="grid grid-cols-3 gap-1.5">
            {CHANNELS.map((spec) => {
              const inputId = `${idPrefix}-${spec.key}`;
              const channelValue = value[spec.key];
              const ramp = rampFor(spec, value);

              return (
                <div
                  key={spec.key}
                  title={spec.label}
                  className="flex min-w-0 flex-col rounded-[0.45rem] border border-stage-border bg-stage-bg/70 px-1 pt-2 pb-1.5"
                >
                  <label
                    htmlFor={inputId}
                    className="text-center font-mono text-[9px] leading-tight font-bold tracking-[0.16em] text-stage-muted uppercase"
                  >
                    {spec.shortLabel}
                  </label>

                  <div className="relative mx-auto mt-1 h-44 w-9 sm:h-52">
                    <input
                      id={inputId}
                      type="range"
                      min={spec.min}
                      max={spec.max}
                      step={SLIDER_STEP}
                      value={formatValue(channelValue)}
                      aria-label={spec.label}
                      aria-orientation="vertical"
                      aria-valuetext={`${formatValue(channelValue)} ${spec.ariaUnit}`}
                      onChange={(event) => update(spec, Number(event.currentTarget.value))}
                      onKeyDown={(event) => handleKeyDown(spec, event)}
                      style={{ "--cm-ramp": ramp } as CSSProperties}
                      className="cm-ramp-slider absolute top-1/2 left-1/2 w-44 -translate-x-1/2 -translate-y-1/2 -rotate-90 sm:w-52"
                    />
                  </div>

                  <output
                    htmlFor={inputId}
                    className="mt-1 block rounded-[0.3rem] border border-stage-border bg-stage-surface px-0.5 py-1 text-center font-mono text-xs leading-none font-bold text-stage-fg tabular-nums"
                  >
                    {formatValue(channelValue)}
                    <span className="ml-0.5 text-[8px] font-medium text-stage-muted">
                      {spec.unit}
                    </span>
                  </output>
                </div>
              );
            })}
          </div>

          <p className="mt-1.5 text-center font-mono text-[8px] tracking-[0.12em] text-stage-muted uppercase">
            Shift + arrow = ±1.0
          </p>
        </div>
      </div>

      <div className="order-1 min-w-0 sm:order-2">
        <div className="relative overflow-hidden rounded-[0.7rem] border-2 border-stage-border">
          <ColorSwatch
            hsv={value}
            label="Your guess"
            size="canvas"
            tone="stage"
            frame="none"
            testId="guess-preview"
          />

          <ViewfinderCorners />

          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="rounded-[0.35rem] border border-white/25 bg-black/55 px-2.5 py-1 font-mono text-[8px] font-bold tracking-[0.18em] text-white uppercase backdrop-blur-sm sm:text-[9px]">
                Live mix
              </span>
              <MixBadge value={value} />
            </div>

            <div className="flex items-end justify-between gap-2">
              <span className="font-mono text-[9px] font-bold tracking-[0.18em] text-white/85 uppercase">
                Your guess
              </span>
              {roundLabel ? (
                <span className="rounded-[0.35rem] border border-white/25 bg-black/55 px-2.5 py-1 font-mono text-[8px] font-bold tracking-[0.16em] text-white/85 uppercase backdrop-blur-sm sm:text-[9px]">
                  {roundLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
