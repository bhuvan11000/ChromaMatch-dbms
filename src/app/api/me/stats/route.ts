import { json, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getMyStats } from "@/lib/services/statsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Profile counters plus available history aggregations — Architecture §5.10.2.
 *
 * PostgreSQL counters always return; MongoDB history degrades to
 * `historyAvailable: false` / `history: null` when the history store is down.
 */
export const GET = withHandler(async (request) => {
  const session = await requireUser(request);
  const stats = await getMyStats(session.userId, new Date());

  return json(stats);
});
