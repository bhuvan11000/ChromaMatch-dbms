import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";

/** Shared cabinet shell for signed-in application pages and public boards. */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AppHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl flex-1 px-3.5 pt-5 pb-28 sm:px-6 sm:pt-8 lg:pb-12"
      >
        {children}
      </main>
    </div>
  );
}
