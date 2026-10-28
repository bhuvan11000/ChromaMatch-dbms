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
