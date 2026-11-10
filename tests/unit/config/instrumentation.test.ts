import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(() => ({ NODE_ENV: "test" })),
}));

vi.mock("@/lib/config/env", () => ({
  getEnv: mocks.getEnv,
}));

import { register } from "@/instrumentation";

beforeEach(() => {
  mocks.getEnv.mockClear();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PHASE", "phase-development-server");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation.register", () => {
  it("validates the environment during Node server startup", async () => {
    await register();

    expect(mocks.getEnv).toHaveBeenCalledTimes(1);
  });

  it("skips the production build phase so CI builds need no secrets", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    await register();

    expect(mocks.getEnv).not.toHaveBeenCalled();
  });

  it("skips non-Node runtimes", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(mocks.getEnv).not.toHaveBeenCalled();
  });
});
