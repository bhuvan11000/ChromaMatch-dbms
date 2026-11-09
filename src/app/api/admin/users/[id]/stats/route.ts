import { ZodError } from "zod";

import { json, parseBody, withHandler } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import {
  adminStatsPatchSchema,
  adminUserIdSchema,
  type AdminStatsPatch,
} from "@/lib/schemas/admin";
import { updateUserStats } from "@/lib/services/adminService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUserRouteContext = { params: Promise<{ id: string }> };

/** Edit the allow-listed player stats — Architecture §5.7.7, §5.10.7. */
export const PATCH = withHandler<AdminUserRouteContext>(async (request, context) => {
  let body: AdminStatsPatch;

  try {
    body = await parseBody(request, adminStatsPatchSchema);
  } catch (error) {
    // Unknown keys are a disallowed patch, not a generic body-shape failure.
    if (
      error instanceof ZodError &&
      error.issues.some((issue) => issue.code === "unrecognized_keys")
    ) {
      throw new AppError("INVALID_PATCH");
    }
    throw error;
  }

  const { id } = await context.params;
  const userId = adminUserIdSchema.parse(id);
  const session = await requireAdmin(request);
  const result = await updateUserStats(session.userId, userId, body);

  return json(result);
});
