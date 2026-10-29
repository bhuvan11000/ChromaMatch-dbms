import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { NextResponse } from "next/server";

import { SESSION_TTL_SECONDS } from "@/lib/config/constants";
import { getEnv } from "@/lib/config/env";
import type { UserRole } from "@/lib/schemas/auth";

/**
 * Session JWT and cookie helpers — Architecture §5.5.3.
 *
 * The cookie is an HS256 JWT signed with SESSION_JWT_SECRET. It is stateless:
 * no session table exists. The role is only a hint; privileged routes re-read
 * the role and ban flag from PostgreSQL.
 */

export const SESSION_COOKIE_NAME = "cm_session";
export const SESSION_JWT_ALGORITHM = "HS256" as const;

export interface Session {
  userId: number;
  roleHint: UserRole;
}

export interface SessionInput {
  userId: number;
  role: UserRole;
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

function getSessionSecret(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_JWT_SECRET);
}

function isUserRole(value: unknown): value is UserRole {
  return value === "player" || value === "admin";
}

/** Signs a session JWT. `now` is injectable so expiry can be tested deterministically. */
export async function signSession(input: SessionInput, now: Date = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({ role: input.role })
    .setProtectedHeader({ alg: SESSION_JWT_ALGORITHM })
    .setSubject(String(input.userId))
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .sign(getSessionSecret());
}

/** Verifies a session JWT and returns its trusted claims, or null on any failure. */
export async function verifySessionToken(token: string): Promise<Session | null> {
  const secret = getSessionSecret();

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, secret, {
      algorithms: [SESSION_JWT_ALGORITHM],
      requiredClaims: ["sub", "role", "iat", "exp"],
    });
    payload = result.payload;
  } catch {
    return null;
  }

  const subject = payload.sub;
  if (typeof subject !== "string" || !/^\d+$/.test(subject)) return null;

  const userId = Number(subject);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;

  if (!isUserRole(payload.role)) return null;

  return { userId, roleHint: payload.role };
}

/**
 * Cookie options for `cm_session`. `Secure` is enabled only in production.
 * The optional argument keeps the production branch unit-testable.
 */
export function sessionCookieOptions(
  isProduction: boolean = getEnv().NODE_ENV === "production",
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Sets the session cookie on an outgoing NextResponse. */
export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

/** Clears the session cookie by expiring it immediately. */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

/** Reads one cookie from the Cookie header without relying on a framework class. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    if (trimmed.slice(0, separator) !== name) continue;

    const rawValue = trimmed.slice(separator + 1);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}
