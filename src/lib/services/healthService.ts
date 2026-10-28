import { pingMongo } from "@/lib/db/mongo/client";
import { pingPostgres } from "@/lib/db/pg/client";

/**
 * Dependency health — Architecture §5.13.5.
 *
 * Runs a trivial ping against Postgres and Mongo with a short timeout. Every
 * failure (connection refused, timeout, missing/invalid env, synchronous
 * throw) is reported as "down"; this function never throws.
 */

export type DependencyStatus = "ok" | "down";

export interface HealthReport {
  postgres: DependencyStatus;
  mongo: DependencyStatus;
}

export const HEALTH_PING_TIMEOUT_MS = 1_500;

async function probe(operation: () => Promise<unknown>): Promise<DependencyStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("health ping timed out")), HEALTH_PING_TIMEOUT_MS);
    });

    await Promise.race([operation(), timeout]);
    return "ok";
  } catch {
    return "down";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const [postgres, mongo] = await Promise.all([probe(pingPostgres), probe(pingMongo)]);
  return { postgres, mongo };
}
