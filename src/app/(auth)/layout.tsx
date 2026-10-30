import type { ReactNode } from "react";

/** Shared shell for the public auth screens. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main
      id="main-content"
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-3.5 py-8 sm:px-6 sm:py-12"
    >
      <div aria-hidden="true" className="cm-darkroom-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative w-full max-w-md">{children}</div>
    </main>
  );
}
