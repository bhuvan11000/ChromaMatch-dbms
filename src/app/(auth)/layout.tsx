import type { ReactNode } from "react";

/** Shared shell for the public auth screens. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6"
    >
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
