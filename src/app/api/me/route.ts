import { json, withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getMe } from "@/lib/services/authService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Current account, re-read from PostgreSQL — Architecture §5.5.3, §5.10.2.
 */
export const GET = withHandler(async (request) => {
  const session = await requireUser(request);
  const user = await getMe(session.userId);
  return json({ user });
});
