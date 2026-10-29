import { authRateLimit, json, parseBody, withHandler } from "@/lib/api";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { registerSchema } from "@/lib/schemas/auth";
import { register } from "@/lib/services/authService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Register a player and start a session — Architecture §5.5.1, §5.10.2.
 */
export const POST = withHandler(
  async (request) => {
    const body = await parseBody(request, registerSchema);
    const user = await register(body);

    const token = await signSession({ userId: user.id, role: user.role });
    return setSessionCookie(json({ user }, { status: 201 }), token);
  },
  { rateLimit: authRateLimit },
);
