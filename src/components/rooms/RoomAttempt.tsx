"use client";

import { useEffect } from "react";

import { GameView } from "@/components/game";
import { useGameMachine } from "@/hooks/useGameMachine";

import { RoomResult } from "./RoomResult";

export interface RoomAttemptProps {
  roomCode: string;
  /** Called when the player leaves the attempt screen (the page refetches the room). */
  onExit: () => void;
}

/**
 * One in-page room attempt: the shared game view driven by
 * `useGameMachine({ mode: "room", roomCode })`. It auto-starts on mount because
 * the player already pressed "Play attempt". Guesses live in React state only.
 */
export function RoomAttempt({ roomCode, onExit }: RoomAttemptProps) {
  const machine = useGameMachine({ mode: "room", roomCode });
  const { start } = machine;

  useEffect(() => {
    start();
  }, [start]);

  return (
    <GameView
      mode="room"
      roomCode={roomCode}
      backHref={`/rooms/${roomCode}`}
      backLabel="← Room"
      renderResult={(result) => (
        <RoomResult
          result={result}
          roomCode={roomCode}
          onNextAttempt={machine.playAgain}
          onBackToRoom={onExit}
        />
      )}
      {...machine}
    />
  );
}
