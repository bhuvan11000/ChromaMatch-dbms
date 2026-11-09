import { json, withHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { adminUserIdSchema } from "@/lib/schemas/admin";
import { setBan } from "@/lib/services/adminService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUserRouteContext = { params: Promise<{ id: string }> };

/** Ban a player — Architecture §5.10.7. */
export const POST = withHandler<AdminUserRouteContext>(async (request, context) => {
  const { id } = await context.params;
  const userId = adminUserIdSchema.parse(id);
  const session = await requireAdmin(request);
  const result = await setBan(session.userId, userId, true);

  return json(result);
});
