"use client";

import { GameView, type GameViewProps } from "./GameView";

export type GlobalGameViewProps = Omit<GameViewProps, "mode">;

/**
 * Global game screen. The shared implementation lives in `GameView`; this thin
 * wrapper keeps the original export so existing imports and tests are
 * unchanged.
 */
export function GlobalGameView(props: GlobalGameViewProps) {
  return <GameView mode="global" {...props} />;
}
