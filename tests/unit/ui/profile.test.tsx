import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AchievementGrid, HistoryList, StatsCards } from "@/components/profile";
import type {
  AchievementItemResponse,
  HistoryItemResponse,
  MyStatsResponse,
} from "@/lib/schemas/stats";

const STATS: MyStatsResponse = {
  global: { bestScore: 24.6, achievedAt: "2026-10-17T14:32:08.000Z" },
  totalGamesPlayed: 41,
  daily: {
    currentStreak: 3,
    longestStreak: 7,
    lastPlayedDate: "2026-10-20",
    todayBest: 25.3,
  },
  achievementsEarned: 1,
  historyAvailable: true,
  history: null,
};

const ACHIEVEMENTS: AchievementItemResponse[] = [
  {
    id: 1,
    name: "First Global Game",
    description: "Complete your first Global game.",
    criteriaDescription: "Complete your first Global game.",
    earned: true,
    earnedAt: "2026-10-17T14:32:08.000Z",
  },
  {
    id: 2,
    name: "Centurion",
    description: "Complete 100 games.",
    criteriaDescription: "Complete 100 games.",
    earned: false,
    earnedAt: null,
  },
];

const ROUND = (roundNumber: number, score: number) => ({
  roundNumber,
  target: { h: 10 * roundNumber, s: 20, v: 30 },
  guess: { h: 11 * roundNumber, s: 21, v: 31 },
  score,
});

const HISTORY: HistoryItemResponse[] = [
  {
    id: "global-1",
    mode: "global",
    playedAt: "2026-10-21T09:15:00.000Z",
    totalScore: 24.6,
    rounds: [ROUND(1, 9.1), ROUND(2, 8.2), ROUND(3, 7.3)],
  },
  {
    id: "room-1",
    mode: "room",
    playedAt: "2026-10-20T18:00:00.000Z",
    totalScore: 22.1,
    roomId: 7,
    attemptNumber: 2,
    rounds: [
      { ...ROUND(1, 9.1), colorNumber: 3, timedOut: false },
      { ...ROUND(2, 8.2), colorNumber: 1, timedOut: true },
      { ...ROUND(3, 4.8), colorNumber: 2, timedOut: false },
    ],
  },
];

describe("profile components", () => {
  it("renders the four headline stats with one-decimal scores", () => {
    const markup = renderToStaticMarkup(<StatsCards stats={STATS} />);

    expect(markup).toContain("Global PB");
    expect(markup).toContain("24.6");
    expect(markup).toContain("41");
    expect(markup).toContain("3 / 7");
    expect(markup).toContain("25.3");
    expect(markup).toContain("2026-10-17");
  });

  it("renders earned and locked achievements with their criteria", () => {
    const markup = renderToStaticMarkup(<AchievementGrid achievements={ACHIEVEMENTS} />);

    expect(markup).toContain('data-earned="true"');
    expect(markup).toContain('data-earned="false"');
    expect(markup).toContain("Earned");
    expect(markup).toContain("Locked");
    expect(markup).toContain("Complete your first Global game.");
    expect(markup).toContain("Complete 100 games.");
    expect(markup).toContain("2026-10-17");
  });

  it("labels room history, separates it visually and expands round details", () => {
    const markup = renderToStaticMarkup(<HistoryList items={HISTORY} />);

    expect(markup).toContain('data-mode="global"');
    expect(markup).toContain('data-mode="room"');
    expect(markup).toContain("Room");
    expect(markup).toContain("Attempt 2");
    expect(markup).toContain("border-l-accent-violet");
    expect(markup).toContain("Round 1");
    expect(markup).toContain("Target");
    expect(markup).toContain("Your mix");
    expect(markup).toContain("9.1 / 10");
    expect(markup).toContain("Timed out");
  });
});
