import { describe, expect, it } from "vitest";

import { fromTenths, hsvToCssColor, isValidHsv, normalizeHsv, toTenths } from "@/lib/domain/hsv";

describe("HSV helpers (Architecture §5.4.1)", () => {
  it("accepts finite channels within the specified ranges", () => {
    expect(isValidHsv({ h: 0, s: 0, v: 0 })).toBe(true);
    expect(isValidHsv({ h: 360, s: 100, v: 100 })).toBe(true);
    expect(isValidHsv({ h: 214.6, s: 62, v: 80.5 })).toBe(true);
  });

  it("rejects missing, non-finite and out-of-range channels", () => {
    expect(isValidHsv(null)).toBe(false);
    expect(isValidHsv(undefined)).toBe(false);
    expect(isValidHsv({})).toBe(false);
    expect(isValidHsv({ h: 1, s: 2 })).toBe(false);
    expect(isValidHsv({ h: -0.1, s: 50, v: 50 })).toBe(false);
    expect(isValidHsv({ h: 360.1, s: 50, v: 50 })).toBe(false);
    expect(isValidHsv({ h: 180, s: -0.1, v: 50 })).toBe(false);
    expect(isValidHsv({ h: 180, s: 100.1, v: 50 })).toBe(false);
    expect(isValidHsv({ h: 180, s: 50, v: -0.1 })).toBe(false);
    expect(isValidHsv({ h: 180, s: 50, v: 100.1 })).toBe(false);
    expect(isValidHsv({ h: Number.NaN, s: 50, v: 50 })).toBe(false);
    expect(isValidHsv({ h: Number.POSITIVE_INFINITY, s: 50, v: 50 })).toBe(false);
    expect(isValidHsv({ h: "180", s: 50, v: 50 })).toBe(false);
  });

  it("converts between decimal values and integer tenths", () => {
    expect(toTenths(214.6)).toBe(2146);
    expect(toTenths(0)).toBe(0);
    expect(toTenths(360)).toBe(3600);
    expect(toTenths(80.55)).toBe(806);
    expect(toTenths(-1.25)).toBe(-13);
    expect(fromTenths(2146)).toBe(214.6);
    expect(fromTenths(0)).toBe(0);
    expect(() => toTenths(Number.NaN)).toThrow(RangeError);
  });

  it("normalizes each channel to one decimal with half-away-from-zero rounding", () => {
    expect(normalizeHsv({ h: 214.64, s: 62.04, v: 80.55 })).toEqual({
      h: 214.6,
      s: 62,
      v: 80.6,
    });
    expect(normalizeHsv({ h: 359.96, s: 100, v: 0 })).toEqual({
      h: 360,
      s: 100,
      v: 0,
    });
    expect(() => normalizeHsv({ h: 361, s: 50, v: 50 })).toThrow(RangeError);
  });

  it("converts HSV to an rgb() string for display", () => {
    expect(hsvToCssColor({ h: 0, s: 100, v: 100 })).toBe("rgb(255, 0, 0)");
    expect(hsvToCssColor({ h: 60, s: 100, v: 100 })).toBe("rgb(255, 255, 0)");
    expect(hsvToCssColor({ h: 120, s: 100, v: 100 })).toBe("rgb(0, 255, 0)");
    expect(hsvToCssColor({ h: 180, s: 100, v: 100 })).toBe("rgb(0, 255, 255)");
    expect(hsvToCssColor({ h: 240, s: 100, v: 100 })).toBe("rgb(0, 0, 255)");
    expect(hsvToCssColor({ h: 300, s: 100, v: 100 })).toBe("rgb(255, 0, 255)");
    expect(hsvToCssColor({ h: 360, s: 100, v: 100 })).toBe("rgb(255, 0, 0)");
    expect(hsvToCssColor({ h: 0, s: 0, v: 100 })).toBe("rgb(255, 255, 255)");
    expect(hsvToCssColor({ h: 0, s: 0, v: 0 })).toBe("rgb(0, 0, 0)");
    expect(hsvToCssColor({ h: 0, s: 0, v: 50 })).toBe("rgb(128, 128, 128)");
    expect(() => hsvToCssColor({ h: 400, s: 50, v: 50 })).toThrow(RangeError);
  });
});
