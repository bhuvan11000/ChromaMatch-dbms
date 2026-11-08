import { json, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getTodaySummary } from "@/lib/services/dailyChallengeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Today's Daily info for the signed-in player — Architecture §5.10.3.
 *
 * Read-only: it never creates the challenge and never returns colours.
 */
export const GET = withHandler(async (request) => {
  const session = await requireUser(request);
  const summary = await getTodaySummary(session.userId, new Date());

  return json(summary);
});
