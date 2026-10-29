import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signSession } from "@/lib/auth/session";
import { middleware } from "@/middleware";

import { resetAuthEnv, stubAuthEnv, tamperToken } from "./support/auth";

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

function requestFor(path: string, token?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: token ? { cookie: `cm_session=${token}` } : undefined,
  });
}

function redirectPath(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

async function sessionToken(): Promise<string> {
  return signSession({ userId: 7, role: "player" });
}

describe("session middleware", () => {
  it("redirects unauthenticated protected pages to /login", async () => {
    for (const path of [
      "/home",
      "/play/global",
      "/rooms",
      "/rooms/ABCD2345",
      "/profile",
      "/admin",
    ]) {
      const response = await middleware(requestFor(path));
      expect(redirectPath(response), path).toBe("/login");
    }
  });

  it("allows public pages without a session", async () => {
    for (const path of ["/", "/login", "/register", "/leaderboard/global", "/leaderboard/daily"]) {
      const response = await middleware(requestFor(path));
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
      expect(redirectPath(response), path).toBeNull();
    }
  });

  it("allows signed-in users through protected pages", async () => {
    const response = await middleware(requestFor("/home", await sessionToken()));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(redirectPath(response)).toBeNull();
  });

  it("redirects signed-in users away from /login and /register", async () => {
    const token = await sessionToken();

    for (const path of ["/login", "/register"]) {
      const response = await middleware(requestFor(path, token));
      expect(redirectPath(response), path).toBe("/home");
    }
  });

  it("treats a tampered cookie as unauthenticated", async () => {
    const token = tamperToken(await sessionToken());
    const response = await middleware(requestFor("/home", token));

    expect(redirectPath(response)).toBe("/login");
  });

  it("treats an expired cookie as unauthenticated", async () => {
    const token = await signSession(
      { userId: 7, role: "player" },
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    );
    const response = await middleware(requestFor("/home", token));

    expect(redirectPath(response)).toBe("/login");
  });

  it("does not redirect a malformed cookie away from the login page", async () => {
    const response = await middleware(requestFor("/login", "not-a-jwt"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(redirectPath(response)).toBeNull();
  });
});
