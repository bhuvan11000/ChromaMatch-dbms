import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

interface HeaderGroup {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

describe("next.config security headers", () => {
  it("applies the hardening headers to every route", async () => {
    const headers = nextConfig.headers as unknown as () => Promise<HeaderGroup[]>;
    const groups = await headers();

    expect(groups).toHaveLength(1);
    expect(groups[0]?.source).toBe("/(.*)");
    expect(groups[0]?.headers.map((header) => header.key)).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "X-Frame-Options",
        "Permissions-Policy",
      ]),
    );
  });
});
