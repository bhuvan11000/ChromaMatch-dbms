import { json, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { startRoom } from "@/lib/services/roomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoomRouteContext = { params: Promise<{ code: string }> };

/** Start a room (creator only, no body) — Architecture §5.10.6. */
export const POST = withHandler<RoomRouteContext>(async (request, context) => {
  const session = await requireUser(request);
  const { code } = await context.params;
  const state = await startRoom(session.userId, code);

  return json(state);
});
