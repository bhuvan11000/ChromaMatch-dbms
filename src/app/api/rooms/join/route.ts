import { json, parseBody, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { joinRoomRequestSchema } from "@/lib/schemas/rooms";
import { joinRoom } from "@/lib/services/roomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Join a lobby by code — Architecture §5.10.6. */
export const POST = withHandler(async (request) => {
  const body = await parseBody(request, joinRoomRequestSchema);
  const session = await requireUser(request);
  const state = await joinRoom(session.userId, body.code);

  return json(state);
});
