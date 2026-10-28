import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pingPostgres: vi.fn<() => Promise<void>>(),
  pingMongo: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/db/pg/client", () => ({ pingPostgres: mocks.pingPostgres }));
vi.mock("@/lib/db/mongo/client", () => ({ pingMongo: mocks.pingMongo }));

import { HEALTH_PING_TIMEOUT_MS, checkHealth } from "@/lib/services/healthService";

describe("checkHealth", () => {
  beforeEach(() => {
    mocks.pingPostgres.mockReset().mockResolvedValue(undefined);
    mocks.pingMongo.mockReset().mockResolvedValue(undefined);
  });

  it("reports both dependencies as ok", async () => {
    await expect(checkHealth()).resolves.toEqual({ postgres: "ok", mongo: "ok" });
  });

  it("reports Postgres down without failing the whole check", async () => {
    mocks.pingPostgres.mockRejectedValue(new Error("connection refused"));

    await expect(checkHealth()).resolves.toEqual({ postgres: "down", mongo: "ok" });
  });

  it("reports Mongo down without failing the whole check", async () => {
    mocks.pingMongo.mockRejectedValue(new Error("server selection timeout"));

    await expect(checkHealth()).resolves.toEqual({ postgres: "ok", mongo: "down" });
  });

  it("treats synchronous throws as down and never throws", async () => {
    mocks.pingPostgres.mockImplementation(() => {
      throw new Error("invalid DATABASE_URL");
    });
    mocks.pingMongo.mockImplementation(() => {
      throw new Error("invalid MONGODB_URI");
    });

    await expect(checkHealth()).resolves.toEqual({ postgres: "down", mongo: "down" });
  });

  it("times out hung pings", async () => {
    vi.useFakeTimers();
    try {
      mocks.pingPostgres.mockReturnValue(new Promise<void>(() => {}));
      mocks.pingMongo.mockReturnValue(new Promise<void>(() => {}));

      const pending = checkHealth();
      await vi.advanceTimersByTimeAsync(HEALTH_PING_TIMEOUT_MS);

      await expect(pending).resolves.toEqual({ postgres: "down", mongo: "down" });
    } finally {
      vi.useRealTimers();
    }
  });
});
