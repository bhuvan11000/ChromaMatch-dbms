"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { ErrorMessage, Spinner } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { ApiError } from "@/lib/api-client";

/**
 * Client-side admin page gate — Architecture §5.11.1.
 *
 * The middleware only verifies the cookie signature. The page additionally
 * waits for `GET /api/me` and sends non-admins home; the API guard remains the
 * real authorization boundary.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const unauthenticated = session.error instanceof ApiError && session.error.status === 401;
  const isPlayer = session.user !== null && session.user.role !== "admin";

  useEffect(() => {
    if (unauthenticated) {
      router.replace("/login");
      return;
    }

    if (isPlayer) {
      router.replace("/home");
    }
  }, [isPlayer, router, unauthenticated]);

  if (session.isPending || unauthenticated || isPlayer) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <Spinner size="lg" label="Checking admin access" />
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {isPlayer ? "Redirecting…" : "Checking credentials…"}
        </p>
      </div>
    );
  }

  if (session.isError || !session.user) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorMessage
          title="Couldn't load your account"
          message={
            session.error instanceof ApiError
              ? session.error.message
              : "Your session could not be loaded. Try again."
          }
          onRetry={() => {
            void session.refetch();
          }}
        />
      </div>
    );
  }

  if (session.user.role !== "admin") {
    return <Spinner size="lg" label="Redirecting" />;
  }

  return <>{children}</>;
}
