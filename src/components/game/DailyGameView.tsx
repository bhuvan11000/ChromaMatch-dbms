"use client";

import { GameView, type GameViewProps } from "./GameView";

export type DailyGameViewProps = Omit<GameViewProps, "mode">;

/** Daily game screen: the shared `GameView` with Daily copy and result. */
export function DailyGameView(props: DailyGameViewProps) {
  return <GameView mode="daily" {...props} />;
}
