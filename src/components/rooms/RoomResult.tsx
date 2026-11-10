"use client";

import { GameResult } from "@/components/game";
import { Button, Card } from "@/components/ui";
import type { GameSubmitResponse } from "@/lib/schemas/game";

export interface RoomResultProps {
  result: GameSubmitResponse;
  roomCode: string;
  /** Starts another attempt in this room. */
  onNextAttempt: () => void;
  /** Leaves the attempt screen and returns to the room page. */
  onBackToRoom: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-lg font-bold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Room attempt result. Reuses the shared `GameResult` layout (score header,
 * split target/guess wells, channel bars) and only supplies room copy, a room
 * summary and room actions. Rooms have no PB or achievement notices.
 */
export function RoomResult({ result, roomCode, onNextAttempt, onBackToRoom }: RoomResultProps) {
  const room = result.room;

  const hasNext = room !== null && room.attemptsRemaining > 0 && room.roomStatus === "in_progress";

  return (
    <GameResult
      result={result}
      onPlayAgain={onNextAttempt}
      header={{
        kicker: room ? `Room ${roomCode} · Attempt ${room.attemptNumber}` : `Room ${roomCode}`,
        title: "Attempt logged.",
      }}
      summary={
        room ? (
          <Card data-testid="room-result-summary" className="space-y-3 p-4 sm:p-5">
            <dl className="grid grid-cols-3 gap-3">
              <Stat label="Attempt" value={String(room.attemptNumber)} />
              <Stat label="Room best" value={`${room.bestScore.toFixed(1)} / 30`} />
              <Stat label="Attempts left" value={String(room.attemptsRemaining)} />
            </dl>
            {room.isNewBest ? (
              <p className="text-sm font-semibold">New best score in this room.</p>
            ) : null}
            {room.roomStatus === "finished" ? (
              <p className="text-sm text-muted-foreground">
                The room is over. Check the final standings.
              </p>
            ) : room.memberStatus === "finished" ? (
              <p className="text-sm text-muted-foreground">
                You used every attempt. Waiting for the others.
              </p>
            ) : null}
          </Card>
        ) : null
      }
      actions={
        <div className="grid gap-2">
          {hasNext ? (
            <Button size="lg" className="w-full" onClick={onNextAttempt}>
              Next attempt
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={onBackToRoom}>
              Back to room
            </Button>
          )}
        </div>
      }
    />
  );
}
