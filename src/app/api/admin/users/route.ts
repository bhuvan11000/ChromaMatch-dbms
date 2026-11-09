import { json, parseQuery, withHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { adminUsersQuerySchema } from "@/lib/schemas/admin";
import { listUsers } from "@/lib/services/adminService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Search and page the player list — Architecture §5.10.7. */
export const GET = withHandler(async (request) => {
  const query = parseQuery(request, adminUsersQuerySchema);
  await requireAdmin(request);
  const page = await listUsers(query);

  return json(page);
});
