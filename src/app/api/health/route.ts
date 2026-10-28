import { json, withHandler } from "@/lib/api";
import { checkHealth } from "@/lib/services/healthService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public dependency health check — Architecture §5.13.5.
 *
 * Always responds 200 with the status of each dependency so uptime checks can
 * distinguish "app is running" from "database is down".
 */
export const GET = withHandler(async () => json(await checkHealth()));
