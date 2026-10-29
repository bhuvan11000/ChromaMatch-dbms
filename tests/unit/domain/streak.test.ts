import { describe, expect, it } from "vitest";

import { displayStreak } from "@/lib/domain/streak";

describe("displayStreak (Architecture §5.4.6)", () => {
  it("keeps the stored streak when the last play is today or yesterday", () => {
    expect(displayStreak(7, "2026-10-29", "2026-10-29")).toBe(7);
    expect(displayStreak(7, "2026-10-28", "2026-10-29")).toBe(7);
  });

  it("displays zero when the last play is before yesterday", () => {
    expect(displayStreak(7, "2026-10-27", "2026-10-29")).toBe(0);
    expect(displayStreak(7, "2026-09-01", "2026-10-29")).toBe(0);
  });

  it("keeps the stored value for null or future dates", () => {
    expect(displayStreak(0, null, "2026-10-29")).toBe(0);
    expect(displayStreak(4, null, "2026-10-29")).toBe(4);
    expect(displayStreak(7, "2026-10-30", "2026-10-29")).toBe(7);
  });

  it("handles month and year boundaries", () => {
    expect(displayStreak(3, "2025-12-31", "2026-01-01")).toBe(3);
    expect(displayStreak(3, "2026-02-28", "2026-03-01")).toBe(3);
    expect(displayStreak(3, "2025-12-30", "2026-01-01")).toBe(0);
  });

  it("preserves a stored zero", () => {
    expect(displayStreak(0, "2026-10-28", "2026-10-29")).toBe(0);
  });
});
