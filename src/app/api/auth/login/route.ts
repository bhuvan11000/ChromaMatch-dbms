import { authRateLimit, json, parseBody, withHandler } from "@/lib/api";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/schemas/auth";
import { login } from "@/lib/services/authService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticate and start a session — Architecture §5.5.2, §5.10.2.
 */
export const POST = withHandler(
  async (request) => {
    const body = await parseBody(request, loginSchema);
    const user = await login(body);

    const token = await signSession({ userId: user.id, role: user.role });
    return setSessionCookie(json({ user }), token);
  },
  { rateLimit: authRateLimit },
);
