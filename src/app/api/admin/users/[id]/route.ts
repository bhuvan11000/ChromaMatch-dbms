import { json, withHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { adminUserIdSchema } from "@/lib/schemas/admin";
import { getUser } from "@/lib/services/adminService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUserRouteContext = { params: Promise<{ id: string }> };

/** Full player detail — Architecture §5.10.7. */
export const GET = withHandler<AdminUserRouteContext>(async (request, context) => {
  const { id } = await context.params;
  const userId = adminUserIdSchema.parse(id);
  await requireAdmin(request);
  const detail = await getUser(userId);

  return json(detail);
});
