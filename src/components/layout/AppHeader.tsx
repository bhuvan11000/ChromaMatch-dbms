"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNavLink } from "@/components/admin/AdminNavLink";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Wordmark } from "@/components/ui/Wordmark";
import { useSession } from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface NavItem {
  label: string;
  shortLabel: string;
  href: string;
  /** Prefixes that keep this tab lit. */
  match: readonly string[];
  icon: ReactNode;
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  className: "size-[18px]",
  "aria-hidden": true,
} as const;

export const APP_NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Play",
    shortLabel: "Play",
    href: "/home",
    match: ["/home", "/play"],
    icon: (
      <svg {...iconProps}>
        <rect
          x="3.2"
          y="4.2"
          width="17.6"
          height="15.6"
          rx="3.4"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M10 8.8 16 12l-6 3.2V8.8Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Boards",
    shortLabel: "Boards",
    href: "/leaderboard/global",
    match: ["/leaderboard"],
    icon: (
      <svg {...iconProps}>
        <path
          d="M8 4.5h8v4.2a4 4 0 0 1-8 0V4.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8 5.8H5.4v1.6a3.1 3.1 0 0 0 3.1 3.1M16 5.8h2.6v1.6a3.1 3.1 0 0 1-3.1 3.1M12 12.7v3M8.6 19.5h6.8M10 15.7h4l.7 3.8H9.3l.7-3.8Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Rooms",
    shortLabel: "Rooms",
    href: "/rooms",
    match: ["/rooms"],
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="7" width="18" height="10" rx="3.4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M7.4 10.5v3M5.9 12h3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="15.4" cy="11" r="1.1" fill="currentColor" />
        <circle cx="18" cy="13.2" r="1.1" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Profile",
    shortLabel: "You",
    href: "/profile",
    match: ["/profile"],
    icon: (
      <svg {...iconProps}>
        <rect
          x="4.2"
          y="3.6"
          width="15.6"
          height="16.8"
          rx="3.2"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="9.2" r="2.4" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M8.1 16.4a4.2 4.2 0 0 1 7.8 0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const AVATAR_TONES = [
  "bg-accent-cyan text-background",
  "bg-accent-gold text-background",
  "bg-accent-violet text-background",
  "bg-success text-background",
] as const;

function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path
        d="M14.5 5.5H6.8A1.8 1.8 0 0 0 5 7.3v9.4a1.8 1.8 0 0 0 1.8 1.8h7.7M13.5 12h6M16.8 8.7 20.1 12l-3.3 3.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Cabinet chrome for every signed-in (and public board) screen.
 *
 * Desktop gets a marquee-style top rail; mobile gets a thumb-sized bottom
 * dock. Both are the same four destinations, so the map never changes shape.
 */
export function AppHeader() {
  const pathname = usePathname() ?? "";
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const logout = useMutation({
    mutationFn: () => apiClient.post<void>("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });

  const user = session.user;
  const initial = user?.username.slice(0, 1).toUpperCase() ?? "";
  const avatarTone = user
    ? AVATAR_TONES[user.username.charCodeAt(0) % AVATAR_TONES.length]
    : AVATAR_TONES[0];

  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 border-border bg-background/92 backdrop-blur-md">
        <div aria-hidden="true" className="cm-spectrum-bar h-1 w-full" />
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href="/home"
            aria-label="ChromaMatch home"
            className="shrink-0 rounded-[0.7rem] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <Wordmark size="sm" />
          </Link>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1.5 md:flex">
            {APP_NAV_ITEMS.map((item) => {
              const active = isActive(item, pathname);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-[0.7rem] border-2 px-3 py-2 font-display text-sm font-bold tracking-tight transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                    active
                      ? "border-border bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-lip)]"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={active ? "text-primary-foreground" : "text-primary-ink"}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <AdminNavLink role={user?.role} />

            {user ? (
              <span className="flex min-w-0 items-center gap-2 rounded-[0.8rem] border-2 border-border bg-card py-1 pr-3 pl-1 shadow-[0_2px_0_var(--border-lip)]">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-[0.55rem] border border-border/30 font-display text-sm font-extrabold",
                    avatarTone,
                  )}
                >
                  {initial}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block font-mono text-[8px] leading-none font-bold tracking-[0.18em] text-muted-foreground uppercase">
                    Player 1
                  </span>
                  <span className="mt-0.5 block max-w-[9rem] truncate text-xs font-bold text-foreground">
                    {user.username}
                  </span>
                </span>
              </span>
            ) : session.isPending ? (
              <span
                aria-hidden="true"
                className="h-10 w-28 animate-pulse rounded-[0.8rem] border-2 border-border bg-muted"
              />
            ) : (
              <Link
                href="/login"
                className="cm-keycap cm-keycap-primary inline-flex min-h-10 items-center rounded-[0.7rem] border-border bg-primary px-3.5 py-2 font-display text-sm font-bold text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                Sign in
              </Link>
            )}

            <ThemeToggle />

            {user ? (
              <button
                type="button"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                aria-label="Log out"
                title="Log out"
                className="grid size-10 shrink-0 place-items-center rounded-[0.7rem] border-2 border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogoutIcon />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-card/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div aria-hidden="true" className="cm-spectrum-bar h-0.5 w-full" />
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {APP_NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 font-mono text-[9px] font-bold tracking-[0.12em] uppercase transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
                    active ? "text-primary-ink" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-primary"
                    />
                  ) : null}
                  {item.icon}
                  {item.shortLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
