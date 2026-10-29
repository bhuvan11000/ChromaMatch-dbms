"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button, Card, ErrorMessage, Spinner, useToast } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { ApiError, apiClient } from "@/lib/api-client";

interface ModeCard {
  name: string;
  description: string;
  detail: string;
  accent: string;
}

const MODES: ModeCard[] = [
  {
    name: "Global",
    description: "Three fresh colours every game. Your best score goes on the global board.",
    detail: "Random colours · Personal best",
    accent: "from-violet-500 via-fuchsia-500 to-pink-500",
  },
  {
    name: "Daily",
    description: "One shared challenge per UTC day. Build a streak and compare with everyone.",
    detail: "Same colours for everyone · Resets at 00:00 UTC",
    accent: "from-amber-400 via-orange-500 to-rose-500",
  },
  {
    name: "Custom Room",
    description: "Create a private room, share the code, and play at your own pace.",
    detail: "2–10 players · 3 or 5 attempts",
    accent: "from-emerald-400 via-teal-500 to-cyan-500",
  },
  {
    name: "Leaderboards",
    description: "See the sharpest eyes in Global and Daily play, ranked with stable ties.",
    detail: "Global and Daily boards",
    accent: "from-sky-400 via-blue-500 to-indigo-500",
  },
  {
    name: "Profile",
    description: "Track your scores, streaks, channel accuracy, and unlocked achievements.",
    detail: "Stats · Streak · Achievements",
    accent: "from-stone-400 via-neutral-500 to-zinc-500",
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

  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401) {
      router.replace("/login");
    }
  }, [router, session.error]);

  if (session.isPending) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <Spinner size="lg" label="Loading your account" />
        <p className="text-sm text-muted-foreground">Loading your account…</p>
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
            className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
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
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="size-10 shrink-0 rounded-xl bg-linear-to-br from-primary via-fuchsia-500 to-amber-400 shadow-sm"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">ChromaMatch</p>
            <p className="truncate text-xs text-muted-foreground">Signed in as {user.username}</p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => logoutMutation.mutate()}
          loading={logoutMutation.isPending}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? "Logging out…" : "Log out"}
        </Button>
      </header>

      <section aria-labelledby="modes-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
              Mode select
            </p>
            <h1
              id="modes-heading"
              className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Choose your next match
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Gameplay arrives in the next step. Your account, session, and the API foundation are
              ready.
            </p>
          </div>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            5 modes
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((mode) => (
            <Card key={mode.name} className="flex min-w-0 flex-col p-5">
              <div
                aria-hidden="true"
                className={`h-1.5 w-12 rounded-full bg-linear-to-r ${mode.accent}`}
              />
              <div className="mt-4 flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{mode.name}</h2>
                <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Soon
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{mode.description}</p>
              <p className="mt-auto pt-4 text-xs font-medium text-muted-foreground">
                {mode.detail}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        ChromaMatch · PostgreSQL + MongoDB · Server-authoritative scoring
      </p>
    </div>
  );
}
