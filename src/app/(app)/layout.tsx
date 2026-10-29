import type { ReactNode } from "react";

/** Shared shell for signed-in application pages. */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {children}
    </main>
  );
}
