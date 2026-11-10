import { json, parseBody, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { gameRoundScoreRequestSchema } from "@/lib/schemas/game";
import { scoreRoundPreview } from "@/lib/services/gameService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Score one guessed round for immediate feedback.
 *
 * Stateless: nothing is persisted. The target comes only from the signed game
 * token; the final `POST /api/games/submit` remains the authoritative write.
 */
export const POST = withHandler(async (request) => {
  const body = await parseBody(request, gameRoundScoreRequestSchema);
  const session = await requireUser(request);
  const preview = await scoreRoundPreview(session.userId, body, new Date());

  return json(preview);
});
