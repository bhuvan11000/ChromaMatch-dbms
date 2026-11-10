"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";

const STORAGE_KEY = "cm_theme";
const listeners = new Set<() => void>();

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const attribute = document.documentElement.getAttribute("data-theme");
  if (attribute === "light" || attribute === "dark") return attribute;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener("change", callback);

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) callback();
  }
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(callback);
    media?.removeEventListener("change", callback);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot(): Theme {
  return currentTheme();
}

function getServerSnapshot(): Theme | null {
  return null;
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4.5">
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4.5">
      <path
        d="M20 14.1A8.1 8.1 0 0 1 9.9 4a8.1 8.1 0 1 0 10.1 10.1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HalfIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4.5">
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 4v16a8 8 0 0 0 0-16Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Theme override for the current device. The system scheme is the default;
 * once used, the choice is stored as `cm_theme` and applied by the pre-paint
 * script in the root layout. This is a display preference only.
 *
 * `useSyncExternalStore` keeps the icon/label in sync with the actual
 * `<html data-theme>` value and the OS media query without setState-in-effect.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleTheme() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can block storage; the current page still switches.
    }
    for (const listener of listeners) listener();
  }

  const label =
    theme === null
      ? "Switch colour theme"
      : theme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-[0.7rem] border-2 border-border bg-card text-muted-foreground shadow-[0_2px_0_var(--border-lip)] transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className,
      )}
    >
      {theme === "dark" ? <SunIcon /> : theme === "light" ? <MoonIcon /> : <HalfIcon />}
    </button>
  );
}
