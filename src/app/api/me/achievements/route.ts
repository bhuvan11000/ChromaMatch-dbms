import { json, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getAchievements } from "@/lib/services/statsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Achievement definitions joined with the signed-in player's earned state — §5.10.2. */
export const GET = withHandler(async (request) => {
  const session = await requireUser(request);
  const achievements = await getAchievements(session.userId);

  return json(achievements);
});
