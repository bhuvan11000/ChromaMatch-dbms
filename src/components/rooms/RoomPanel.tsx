"use client";

import Link from "next/link";

import { Button, Card, EmptyState } from "@/components/ui";
import type { RoomState } from "@/lib/schemas/rooms";
import { ROOM_MIN_SIZE } from "@/lib/config/constants";

import { LobbyMemberList } from "./LobbyMemberList";
import { RoomScoreboard } from "./RoomScoreboard";
import { RoomSettingsSummary } from "./RoomSettingsSummary";

export interface RoomPanelProps {
  state: RoomState;
  onStart: () => void;
  onLeave: () => void;
  onPlay: () => void;
  onCopyLink: () => void;
  copied: boolean;
  starting?: boolean;
  /** Inline message for a failed start/leave. */
  actionError?: string | null;
}

const STATUS_LABEL: Record<RoomState["status"], string> = {
  lobby: "Lobby",
  in_progress: "In progress",
  finished: "Finished",
  cancelled: "Cancelled",
};

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
      <rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M13 7V5.8A1.8 1.8 0 0 0 11.2 4H5.8A1.8 1.8 0 0 0 4 5.8v5.4A1.8 1.8 0 0 0 5.8 13H7"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[8px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-display text-2xl leading-none font-extrabold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * Presentational body of `/rooms/[code]`, driven entirely by `room.status`.
 * Start is only rendered for the creator; Play only for an active member with
 * attempts left. Everything here is derived from the server's RoomState.
 */
export function RoomPanel({
  state,
  onStart,
  onLeave,
  onPlay,
  onCopyLink,
  copied,
  starting = false,
  actionError = null,
}: RoomPanelProps) {
  const { me } = state;
  const canStart = state.members.length >= ROOM_MIN_SIZE;
  const canPlay =
    state.status === "in_progress" && me.status === "active" && me.attemptsRemaining > 0;
  const canLeave =
    (state.status === "lobby" && me.status === "active") ||
    (state.status === "in_progress" && me.status === "active");

  return (
    <div className="space-y-4">
      <section className="cm-cabinet overflow-hidden p-0">
        <div className="cm-marquee flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2.5">
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-white/60 uppercase">
            Room link // {STATUS_LABEL[state.status]}
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[8px] font-bold tracking-[0.16em] text-white/45 uppercase">
            <span
              aria-hidden="true"
              className={
                state.status === "lobby" || state.status === "in_progress"
                  ? "size-1.5 rounded-full bg-[#16d39a]"
                  : "size-1.5 rounded-full bg-white/35"
              }
            />
            {STATUS_LABEL[state.status]}
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="cm-eyebrow text-muted-foreground">Room code</p>
              <h1
                data-testid="room-code"
                className="cm-led-well mt-2 inline-block rounded-[0.6rem] px-3.5 py-2 font-mono text-3xl font-bold tracking-[0.16em] sm:text-4xl"
              >
                {state.code}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onCopyLink}>
                <CopyIcon />
                Copy invite link
              </Button>
              <span
                role="status"
                aria-live="polite"
                className="min-w-14 font-mono text-[9px] font-bold tracking-[0.12em] text-success uppercase"
              >
                {copied ? "Copied!" : ""}
              </span>
            </div>
          </div>

          <RoomSettingsSummary
            className="mt-5"
            roomSize={state.roomSize}
            timerSeconds={state.timerSeconds}
            attemptsLimit={state.attemptsLimit}
          />
        </div>
      </section>

      {actionError ? (
        <p
          role="alert"
          className="rounded-[0.55rem] border-2 border-danger/50 bg-danger-soft px-3 py-2 font-mono text-[11px] font-semibold text-danger"
        >
          {actionError}
        </p>
      ) : null}

      {state.status === "lobby" ? (
        <>
          <LobbyMemberList members={state.members} roomSize={state.roomSize} meId={me.userId} />

          <div className="flex flex-wrap items-center gap-3">
            {me.isCreator ? (
              <>
                <Button size="lg" onClick={onStart} disabled={!canStart} loading={starting}>
                  Start room
                </Button>
                {!canStart ? (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Waiting for at least {ROOM_MIN_SIZE} players.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                Waiting for the host to start.
              </p>
            )}
            {canLeave ? (
              <Button variant="outline" size="lg" onClick={onLeave}>
                Leave room
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {state.status === "in_progress" ? (
        <>
          <Card data-testid="room-me" className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="cm-eyebrow text-muted-foreground">Your run</p>
                <h2 className="mt-0.5 font-display text-xl font-extrabold tracking-tight">
                  Attempts
                </h2>
              </div>
              <span className="rounded-[0.25rem] border-2 border-border bg-muted px-2 py-1 font-mono text-[8px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                {state.attemptsLimit} total
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-y-2 border-border py-3">
              <Stat label="Used" value={`${me.attemptsUsed} / ${state.attemptsLimit}`} />
              <Stat label="Remaining" value={String(me.attemptsRemaining)} />
              <Stat
                label="Best"
                value={me.bestScore === null ? "No score" : `${me.bestScore.toFixed(1)} / 30`}
              />
            </dl>

            {me.status === "left" ? (
              <p role="status" className="mt-3 text-sm font-semibold">
                You left this room. You forfeited your remaining attempts and cannot rejoin; your
                best score stays on the board.
              </p>
            ) : null}
            {me.status === "finished" ? (
              <p role="status" className="mt-3 font-mono text-[10px] text-muted-foreground">
                You used every attempt. Waiting for the others to finish.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              {canPlay ? (
                <Button size="lg" onClick={onPlay}>
                  Play attempt
                </Button>
              ) : null}
              {canLeave ? (
                <Button variant="outline" size="lg" onClick={onLeave}>
                  Leave room
                </Button>
              ) : null}
            </div>
          </Card>

          {state.standings === null ? (
            <Card data-testid="standings-hidden" className="p-4 sm:p-5">
              <h2 className="font-display text-lg font-extrabold tracking-tight">Standings</h2>
              <p className="mt-1 text-sm text-muted-foreground">Live standings are hidden.</p>
              <p className="mt-2 text-sm">
                Your best:{" "}
                <span className="font-display font-extrabold tabular-nums">
                  {me.bestScore === null ? "No score yet" : `${me.bestScore.toFixed(1)} / 30`}
                </span>
              </p>
            </Card>
          ) : (
            <RoomScoreboard standings={state.standings} meId={me.userId} title="Live standings" />
          )}
        </>
      ) : null}

      {state.status === "finished" ? (
        <>
          <Card className="p-4 sm:p-5">
            <p className="text-sm font-semibold">The room is over. Here are the final standings.</p>
          </Card>
          {state.standings ? (
            <RoomScoreboard standings={state.standings} meId={me.userId} title="Final standings" />
          ) : null}
        </>
      ) : null}

      {state.status === "cancelled" ? (
        <EmptyState
          title="This room was cancelled"
          description="The host left before the game started."
          action={
            <Link
              href="/rooms"
              className="font-semibold text-primary-ink underline-offset-4 hover:underline"
            >
              Back to rooms
            </Link>
          }
        />
      ) : null}
    </div>
  );
}
