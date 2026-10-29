import { NextResponse, type NextRequest } from "next/server";

import { readCookie, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Page-route session gate — Architecture §5.11.1.
 *
 * Only the cookie signature/claims are verified; no database access happens
 * here. The API guards remain the real authorization boundary.
 */

const PROTECTED_ROOTS = ["/home", "/play", "/rooms", "/profile", "/admin"] as const;
const AUTH_PATHS = new Set(["/login", "/register"]);

function isWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROOTS.some((root) => isWithin(pathname, root));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = readCookie(request, SESSION_COOKIE_NAME);
  const session = token ? await verifySessionToken(token) : null;

  if (session && AUTH_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  if (!session && isProtectedPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\.[^/]+$).*)"],
};
