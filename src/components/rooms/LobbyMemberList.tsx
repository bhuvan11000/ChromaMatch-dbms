import { cn } from "@/lib/cn";
import type { RoomMember } from "@/lib/schemas/rooms";

export interface LobbyMemberListProps {
  members: readonly RoomMember[];
  roomSize: number;
  /** The viewer, marked with a text "You" tag. */
  meId: number;
  className?: string;
}

/** Everyone currently in the lobby. Host and "You" are text tags, never colour alone. */
export function LobbyMemberList({ members, roomSize, meId, className }: LobbyMemberListProps) {
  return (
    <section aria-labelledby="lobby-members-heading" className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="lobby-members-heading"
          className="font-display text-lg font-extrabold tracking-tight"
        >
          Players
        </h2>
        <p
          data-testid="lobby-member-count"
          className="rounded-[0.25rem] border-2 border-border bg-card px-2 py-1 font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
        >
          {members.length} / {roomSize}
        </p>
      </div>

      <ul className="mt-3 divide-y-2 divide-border overflow-hidden rounded-[0.9rem] border-2 border-border bg-card shadow-[0_4px_0_var(--border-lip)]">
        {members.map((member, index) => (
          <li
            key={member.userId}
            data-testid="lobby-member"
            className="flex min-w-0 items-center gap-3 px-3.5 py-3"
          >
            <span className="w-6 shrink-0 font-mono text-[9px] font-bold text-muted-foreground/70">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-[0.45rem] border-2 border-border bg-foreground font-display text-sm font-extrabold text-background"
            >
              {member.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{member.username}</span>
            {member.isCreator ? (
              <span className="rounded-[0.2rem] border border-border bg-muted px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] uppercase">
                Host
              </span>
            ) : null}
            {member.userId === meId ? (
              <span
                className={cn(
                  "rounded-[0.2rem] border-2 border-primary/45 bg-primary/10 px-1.5 py-0.5",
                  "font-mono text-[8px] font-bold tracking-[0.12em] text-primary-ink uppercase",
                )}
              >
                You
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
