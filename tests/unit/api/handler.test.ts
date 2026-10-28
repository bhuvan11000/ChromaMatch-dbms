import type { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { json, withHandler } from "@/lib/api";
import { resetEnvCache } from "@/lib/config/env";
import { AppError } from "@/lib/errors";

const TEST_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  DATABASE_URL_DIRECT: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  MONGODB_URI: "mongodb://localhost:27017",
  SESSION_JWT_SECRET: "s".repeat(32),
  GAME_TOKEN_SECRET: "g".repeat(32),
  DAILY_SEED_SECRET: "daily-seed-secret",
  APP_ORIGIN: "http://localhost:3000",
  NODE_ENV: "test",
  LOG_LEVEL: "error",
};

beforeAll(() => {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    vi.stubEnv(key, value);
  }
});

afterAll(() => {
  resetEnvCache();
  vi.unstubAllEnvs();
});

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { issues?: Array<{ path: string; message: string; code: string }> };
  };
}

function makeRequest(method = "GET", headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost:3000/api/test", {
    method,
    headers,
  }) as unknown as NextRequest;
}

function jsonPost(headers: Record<string, string> = {}): NextRequest {
  return makeRequest("POST", {
    "content-type": "application/json",
    origin: "http://localhost:3000",
    ...headers,
  });
}

async function readError(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

describe("withHandler", () => {
  it("returns handler responses with no-store and a request id", async () => {
    const route = withHandler(async () => json({ status: "ok" }));
    const response = await route(makeRequest(), undefined);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("rejects a mutating request without Origin before the handler", async () => {
    const inner = vi.fn(async () => json({ ok: true }));
    const route = withHandler(inner);

    const response = await route(
      makeRequest("POST", { "content-type": "application/json" }),
      undefined,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect((await readError(response)).error.code).toBe("BAD_ORIGIN");
    expect(inner).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin mutating request", async () => {
    const route = withHandler(async () => json({ ok: true }));
    const response = await route(jsonPost({ origin: "http://evil.example" }), undefined);

    expect(response.status).toBe(403);
    expect((await readError(response)).error.code).toBe("BAD_ORIGIN");
  });

  it("runs the handler for a valid mutating request", async () => {
    const inner = vi.fn(async () => json({ ok: true }, { status: 201 }));
    const route = withHandler(inner);

    const response = await route(jsonPost(), undefined);

    expect(response.status).toBe(201);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("maps AppError to its status and the standard envelope", async () => {
    const route = withHandler(async () => {
      throw new AppError("ROOM_FULL");
    });

    const response = await route(makeRequest(), undefined);
    const body = await readError(response);

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ error: { code: "ROOM_FULL", message: "This room is full." } });
  });

  it("maps ZodError to 400 VALIDATION_ERROR with issue details", async () => {
    const schema = z.object({ email: z.email() }).strict();
    const route = withHandler(async () => {
      const body = (await Promise.resolve({ email: "nope", extra: true })) as unknown;
      schema.parse(body);
      return json({ ok: true });
    });

    const response = await route(makeRequest(), undefined);
    const body = await readError(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details?.issues?.length).toBeGreaterThanOrEqual(2);
    expect(body.error.details?.issues?.some((issue) => issue.path === "email")).toBe(true);
  });

  it("logs unexpected errors and returns a generic 500 without the cause", async () => {
    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    try {
      const route = withHandler(async () => {
        throw new Error("database password is hunter2");
      });

      const response = await route(makeRequest(), undefined);
      const body = await readError(response);

      expect(response.status).toBe(500);
      expect(body).toEqual({
        error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
      });
      expect(JSON.stringify(body)).not.toContain("hunter2");

      const logLines = writes.map((line) => JSON.parse(line) as Record<string, unknown>);
      const failure = logLines.find((line) => line.msg === "request_failed");
      expect(failure).toMatchObject({
        level: "error",
        status: 500,
        code: "INTERNAL_ERROR",
        route: "/api/test",
        method: "GET",
      });
      expect(failure?.requestId).toEqual(expect.any(String));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("invokes the rate-limit hook with request context", async () => {
    const hook = vi.fn();
    const route = withHandler(async () => json({ ok: true }), { rateLimit: hook });

    const response = await route(jsonPost(), undefined);

    expect(response.status).toBe(200);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        requestId: expect.any(String),
        route: "/api/test",
        method: "POST",
      }),
    );
  });

  it("returns 429 when the rate-limit hook rejects", async () => {
    const hook = vi.fn(() => {
      throw new AppError("RATE_LIMITED");
    });
    const route = withHandler(async () => json({ ok: true }), { rateLimit: hook });

    const response = await route(makeRequest(), undefined);

    expect(response.status).toBe(429);
    expect((await readError(response)).error.code).toBe("RATE_LIMITED");
  });
});
