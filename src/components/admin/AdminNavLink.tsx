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
      className="inline-flex min-h-9 items-center rounded-[0.625rem] border border-border bg-card px-3 py-2 font-mono text-[10px] font-bold tracking-[0.12em] text-foreground uppercase transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      Admin
    </Link>
  );
}
