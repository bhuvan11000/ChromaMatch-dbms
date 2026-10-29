import { json, parseBody, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { gameStartRequestSchema } from "@/lib/schemas/game";
import { startGame } from "@/lib/services/gameService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a game and receive its signed token — Architecture §5.6.2, §5.10.4.
 */
export const POST = withHandler(async (request) => {
  const body = await parseBody(request, gameStartRequestSchema);
  const session = await requireUser(request);
  const game = await startGame(session.userId, body, new Date());

  return json(game);
});
