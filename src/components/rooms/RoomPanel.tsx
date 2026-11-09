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
    <div className="space-y-5">
      <Card elevated className="relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden="true" className="cm-spectrum-bar absolute inset-x-0 top-0 h-1.5" />
        <div className="flex flex-wrap items-end justify-between gap-4 pt-1">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              Room · {STATUS_LABEL[state.status]}
            </p>
            <h1
              data-testid="room-code"
              className="mt-1 font-mono text-3xl font-bold tracking-[0.18em] sm:text-4xl"
            >
              {state.code}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCopyLink}>
              Copy invite link
            </Button>
            <span role="status" aria-live="polite" className="min-w-14 text-xs font-semibold">
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
      </Card>

      {actionError ? (
        <p role="alert" className="text-sm font-medium text-danger">
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
                  <p className="text-xs text-muted-foreground">
                    Waiting for at least {ROOM_MIN_SIZE} players.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for the host to start.</p>
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
          <Card data-testid="room-me" className="space-y-3 p-4 sm:p-5">
            <h2 className="text-lg font-bold tracking-tight">Your attempts</h2>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  Used
                </dt>
                <dd className="font-display text-lg font-bold tabular-nums">
                  {me.attemptsUsed} / {state.attemptsLimit}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  Remaining
                </dt>
                <dd className="font-display text-lg font-bold tabular-nums">
                  {me.attemptsRemaining}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                  Best
                </dt>
                <dd className="font-display text-lg font-bold tabular-nums">
                  {me.bestScore === null ? "No score" : `${me.bestScore.toFixed(1)} / 30`}
                </dd>
              </div>
            </dl>

            {me.status === "left" ? (
              <p role="status" className="text-sm font-semibold">
                You left this room. You forfeited your remaining attempts and cannot rejoin; your
                best score stays on the board.
              </p>
            ) : null}
            {me.status === "finished" ? (
              <p role="status" className="text-sm text-muted-foreground">
                You used every attempt. Waiting for the others to finish.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
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
              <h2 className="text-lg font-bold tracking-tight">Standings</h2>
              <p className="mt-1 text-sm text-muted-foreground">Live standings are hidden.</p>
              <p className="mt-2 text-sm">
                Your best:{" "}
                <span className="font-display font-bold tabular-nums">
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
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Back to rooms
            </Link>
          }
        />
      ) : null}
    </div>
  );
}
