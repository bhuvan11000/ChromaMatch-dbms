"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  Button,
  Card,
  ErrorMessage,
  ModeGlyph,
  Spinner,
  TestStrip,
  Wordmark,
  useToast,
  type ModeGlyphKind,
} from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { ApiError, apiClient } from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface ModeLink {
  label: string;
  href: string;
}

interface ModeCard {
  name: string;
  description: string;
  kind: ModeGlyphKind;
  href?: string;
  hrefs?: ModeLink[];
}

const MODES: ModeCard[] = [
  {
    kind: "global",
    name: "Global",
    description: "Random colours. All-time glory.",
    href: "/play/global",
  },
  {
    kind: "daily",
    name: "Daily",
    description: "Same palette for everyone, every day.",
  },
  {
    kind: "room",
    name: "Custom Room",
    description: "A private code and bragging rights.",
  },
  {
    kind: "boards",
    name: "Leaderboards",
    description: "Who's got the sharpest eye?",
    hrefs: [
      { label: "Global board", href: "/leaderboard/global" },
      { label: "Daily board", href: "/leaderboard/daily" },
    ],
  },
  {
    kind: "profile",
    name: "Profile",
    description: "Your colours, streaks and badges.",
  },
];

const AVATAR_TONES = [
  "bg-accent-cyan/15 text-accent-cyan",
  "bg-accent-gold/15 text-accent-gold",
  "bg-accent-violet/15 text-accent-violet",
  "bg-success/15 text-success",
] as const;

function SoonLock({ className }: { className?: string }) {
  return (
    <span
      title="Coming soon"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
        <rect
          x="4.8"
          y="8.6"
          width="10.4"
          height="6.8"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M7.3 8.6V6.7a2.7 2.7 0 0 1 5.4 0v1.9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="12" r="1" fill="currentColor" />
      </svg>
      Soon
    </span>
  );
}

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
        title: "Couldn't log out",
        description:
          error instanceof ApiError ? error.message : "Check your connection and try again.",
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
        <p className="text-sm text-muted-foreground">Warming up…</p>
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
  const initial = user.username.slice(0, 1).toUpperCase();
  const avatarTone = AVATAR_TONES[user.username.charCodeAt(0) % AVATAR_TONES.length];

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Wordmark size="md" />

        <div className="flex items-center gap-2">
          <span className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1">
            <span
              aria-hidden="true"
              className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-xs font-bold ${avatarTone}`}
            >
              {initial}
            </span>
            <span className="max-w-[8rem] truncate text-xs font-medium text-foreground">
              {user.username}
            </span>
          </span>

          <Button
            variant="ghost"
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

      <section aria-labelledby="modes-heading" className="mt-8">
        <div className="grid items-center gap-7 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h1
              id="modes-heading"
              className="text-4xl font-bold tracking-tight text-balance sm:text-5xl"
            >
              What are we{" "}
              <span className="relative inline-block whitespace-nowrap">
                mixing
                <span
                  aria-hidden="true"
                  className="cm-spectrum-bar absolute -bottom-1 left-0 h-1 w-full rounded-full"
                />
              </span>{" "}
              today?
            </h1>
            <p className="mt-3 max-w-sm text-base text-muted-foreground">
              Three colours. Five seconds. One honest guess.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["3 rounds", "5.0s flash", "HSV memory", "No guess timer"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-muted-foreground uppercase"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm sm:-rotate-1">
            <TestStrip size="lg" mystery />
          </div>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((mode) =>
            mode.kind === "profile" ? (
              <Card
                key={mode.name}
                className="flex min-w-0 items-center gap-4 p-5 sm:col-span-2 lg:col-span-2"
              >
                <ModeGlyph kind={mode.kind} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold tracking-tight">{mode.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{mode.description}</p>
                </div>
                <SoonLock />
              </Card>
            ) : mode.hrefs ? (
              <Card key={mode.name} className="flex min-w-0 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <ModeGlyph kind={mode.kind} />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] text-primary uppercase">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                    Live
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-bold tracking-tight">{mode.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{mode.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {mode.hrefs.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[0.625rem] border border-border bg-muted px-3 py-2 font-mono text-[10px] font-bold tracking-[0.12em] text-foreground uppercase transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                    >
                      {link.label}
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3">
                        <path
                          d="M4.5 10h10M10.5 6 14.5 10l-4 4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Link>
                  ))}
                </div>
              </Card>
            ) : mode.href ? (
              <Link
                key={mode.name}
                href={mode.href}
                className="group block min-w-0 rounded-[1.25rem] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                <Card
                  interactive
                  elevated
                  className="relative flex h-full min-w-0 flex-col overflow-hidden p-5 pt-6 ring-1 ring-primary/30"
                >
                  <div
                    aria-hidden="true"
                    className="cm-spectrum-bar absolute inset-x-0 top-0 h-1"
                  />
                  <div className="flex items-start justify-between gap-2">
                    <ModeGlyph kind={mode.kind} />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] text-primary uppercase">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                      Live
                    </span>
                  </div>
                  <h2 className="mt-4 text-lg font-bold tracking-tight">{mode.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{mode.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.16em] text-foreground uppercase">
                    Play now
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
                      <path
                        d="M4.5 10h10M10.5 6 14.5 10l-4 4"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </Card>
              </Link>
            ) : (
              <Card key={mode.name} className="flex min-w-0 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <ModeGlyph kind={mode.kind} />
                  <SoonLock />
                </div>
                <h2 className="mt-4 text-lg font-bold tracking-tight">{mode.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{mode.description}</p>
              </Card>
            ),
          )}
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        For people who argue about teal.
      </p>
    </div>
  );
}
