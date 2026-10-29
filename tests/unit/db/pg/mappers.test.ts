import { describe, expect, it } from "vitest";

import { nullableNumericToNumber, numericToNumber } from "@/lib/db/pg/mappers";

describe("PostgreSQL numeric mappers", () => {
  it("converts a NUMERIC string to a number", () => {
    expect(numericToNumber("24.6")).toBe(24.6);
    expect(numericToNumber("0.0")).toBe(0);
  });

  it("preserves NULL for nullable NUMERIC columns", () => {
    expect(nullableNumericToNumber(null)).toBeNull();
    expect(nullableNumericToNumber("30.0")).toBe(30);
  });
});
