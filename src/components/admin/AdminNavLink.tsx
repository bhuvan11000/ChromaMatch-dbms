import Link from "next/link";

import type { UserRole } from "@/lib/schemas/auth";

export interface AdminNavLinkProps {
  role: UserRole | null | undefined;
}

/** Admin-only navigation entry; renders nothing for players (Architecture §5.11.1). */
export function AdminNavLink({ role }: AdminNavLinkProps) {
  if (role !== "admin") return null;

  return (
    <Link
      href="/admin"
      className="hidden min-h-10 items-center rounded-[0.7rem] border-2 border-border bg-card px-3 py-2 font-mono text-[9px] font-bold tracking-[0.14em] text-foreground uppercase shadow-[0_2px_0_var(--border-lip)] transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:inline-flex"
    >
      Admin
    </Link>
  );
}
