import { json, parseBody, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { gameSubmitRequestSchema } from "@/lib/schemas/game";
import { submitGame } from "@/lib/services/gameService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Submit one completed game — Architecture §5.6.3, §5.7.3, §5.10.4.
 *
 * The body supplies guesses only; targets, color numbers and play order come
 * from the verified game token.
 */
export const POST = withHandler(async (request) => {
  const body = await parseBody(request, gameSubmitRequestSchema);
  const session = await requireUser(request);
  const result = await submitGame(session.userId, body, new Date());

  return json(result);
});
