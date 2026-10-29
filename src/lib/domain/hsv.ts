/**
 * HSV domain helpers — Architecture §5.4.1.
 *
 * Pure functions only: no I/O, no environment access and no implicit clock.
 */

import { HUE_MAX, HUE_MIN, SAT_MAX, SAT_MIN, VAL_MAX, VAL_MIN } from "@/lib/config/constants";

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * Convert a decimal value to integer tenths using round-half-away-from-zero.
 *
 * The small relative adjustment compensates for binary representations such
 * as 80.55 * 10 === 805.4999999999999, which would otherwise round down.
 */
export function toTenths(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("A finite number is required.");
  }

  const scaled = value * 10;
  const adjusted = scaled + Math.sign(scaled) * Number.EPSILON * Math.abs(scaled);
  return Math.sign(adjusted) * Math.round(Math.abs(adjusted));
}

/** Convert integer tenths back to a decimal value. */
export function fromTenths(tenths: number): number {
  return tenths / 10;
}

export function isValidHsv(value: unknown): value is Hsv {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { h?: unknown; s?: unknown; v?: unknown };

  return (
    isFiniteInRange(candidate.h, HUE_MIN, HUE_MAX) &&
    isFiniteInRange(candidate.s, SAT_MIN, SAT_MAX) &&
    isFiniteInRange(candidate.v, VAL_MIN, VAL_MAX)
  );
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Validate then round each channel to one decimal (half away from zero).
 * Architecture §5.4.1.
 */
export function normalizeHsv(hsv: Hsv): Hsv {
  if (!isValidHsv(hsv)) {
    throw new RangeError("Invalid HSV value.");
  }

  return {
    h: fromTenths(toTenths(hsv.h)),
    s: fromTenths(toTenths(hsv.s)),
    v: fromTenths(toTenths(hsv.v)),
  };
}

/**
 * Convert HSV to a CSS `rgb()` string for display only.
 *
 * HSV is not HSL: converting to HSL with the same numbers would produce a
 * different colour, so the display helper converts to RGB instead.
 */
export function hsvToCssColor(hsv: Hsv): string {
  if (!isValidHsv(hsv)) {
    throw new RangeError("Invalid HSV value.");
  }

  const hue = ((hsv.h % 360) + 360) % 360;
  const saturation = hsv.s / 100;
  const value = hsv.v / 100;

  const chroma = value * saturation;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    [red, green, blue] = [chroma, intermediate, 0];
  } else if (hue < 120) {
    [red, green, blue] = [intermediate, chroma, 0];
  } else if (hue < 180) {
    [red, green, blue] = [0, chroma, intermediate];
  } else if (hue < 240) {
    [red, green, blue] = [0, intermediate, chroma];
  } else if (hue < 300) {
    [red, green, blue] = [intermediate, 0, chroma];
  } else {
    [red, green, blue] = [chroma, 0, intermediate];
  }

  return `rgb(${toByte(red + match)}, ${toByte(green + match)}, ${toByte(blue + match)})`;
}

function toByte(channel: number): number {
  return Math.round(channel * 255);
}
