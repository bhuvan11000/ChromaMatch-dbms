import { json, parseQuery, withHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { adminUserIdSchema } from "@/lib/schemas/admin";
import { historyQuerySchema } from "@/lib/schemas/stats";
import { getUserHistory } from "@/lib/services/adminService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUserRouteContext = { params: Promise<{ id: string }> };

/** A player's game history, newest first — Architecture §5.10.7. */
export const GET = withHandler<AdminUserRouteContext>(async (request, context) => {
  const query = parseQuery(request, historyQuerySchema);
  const { id } = await context.params;
  const userId = adminUserIdSchema.parse(id);
  await requireAdmin(request);
  const page = await getUserHistory(userId, query);

  return json(page);
});
