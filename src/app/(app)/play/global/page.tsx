"use client";

import { GlobalGameView } from "@/components/game";
import { useGameMachine } from "@/hooks/useGameMachine";

export default function GlobalPlayPage() {
  const machine = useGameMachine();

  return <GlobalGameView {...machine} />;
}
