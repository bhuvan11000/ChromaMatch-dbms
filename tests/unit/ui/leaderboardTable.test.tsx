import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeaderboardTable } from "@/components/leaderboard";
import type { LeaderboardEntryResponse } from "@/lib/schemas/leaderboard";

const ENTRIES: LeaderboardEntryResponse[] = [
  {
    rank: 1,
    userId: 4,
    username: "alice",
    score: 28.2,
    achievedAt: "2026-10-30T08:00:00.000Z",
  },
  {
    rank: 2,
    userId: 7,
    username: "bob",
    score: 24.6,
    achievedAt: "2026-10-30T09:00:00.000Z",
  },
];

describe("LeaderboardTable", () => {
  it("renders rank, username, score and date columns", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardTable entries={ENTRIES} me={null} mode="daily" />,
    );

    expect(markup).toContain("alice");
    expect(markup).toContain("bob");
    expect(markup).toContain("28.2");
    expect(markup).toContain("24.6");
    expect(markup).toContain("2026-10-30");
    expect(markup).toContain("Date");
    expect(markup).not.toContain("data-viewer");
  });

  it("highlights the viewer's row and labels it without relying on colour", () => {
    const markup = renderToStaticMarkup(
      <LeaderboardTable entries={ENTRIES} me={{ rank: 2, score: 24.6 }} mode="global" />,
    );

    expect(markup).toContain('data-viewer="true"');
    expect(markup).toContain("You");
    expect(markup).toContain("Achieved");
  });
});
