"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DailyCard } from "@/components/home/DailyCard";
import { BoardsCard, GlobalCabinet, ProfileCard, RoomsCard } from "@/components/home/HomePanels";
import { ErrorMessage, Spinner, TestStrip, TextLoop } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { ApiError, apiClient } from "@/lib/api-client";

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();

  // A validly signed cookie can outlive a deleted account. Clearing it through
  // the logout route prevents a /home ↔ /login redirect loop.
  const clearStaleSession = useMutation({
    mutationFn: () => apiClient.post<void>("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });

  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401) {
      clearStaleSession.mutate();
    }
  }, [clearStaleSession, session.error]);

  if (session.isPending) {
    return (
      <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-4">
        <Spinner size="lg" label="Loading your account" />
        <p className="cm-eyebrow text-muted-foreground">Warming up</p>
      </div>
    );
  }

  if (session.isError || !session.user) {
    return (
      <div className="mx-auto max-w-md pt-8">
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
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <a
            href="/login"
            className="rounded-sm font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            Back to sign in
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <section
        aria-labelledby="home-heading"
        className="cm-rise flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10"
      >
        <div className="min-w-0 lg:max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cm-eyebrow text-muted-foreground">Colour memory</span>
            <span aria-hidden="true" className="size-1 rounded-full bg-muted-foreground" />
            <span className="cm-eyebrow text-primary-ink">Cabinet online</span>
          </div>

          <h1
            id="home-heading"
            className="mt-4 max-w-xl font-display text-5xl leading-[0.92] font-extrabold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[4.5rem]"
          >
            What are we{" "}
            <span className="cm-shine-text relative inline-block whitespace-nowrap">
              mixing
              <span aria-hidden="true" className="cm-shine-layer">
                mixing
              </span>
              <span
                aria-hidden="true"
                className="cm-spectrum-bar absolute -bottom-1 left-0 h-2 w-full rounded-full"
              />
            </span>{" "}
            today?
          </h1>
        </div>

        <div className="w-full max-w-[19rem] shrink-0 lg:w-[19rem] lg:border-l-2 lg:border-dashed lg:border-border/60 lg:pl-10">
          <div className="-rotate-1">
            <TestStrip size="lg" mystery />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              Today&rsquo;s strip
            </p>
            <span aria-hidden="true" className="text-xs text-primary-ink">
              ✦
            </span>
          </div>
        </div>
      </section>

      <div className="mt-5 mb-1">
        <TextLoop
          text="Trust your eye"
          separator="✦"
          speed={64}
          curviness={44}
          fontSize={30}
          className="text-primary-ink"
        />
      </div>

      <section aria-label="Game modes" className="mt-1 grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-7">
          <GlobalCabinet />
        </div>
        <div className="lg:col-span-5">
          <DailyCard />
        </div>
      </section>

      <section
        aria-label="Rooms, boards and profile"
        className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-12"
      >
        <RoomsCard className="lg:col-span-4" />
        <BoardsCard className="lg:col-span-4" />
        <ProfileCard className="sm:col-span-2 lg:col-span-4" />
      </section>
    </div>
  );
}
