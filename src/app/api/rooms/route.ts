import { json, parseBody, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createRoomRequestSchema } from "@/lib/schemas/rooms";
import { createRoom } from "@/lib/services/roomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a room — Architecture §5.10.6. */
export const POST = withHandler(async (request) => {
  const body = await parseBody(request, createRoomRequestSchema);
  const session = await requireUser(request);
  const state = await createRoom(session.userId, body);

  return json(state, { status: 201 });
});
