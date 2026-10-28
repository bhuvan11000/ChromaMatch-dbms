import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkHealth: vi.fn(),
}));

vi.mock("@/lib/services/healthService", () => ({ checkHealth: mocks.checkHealth }));

import { GET } from "@/app/api/health/route";

function makeRequest(): NextRequest {
  return new Request("http://localhost:3000/api/health") as unknown as NextRequest;
}

describe("GET /api/health", () => {
  beforeEach(() => {
    mocks.checkHealth.mockReset();
  });

  it("returns the status of both dependencies", async () => {
    mocks.checkHealth.mockResolvedValue({ postgres: "ok", mongo: "down" });

    const response = await GET(makeRequest(), undefined);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ postgres: "ok", mongo: "down" });
  });

  it("always calls the single health service", async () => {
    mocks.checkHealth.mockResolvedValue({ postgres: "ok", mongo: "ok" });

    await GET(makeRequest(), undefined);

    expect(mocks.checkHealth).toHaveBeenCalledTimes(1);
  });
});
