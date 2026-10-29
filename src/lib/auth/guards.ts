import { findById } from "@/lib/db/pg/queries/users";
import { AppError } from "@/lib/errors";

import { readCookie, SESSION_COOKIE_NAME, verifySessionToken, type Session } from "./session";

/**
 * Session guards — Architecture §5.5.4.
 *
 * `getSession` only verifies the cookie signature. `requireAdmin` deliberately
 * re-reads the role from PostgreSQL so a demotion takes effect immediately and
 * a forged role hint in the JWT grants nothing.
 */

export type { Session };

export async function getSession(request: Request): Promise<Session | null> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireUser(request: Request): Promise<Session> {
  const session = await getSession(request);
  if (!session) {
    throw new AppError("UNAUTHENTICATED");
  }
  return session;
}

export async function requireAdmin(request: Request): Promise<Session> {
  const session = await requireUser(request);
  const user = await findById(session.userId);

  if (!user) {
    throw new AppError("UNAUTHENTICATED");
  }

  if (user.role !== "admin") {
    throw new AppError("FORBIDDEN");
  }

  return session;
}
