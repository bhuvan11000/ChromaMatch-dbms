import { json, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { leaveRoom } from "@/lib/services/roomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoomRouteContext = { params: Promise<{ code: string }> };

/** Leave a room (no body) — Architecture §5.10.6. */
export const POST = withHandler<RoomRouteContext>(async (request, context) => {
  const session = await requireUser(request);
  const { code } = await context.params;
  const result = await leaveRoom(session.userId, code);

  return json(result);
});
