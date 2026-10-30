"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  Button,
  Card,
  ErrorMessage,
  ModeGlyph,
  Spinner,
  Wordmark,
  modeTag,
  useToast,
  type ModeGlyphKind,
} from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { ApiError, apiClient } from "@/lib/api-client";

interface ModeCard {
  name: string;
  description: string;
  detail: string;
  kind: ModeGlyphKind;
}

const MODES: ModeCard[] = [
  {
    kind: "global",
    name: "Global",
    description: "Three fresh random swatches every run. Chase an all-time personal best.",
    detail: "Random colours · Personal best",
  },
  {
    kind: "daily",
    name: "Daily",
    description: "One date-seeded palette for the whole world. Protect your streak.",
    detail: "Same colours for everyone · Resets 00:00 UTC",
  },
  {
    kind: "room",
    name: "Custom Room",
    description: "Spin up a private studio code, set a round timer, and compare eyes.",
    detail: "2–10 players · 3 or 5 attempts",
  },
  {
    kind: "boards",
    name: "Leaderboards",
    description: "See the sharpest eyes on the global and daily boards, ranked with stable ties.",
    detail: "Global and Daily boards",
  },
  {
    kind: "profile",
    name: "Profile",
    description: "Inspect your channel drift, 30-day trend, and unlocked achievements.",
    detail: "Stats · Streak · Achievements",
  },
];

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const session = useSession();

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.post<void>("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
    onError: (error) => {
      toast({
        title: "Could not log out",
        description:
          error instanceof ApiError ? error.message : "Please check your connection and try again.",
        variant: "error",
      });
    },
  });
  const logout = logoutMutation.mutate;

  useEffect(() => {
    // After a successful logout the cleared cache refetches /api/me, which
    // returns 401. Do not treat that expected 401 as a deleted account.
    if (logoutMutation.isSuccess) return;

    if (session.error instanceof ApiError && session.error.status === 401) {
      // A validly signed cookie can outlive a deleted account. Clearing it
      // through the logout route prevents a /home ↔ /login redirect loop.
      logout();
    }
  }, [logout, logoutMutation.isSuccess, session.error]);

  if (session.isPending) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <Spinner size="lg" label="Loading your account" />
        <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          Waking the console…
        </p>
      </div>
    );
  }

  if (session.isError || !session.user) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorMessage
          title="Could not load your account"
          message={
            session.error instanceof ApiError
              ? session.error.message
              : "Your session could not be loaded. Please try again."
          }
          onRetry={() => {
            void session.refetch();
          }}
        />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <a
            href="/login"
            className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Back to sign in
          </a>
        </p>
      </div>
    );
  }

  const user = session.user;

  return (
    <div>
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark size="md" />

        <div className="flex items-center gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
            <span className="shrink-0 font-bold tracking-[0.14em] uppercase">Operator</span>
            <span aria-hidden="true" className="text-border">
              /
            </span>
            <span className="truncate text-foreground">{user.username}</span>
          </span>

          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => logout()}
            loading={logoutMutation.isPending}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? "Leaving…" : "Log out"}
          </Button>
        </div>
      </header>

      <section aria-labelledby="modes-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.24em] text-muted-foreground uppercase">
              Mode select · Studio bay
            </p>
            <h1
              id="modes-heading"
              className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
            >
              Pick your next calibration
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground text-pretty">
              Three swatches. Five seconds each. One honest score. The game screens are warming up
              in the next build.
            </p>
          </div>
          <span className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            5 stations
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((mode) => (
            <Card key={mode.name} className="flex min-w-0 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <ModeGlyph kind={mode.kind} />
                <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Soon
                </span>
              </div>
              <div className="mt-4">
                <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  {modeTag(mode.kind)}
                </p>
                <h2 className="mt-1 text-lg font-bold tracking-tight">{mode.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{mode.description}</p>
              </div>
              <div className="mt-auto">
                <p className="mt-5 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
                  {mode.detail}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-10 border-t border-border pt-6 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        PostgreSQL + MongoDB · Server-authoritative scoring · Darkroom Arcade v1.0
      </p>
    </div>
  );
}
