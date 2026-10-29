import { redirect } from "next/navigation";

/**
 * Landing route — Architecture §5.1 (`page.tsx` landing / redirect).
 *
 * `/home` is gated by middleware, so an unauthenticated visitor is sent on to
 * `/login` from there.
 */
export default function LandingPage() {
  redirect("/home");
}
