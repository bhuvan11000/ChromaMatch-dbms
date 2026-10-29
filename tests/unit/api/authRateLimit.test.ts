import { describe, expect, it } from "vitest";

import {
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  createAuthRateLimiter,
} from "@/lib/api/rateLimit";
import { AppError } from "@/lib/errors";

const CONTEXT = {
  requestId: "test-request",
  route: "/api/auth/login",
  method: "POST",
};

function request(email: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
    body: JSON.stringify({ email }),
  });
}

function malformedRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
    body: "{not json",
  });
}

describe("createAuthRateLimiter", () => {
  it("allows exactly 10 requests and rejects the 11th", async () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });
    const req = (): Request => request("alice@example.com");

    for (let attempt = 1; attempt <= AUTH_RATE_LIMIT_MAX; attempt += 1) {
      await expect(limiter(req(), CONTEXT)).resolves.toBeUndefined();
    }

    const error = await limiter(req(), CONTEXT).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("resets after the window", async () => {
    let now = 5_000;
    const limiter = createAuthRateLimiter({ now: () => now });

    for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX; attempt += 1) {
      await limiter(request("alice@example.com"), CONTEXT);
    }
    await expect(limiter(request("alice@example.com"), CONTEXT)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    now += AUTH_RATE_LIMIT_WINDOW_MS;
    await expect(limiter(request("alice@example.com"), CONTEXT)).resolves.toBeUndefined();
  });

  it("keeps separate buckets per email and per IP", async () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });

    for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX; attempt += 1) {
      await limiter(request("alice@example.com", { "x-forwarded-for": "10.0.0.1" }), CONTEXT);
    }

    await expect(
      limiter(request("bob@example.com", { "x-forwarded-for": "10.0.0.1" }), CONTEXT),
    ).resolves.toBeUndefined();
    await expect(
      limiter(request("alice@example.com", { "x-forwarded-for": "10.0.0.2" }), CONTEXT),
    ).resolves.toBeUndefined();
  });

  it("falls back to an IP-only bucket for malformed bodies", async () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });

    for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX; attempt += 1) {
      await limiter(malformedRequest({ "x-real-ip": "10.0.0.9" }), CONTEXT);
    }

    await expect(
      limiter(malformedRequest({ "x-real-ip": "10.0.0.9" }), CONTEXT),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("can be reset between tests", async () => {
    const limiter = createAuthRateLimiter({ now: () => 1_000 });
    for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX; attempt += 1) {
      await limiter(request("alice@example.com"), CONTEXT);
    }
    await expect(limiter(request("alice@example.com"), CONTEXT)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    limiter.reset();
    await expect(limiter(request("alice@example.com"), CONTEXT)).resolves.toBeUndefined();
  });
});
