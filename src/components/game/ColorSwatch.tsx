import { cn } from "@/lib/cn";
import { hsvToCssColor, type Hsv } from "@/lib/domain/hsv";

export type ColorSwatchSize = "sm" | "md" | "lg" | "reveal" | "canvas" | "fill";
export type ColorSwatchTone = "chrome" | "stage";
export type ColorSwatchFrame = "default" | "none";

const SIZE_CLASSES: Record<ColorSwatchSize, string> = {
  sm: "h-20 w-full rounded-[0.75rem] sm:h-24",
  md: "h-28 w-full rounded-[0.875rem] sm:h-32",
  lg: "h-40 w-full rounded-[1rem] sm:h-48",
  reveal: "h-48 w-full rounded-[0.875rem] sm:h-64",
  canvas: "min-h-[16rem] w-full rounded-[0.875rem] sm:min-h-[24rem]",
  fill: "h-full w-full",
};

const TONE_CLASSES: Record<ColorSwatchTone, string> = {
  chrome: "border-border",
  stage: "border-stage-border",
};

const FRAME_CLASSES: Record<ColorSwatchFrame, string> = {
  default: "border",
  none: "border-0",
};

export interface ColorSwatchProps {
  hsv: Hsv;
  /** Accessible name; the caller renders the visible label beside the swatch. */
  label: string;
  size?: ColorSwatchSize;
  tone?: ColorSwatchTone;
  /** Use `none` when the caller supplies its own frame, e.g. a split result well. */
  frame?: ColorSwatchFrame;
  /** Optional test hook; use only when a test needs to assert presence. */
  testId?: string;
  className?: string;
}

/**
 * Display-only HSV swatch.
 *
 * Colour is rendered with `hsvToCssColor` and never stored. The caller renders
 * the visible label; numeric differences live in the result breakdown.
 */
export function ColorSwatch({
  hsv,
  label,
  size = "md",
  tone = "chrome",
  frame = "default",
  testId,
  className,
}: ColorSwatchProps) {
  return (
    <div
      role="img"
      aria-label={label}
      data-testid={testId}
      className={cn(FRAME_CLASSES[frame], SIZE_CLASSES[size], TONE_CLASSES[tone], className)}
      style={{ backgroundColor: hsvToCssColor(hsv) }}
    />
  );
}
