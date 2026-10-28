import { getEnv } from "@/lib/config/env";
import { AppError } from "@/lib/errors";

/**
 * CSRF / Origin protection — Architecture §5.5.5.
 *
 * Every mutating request must send `Content-Type: application/json` and an
 * `Origin` (or `Referer`) whose origin matches `APP_ORIGIN`. The check is
 * invoked by `withHandler` before the route handler runs.
 */

export const MUTATING_METHODS = ["POST", "PATCH", "PUT", "DELETE"] as const;

export type MutatingMethod = (typeof MUTATING_METHODS)[number];

export function isMutatingMethod(method: string): method is MutatingMethod {
  return (MUTATING_METHODS as readonly string[]).includes(method.toUpperCase());
}

export function isJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  const [mediaType] = value.split(";");
  return mediaType?.trim().toLowerCase() === "application/json";
}

/** Returns the normalized origin of a URL/Referer value, or null if malformed. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Throws `BAD_ORIGIN` when a mutating request is malformed or comes from
 * another origin. Safe methods are not checked.
 */
export function assertValidRequestOrigin(request: Request, appOrigin?: string): void {
  if (!isMutatingMethod(request.method)) return;

  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new AppError("BAD_ORIGIN", "Mutating requests must use Content-Type: application/json.");
  }

  // The Origin header is authoritative when present; only fall back to Referer.
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  const requestOrigin = normalizeOrigin(source);
  const expectedOrigin = normalizeOrigin(appOrigin ?? getEnv().APP_ORIGIN);

  if (requestOrigin === null || expectedOrigin === null || requestOrigin !== expectedOrigin) {
    throw new AppError("BAD_ORIGIN", "The request origin is not allowed.");
  }
}
