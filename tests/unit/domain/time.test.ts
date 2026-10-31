import { describe, expect, it } from "vitest";

import { addDays, isValidUtcDateString, nextUtcMidnight, utcDateString } from "@/lib/domain/time";

describe("UTC date helpers (Architecture §5.4.5)", () => {
  it("formats the UTC calendar date around midnight", () => {
    expect(utcDateString(new Date("2026-10-29T00:00:00.000Z"))).toBe("2026-10-29");
    expect(utcDateString(new Date("2026-10-29T23:59:59.999Z"))).toBe("2026-10-29");
    expect(utcDateString(new Date("2026-10-30T00:00:00.000Z"))).toBe("2026-10-30");
  });

  it("uses UTC rather than the local timezone", () => {
    expect(utcDateString(new Date("2026-10-29T00:00:00+05:30"))).toBe("2026-10-28");
    expect(utcDateString(new Date("2026-12-31T23:00:00-02:00"))).toBe("2027-01-01");
  });

  it("formats month and year boundaries correctly", () => {
    expect(utcDateString(new Date("2026-01-31T23:59:59.999Z"))).toBe("2026-01-31");
    expect(utcDateString(new Date("2026-02-01T00:00:00.000Z"))).toBe("2026-02-01");
    expect(utcDateString(new Date("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31");
    expect(utcDateString(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01-01");
  });

  it("rejects invalid Date objects", () => {
    expect(() => utcDateString(new Date(Number.NaN))).toThrow(RangeError);
  });

  it("returns the next UTC midnight, including from exact midnight", () => {
    expect(nextUtcMidnight(new Date("2026-10-29T00:00:00.000Z")).toISOString()).toBe(
      "2026-10-30T00:00:00.000Z",
    );
    expect(nextUtcMidnight(new Date("2026-10-29T12:34:56.789Z")).toISOString()).toBe(
      "2026-10-30T00:00:00.000Z",
    );
    expect(nextUtcMidnight(new Date("2026-10-29T23:59:59.999Z")).toISOString()).toBe(
      "2026-10-30T00:00:00.000Z",
    );
  });

  it("returns the next UTC midnight across month, year and leap-day boundaries", () => {
    expect(nextUtcMidnight(new Date("2026-01-31T23:59:59.999Z")).toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(nextUtcMidnight(new Date("2026-12-31T23:59:59.999Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(nextUtcMidnight(new Date("2028-02-28T23:59:59.999Z")).toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("does not mutate the Date passed to nextUtcMidnight", () => {
    const input = new Date("2026-10-29T12:00:00.000Z");
    const original = input.toISOString();

    nextUtcMidnight(input);

    expect(input.toISOString()).toBe(original);
  });

  it("adds and subtracts calendar days across boundaries", () => {
    expect(addDays("2026-10-29", 0)).toBe("2026-10-29");
    expect(addDays("2026-10-29", 1)).toBe("2026-10-30");
    expect(addDays("2026-10-29", -1)).toBe("2026-10-28");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("rejects malformed or impossible dates", () => {
    for (const value of ["2026-02-30", "2026-13-01", "2026-00-01", "2026-1-01", "not-a-date"]) {
      expect(() => addDays(value, 1)).toThrow(RangeError);
    }
  });

  it("rejects non-integer day counts", () => {
    expect(() => addDays("2026-10-29", 1.5)).toThrow(RangeError);
    expect(() => addDays("2026-10-29", Number.NaN)).toThrow(RangeError);
  });

  it("validates real UTC calendar dates", () => {
    expect(isValidUtcDateString("2026-10-29")).toBe(true);
    expect(isValidUtcDateString("2028-02-29")).toBe(true);

    for (const value of ["2026-02-30", "2026-13-01", "2026-1-01", "not-a-date"]) {
      expect(isValidUtcDateString(value)).toBe(false);
    }
  });
});
