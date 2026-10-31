import { json, parseQuery, withHandler } from "@/lib/api";
import { getSession } from "@/lib/auth/guards";
import { globalLeaderboardQuerySchema } from "@/lib/schemas/leaderboard";
import { getGlobal } from "@/lib/services/leaderboardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Global leaderboard — Architecture §5.10.5.
 *
 * The viewer is optional: a valid session only adds the `me` row. The view
 * itself excludes banned players and players without a score.
 */
export const GET = withHandler(async (request) => {
  const query = parseQuery(request, globalLeaderboardQuerySchema);
  const session = await getSession(request);
  const leaderboard = await getGlobal(query, session?.userId);

  return json(leaderboard);
});
