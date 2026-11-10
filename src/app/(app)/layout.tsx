import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";

/** Shared cabinet shell for signed-in application pages and public boards. */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AppHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-3.5 pt-5 pb-28 sm:px-6 sm:pt-8 md:pb-12"
      >
        {children}
      </main>
      <footer className="hidden border-t-2 border-border bg-card/40 md:block">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-4">
          <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
            ChromaMatch · colour memory arcade
          </p>
          <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            3 rounds · 5 seconds · score /30
          </p>
        </div>
      </footer>
    </div>
  );
}
