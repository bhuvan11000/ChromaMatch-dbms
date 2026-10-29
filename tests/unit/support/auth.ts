import { randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";
import { vi } from "vitest";

import { resetEnvCache } from "@/lib/config/env";

/** Valid environment for auth unit tests. Secrets are synthetic. */
export const AUTH_TEST_ENV: Record<string, string> = {
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

export function stubAuthEnv(): void {
  for (const [key, value] of Object.entries(AUTH_TEST_ENV)) {
    vi.stubEnv(key, value);
  }
  resetEnvCache();
}

export function resetAuthEnv(): void {
  resetEnvCache();
  vi.unstubAllEnvs();
}

/** Generates test credentials at runtime; tests contain no real password. */
export function randomPassword(): string {
  return randomBytes(24).toString("base64url");
}

export function makeJsonRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      origin: AUTH_TEST_ENV.APP_ORIGIN,
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return new Request(`http://localhost:3000${path}`, init) as unknown as NextRequest;
}

export function makeGetRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new Request(`http://localhost:3000${path}`, {
    method: "GET",
    headers,
  }) as unknown as NextRequest;
}

export function sessionCookieHeader(token: string): Record<string, string> {
  return { cookie: `cm_session=${token}` };
}

/** Changes the first signature character, which always invalidates the HMAC. */
export function tamperToken(token: string): string {
  const parts = token.split(".");
  const signature = parts[2] ?? "";
  parts[2] = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  return parts.join(".");
}
