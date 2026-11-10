/**
 * Server startup hook — Architecture §5.3.2.
 *
 * Validates the environment once before the Node server accepts requests so a
 * missing or malformed variable fails fast. The production build phase is
 * skipped because CI builds do not require (and must not contain) secrets;
 * `next dev` and `next start` still validate at boot.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { getEnv } = await import("@/lib/config/env");
  getEnv();
}
