import { NextResponse } from "next/server";

import { withHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clear the session cookie — Architecture §5.5.3, §5.10.2.
 */
export const POST = withHandler(async (request) => {
  await requireUser(request);

  const response = new NextResponse(null, { status: 204 });
  return clearSessionCookie(response);
});
