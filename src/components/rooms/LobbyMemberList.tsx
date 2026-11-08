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
        <h2 id="lobby-members-heading" className="text-lg font-bold tracking-tight">
          Players
        </h2>
        <p
          data-testid="lobby-member-count"
          className="font-mono text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase"
        >
          {members.length} / {roomSize}
        </p>
      </div>

      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-[1.25rem] border border-border bg-card">
        {members.map((member) => (
          <li
            key={member.userId}
            data-testid="lobby-member"
            className="flex min-w-0 items-center gap-3 px-4 py-3"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground font-mono text-xs font-bold text-background"
            >
              {member.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{member.username}</span>
            {member.isCreator ? (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em] uppercase">
                Host
              </span>
            ) : null}
            {member.userId === meId ? (
              <span
                className={cn(
                  "rounded-full border-2 border-primary/40 px-2 py-0.5",
                  "font-mono text-[9px] font-bold tracking-[0.14em] uppercase",
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
