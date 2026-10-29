import { AppError } from "@/lib/errors";

/** Rate-limiting hook — Architecture §5.5.7 and §5.13.1. */
export interface RateLimitContext {
  requestId: string;
  route: string;
  method: string;
}

/**
 * Hook invoked by `withHandler` before the route handler. Throwing an
 * `AppError("RATE_LIMITED")` produces a 429 response. The default is a no-op;
 * a real limiter can be plugged in later without touching route handlers.
 */
export type RateLimitHook = (request: Request, context: RateLimitContext) => void | Promise<void>;

export const noopRateLimit: RateLimitHook = () => {};

/** Minimum limiter for login/register — Architecture §5.5.7. */
export const AUTH_RATE_LIMIT_MAX = 10;
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const MAX_TRACKED_BUCKETS = 1_000;
const MAX_KEY_PART_LENGTH = 255;

export interface AuthRateLimiterOptions {
  limit?: number;
  windowMs?: number;
  /** Injectable clock for deterministic window tests. */
  now?: () => number;
}

export interface AuthRateLimiter {
  (request: Request, context: RateLimitContext): Promise<void>;
  /** Clears all buckets. Test-only helper. */
  reset(): void;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  const value = firstForwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return value.slice(0, MAX_KEY_PART_LENGTH);
}

/**
 * Reads the email from a cloned request body. withHandler runs this hook before
 * the route handler, so the original body must remain untouched. Invalid or
 * non-JSON bodies fall back to an IP-only bucket.
 */
async function requestEmail(request: Request): Promise<string> {
  try {
    const body = (await request.clone().json()) as unknown;
    if (typeof body === "object" && body !== null && "email" in body) {
      const email = (body as { email?: unknown }).email;
      if (typeof email === "string") {
        return email.trim().toLowerCase().slice(0, MAX_KEY_PART_LENGTH);
      }
    }
  } catch {
    // Malformed body: the route's Zod validation will report it; rate limiting
    // still applies to the IP.
  }

  return "";
}

function sweepExpired(buckets: Map<string, Bucket>, now: number): void {
  if (buckets.size < MAX_TRACKED_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * In-process fixed-window limiter keyed by IP + normalized email.
 *
 * This is best-effort on serverless: every instance has its own memory, so a
 * shared store would be required for strict global limits (Architecture
 * §5.5.7). The map self-cleans expired entries when it grows.
 */
export function createAuthRateLimiter(options: AuthRateLimiterOptions = {}): AuthRateLimiter {
  const limit = options.limit ?? AUTH_RATE_LIMIT_MAX;
  const windowMs = options.windowMs ?? AUTH_RATE_LIMIT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  const limiter = async (request: Request): Promise<void> => {
    const email = await requestEmail(request);
    const key = `${clientIp(request)}|${email}`;
    const currentTime = now();

    sweepExpired(buckets, currentTime);

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= currentTime) {
      buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      return;
    }

    if (bucket.count >= limit) {
      throw new AppError("RATE_LIMITED");
    }

    bucket.count += 1;
  };

  return Object.assign(limiter, {
    reset: () => {
      buckets.clear();
    },
  });
}

/** Shared limiter used by the register and login route handlers. */
export const authRateLimit = createAuthRateLimiter();

/** Test-only helper; production code must not reset the limiter. */
export function resetAuthRateLimiter(): void {
  authRateLimit.reset();
}
