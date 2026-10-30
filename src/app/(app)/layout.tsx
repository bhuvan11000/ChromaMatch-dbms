import type { ReactNode } from "react";

/** Shared shell for signed-in application pages. */
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl px-3.5 py-6 sm:px-6 sm:py-10">
      {children}
    </main>
  );
}
