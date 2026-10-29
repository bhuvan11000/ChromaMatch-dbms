import { SignJWT, decodeJwt } from "jose";
import { NextResponse } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SESSION_TTL_SECONDS } from "@/lib/config/constants";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  readCookie,
  sessionCookieOptions,
  setSessionCookie,
  signSession,
  verifySessionToken,
} from "@/lib/auth/session";

import { AUTH_TEST_ENV, resetAuthEnv, stubAuthEnv, tamperToken } from "../support/auth";

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

function requestWithCookie(value: string): Request {
  return new Request("http://localhost:3000/api/me", {
    headers: { cookie: value },
  });
}

describe("session signing and verification", () => {
  it("signs an HS256 JWT with the session claims and TTL", async () => {
    const token = await signSession(
      { userId: 42, role: "player" },
      new Date("2026-10-29T12:00:00.000Z"),
    );

    const payload = decodeJwt(token);
    expect(payload.sub).toBe("42");
    expect(payload.role).toBe("player");
    expect(payload.iat).toBe(Math.floor(Date.parse("2026-10-29T12:00:00.000Z") / 1000));
    expect(payload.exp).toBe((payload.iat as number) + SESSION_TTL_SECONDS);

    await expect(verifySessionToken(token)).resolves.toEqual({
      userId: 42,
      roleHint: "player",
    });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession({ userId: 42, role: "player" });
    const tampered = tamperToken(token);

    await expect(verifySessionToken(tampered)).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await new SignJWT({ role: "player" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode("x".repeat(32)));

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const issuedAt = new Date(Date.now() - (SESSION_TTL_SECONDS + 60) * 1000);
    const token = await signSession({ userId: 42, role: "player" }, issuedAt);

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("rejects an invalid role claim", async () => {
    const token = await new SignJWT({ role: "superuser" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(AUTH_TEST_ENV.SESSION_JWT_SECRET));

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("rejects a non-numeric subject", async () => {
    const token = await new SignJWT({ role: "player" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("alice")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(AUTH_TEST_ENV.SESSION_JWT_SECRET));

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });
});

describe("session cookie", () => {
  it("uses the documented flags in development/test", () => {
    expect(sessionCookieOptions(false)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
  });

  it("enables Secure in production", () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
  });

  it("writes a cookie that carries the JWT and all flags", () => {
    const response = new NextResponse(null);
    setSessionCookie(response, "signed-token");
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=signed-token`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("clears the cookie with Max-Age=0", () => {
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("reads the session cookie from a Cookie header", () => {
    expect(
      readCookie(requestWithCookie("other=1; cm_session=abc.def.ghi"), SESSION_COOKIE_NAME),
    ).toBe("abc.def.ghi");
    expect(readCookie(requestWithCookie("other=1"), SESSION_COOKIE_NAME)).toBeNull();
    expect(readCookie(new Request("http://localhost:3000"), SESSION_COOKIE_NAME)).toBeNull();
  });
});
