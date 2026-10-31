import { json, parseQuery, withHandler } from "@/lib/api";
import { getSession } from "@/lib/auth/guards";
import { dailyLeaderboardQuerySchema } from "@/lib/schemas/leaderboard";
import { getDaily } from "@/lib/services/leaderboardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Daily leaderboard — Architecture §5.10.5.
 *
 * `date` defaults to today (UTC). Future and malformed dates become
 * INVALID_DATE in the service; a day without a challenge is an empty page.
 */
export const GET = withHandler(async (request) => {
  const query = parseQuery(request, dailyLeaderboardQuerySchema);
  const session = await getSession(request);
  const leaderboard = await getDaily(query, session?.userId, new Date());

  return json(leaderboard);
});
