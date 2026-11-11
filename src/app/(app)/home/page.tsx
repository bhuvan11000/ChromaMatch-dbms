"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DailyCard } from "@/components/home/DailyCard";
import { BoardsCard, GlobalCabinet, ProfileCard, RoomsCard } from "@/components/home/HomePanels";
import { ErrorMessage, Spinner, TestStrip, TextLoop } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { ApiError, apiClient } from "@/lib/api-client";

const SPECS = ["3 rounds", "5.0s flash", "Score /30"] as const;

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
        className="grid gap-6 lg:grid-cols-12 lg:items-stretch"
      >
        <div className="cm-rise flex flex-col justify-between lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="cm-eyebrow text-muted-foreground">Colour memory</span>
              <span aria-hidden="true" className="size-1 rounded-full bg-muted-foreground" />
              <span className="cm-eyebrow text-primary-ink">Cabinet online</span>
            </div>

            <h1
              id="home-heading"
              className="mt-4 max-w-xl font-display text-5xl leading-[0.92] font-extrabold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[4.8rem]"
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

            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Three colours. Five seconds. One honest guess.
            </p>

            <ul aria-label="Game rules" className="mt-6 flex flex-wrap gap-2">
              {SPECS.map((item) => (
                <li
                  key={item}
                  className="rounded-[0.5rem] border-2 border-border bg-card px-3 py-1.5 font-mono text-[9px] font-bold tracking-[0.14em] text-foreground uppercase shadow-[0_2px_0_var(--border-lip)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 max-w-md sm:mt-10">
            <div className="-rotate-1">
              <TestStrip size="lg" mystery />
            </div>
            <p className="mt-3 font-mono text-[9px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              Today&rsquo;s strip
            </p>
          </div>
        </div>

        <div className="lg:col-span-5">
          <GlobalCabinet />
        </div>
      </section>

      <section
        aria-label="Modes and boards"
        className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-12"
      >
        <div className="lg:col-span-7">
          <DailyCard />
        </div>
        <RoomsCard className="lg:col-span-5" />
        <BoardsCard className="lg:col-span-5" />
        <ProfileCard className="lg:col-span-7" />
      </section>

      <div className="mt-10">
        <TextLoop
          text="Trust your eye"
          separator="✦"
          speed={70}
          curviness={48}
          fontSize={36}
          className="text-primary-ink"
        />
      </div>
    </div>
  );
}
