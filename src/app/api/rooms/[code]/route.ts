import { json, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getRoomState } from "@/lib/services/roomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Next 16 route params are async. */
type RoomRouteContext = { params: Promise<{ code: string }> };

/** Current RoomState for a member — Architecture §5.10.6. */
export const GET = withHandler<RoomRouteContext>(async (request, context) => {
  const session = await requireUser(request);
  const { code } = await context.params;
  const state = await getRoomState(session.userId, code);

  return json(state);
});
