import { json, parseQuery, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { historyQuerySchema } from "@/lib/schemas/stats";
import { getHistory } from "@/lib/services/statsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cursor-paginated game history for the signed-in player — Architecture §5.10.2.
 *
 * Results are newest first and include all modes. Room attempts carry
 * `mode: "room"`, `roomId` and `attemptNumber`.
 */
export const GET = withHandler(async (request) => {
  const query = parseQuery(request, historyQuerySchema);
  const session = await requireUser(request);
  const page = await getHistory(session.userId, query);

  return json(page);
});
