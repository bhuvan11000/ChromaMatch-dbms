import { json, withHandler } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness check — Architecture §5.13.5. */
export const GET = withHandler(async () => json({ status: "ok" }));
