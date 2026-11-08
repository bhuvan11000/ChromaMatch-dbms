import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  JoinForm,
  LobbyMemberList,
  RoomCreateForm,
  RoomPanel,
  RoomResult,
  RoomScoreboard,
  RoomSettingsSummary,
} from "@/components/rooms";
import { SLIDER_DEFAULTS } from "@/lib/config/constants";
import type { GameSubmitResponse } from "@/lib/schemas/game";
import type { RoomState } from "@/lib/schemas/rooms";

import { EXPECTED_ROUND_SCORES, EXPECTED_TOTAL, FIXED_GUESSES, FIXED_TARGETS } from "../support/game";

const NOOP = () => undefined;

function state(overrides: Partial<RoomState> = {}, me: Partial<RoomState["me"]> = {}): RoomState {
  return {
    code: "ABCD2345",
    status: "lobby",
    roomSize: 6,
    timerSeconds: 10,
    attemptsLimit: 3,
    creatorId: 1,
    createdAt: "2026-10-29T12:00:00.000Z",
    startedAt: null,
    endedAt: null,
    me: {
      userId: 1,
      isCreator: true,
      status: "active",
      attemptsUsed: 0,
      attemptsRemaining: 3,
      bestScore: null,
      ...me,
    },
    members: [
      {
        userId: 1,
        username: "alice",
        isCreator: true,
        status: "active",
        attemptsUsed: 0,
        bestScore: null,
        joinedAt: "2026-10-29T12:00:00.000Z",
      },
      {
        userId: 2,
        username: "bob",
        isCreator: false,
        status: "active",
        attemptsUsed: 0,
        bestScore: null,
        joinedAt: "2026-10-29T12:01:00.000Z",
      },
    ],
    standings: [
      { rank: 1, userId: 2, username: "bob", bestScore: 24.5 },
      { rank: null, userId: 1, username: "alice", bestScore: null },
    ],
    ...overrides,
  };
}

function panel(room: RoomState, extra: { copied?: boolean; actionError?: string | null } = {}) {
  return renderToStaticMarkup(
    <RoomPanel
      state={room}
      onStart={NOOP}
      onLeave={NOOP}
      onPlay={NOOP}
      onCopyLink={NOOP}
      copied={extra.copied ?? false}
      actionError={extra.actionError ?? null}
    />,
  );
}

describe("RoomScoreboard", () => {
  it("renders rank, username and best score; unranked players are labelled in text", () => {
    const html = renderToStaticMarkup(
      <RoomScoreboard standings={state().standings ?? []} meId={1} />,
    );

    expect(html).toContain("#1");
    expect(html).toContain("bob");
    expect(html).toContain("24.5");
    expect(html).toContain("Unranked");
    expect(html).toContain("No score");
    // The viewer is marked with text, not only a tint.
    expect(html).toContain("You");
    expect(html.match(/data-testid="room-scoreboard-row"/g)).toHaveLength(2);
  });
});

describe("lobby pieces", () => {
  it("lists members with host and You tags and a count", () => {
    const room = state();
    const html = renderToStaticMarkup(
      <LobbyMemberList members={room.members} roomSize={room.roomSize} meId={2} />,
    );

    expect(html).toContain("alice");
    expect(html).toContain("bob");
    expect(html).toContain("Host");
    expect(html).toContain("You");
    expect(html).toContain("2 / 6");
  });

  it("summarizes settings in text", () => {
    const html = renderToStaticMarkup(
      <RoomSettingsSummary roomSize={6} timerSeconds={10} attemptsLimit={3} />,
    );
    expect(html).toContain("Up to 6");
    expect(html).toContain("10s per round");
    expect(html).toContain("3 each");

    expect(
      renderToStaticMarkup(<RoomSettingsSummary roomSize={2} timerSeconds={null} attemptsLimit={5} />),
    ).toContain("Off");
  });
});

describe("RoomPanel", () => {
  it("lobby: code, copy button, Start only for the creator, enabled with 2+ players", () => {
    const creator = panel(state());

    expect(creator).toContain("ABCD2345");
    expect(creator).toContain("Copy invite link");
    expect(creator).toContain("Start room");
    expect(creator).toContain("Leave room");
    expect(creator).not.toContain("Waiting for at least");
  });

  it("lobby: Start is disabled with fewer than 2 players", () => {
    const room = state();
    const alone = panel({ ...room, members: room.members.slice(0, 1) });

    expect(alone).toContain("Start room");
    expect(alone).toContain("disabled");
    expect(alone).toContain("Waiting for at least 2 players.");
  });

  it("lobby: Start is hidden for a non-creator", () => {
    const html = panel(state({ creatorId: 2 }, { userId: 3, isCreator: false }));

    expect(html).not.toContain("Start room");
    expect(html).toContain("Waiting for the host to start.");
    expect(html).toContain("Leave room");
  });

  it("shows the copy confirmation text", () => {
    expect(panel(state(), { copied: true })).toContain("Copied!");
    expect(panel(state(), { copied: false })).not.toContain("Copied!");
  });

  it("in progress: attempts, Play attempt and live standings", () => {
    const html = panel(
      state({ status: "in_progress" }, { attemptsUsed: 1, attemptsRemaining: 2, bestScore: 20 }),
    );

    expect(html).toContain("1 / 3");
    expect(html).toContain("Play attempt");
    expect(html).toContain("Live standings");
    expect(html).toContain("20.0 / 30");
    expect(html).toContain("Leave room");
    expect(html).not.toContain("Start room");
  });

  it("in progress: hidden standings show only my best", () => {
    const html = panel(
      state({ status: "in_progress", standings: null }, { bestScore: 18.5, attemptsRemaining: 2 }),
    );

    expect(html).toContain("Live standings are hidden");
    expect(html).toContain("18.5 / 30");
    expect(html).not.toContain("bob");
    expect(html).not.toContain('data-testid="room-scoreboard"');
  });

  it("in progress: no Play when attempts are used up", () => {
    const html = panel(
      state(
        { status: "in_progress" },
        { status: "finished", attemptsUsed: 3, attemptsRemaining: 0, bestScore: 21 },
      ),
    );

    expect(html).not.toContain("Play attempt");
    expect(html).toContain("You used every attempt");
  });

  it("left member: forfeited notice, no Play and no Leave", () => {
    const html = panel(
      state(
        { status: "in_progress" },
        { status: "left", attemptsUsed: 1, attemptsRemaining: 0, bestScore: 20 },
      ),
    );

    expect(html).toContain("You left this room");
    expect(html).toContain("cannot rejoin");
    expect(html).not.toContain("Play attempt");
    expect(html).not.toContain("Leave room");
  });

  it("finished: final standings with ranks and no Play", () => {
    const html = panel(
      state({ status: "finished" }, { status: "finished", attemptsRemaining: 0, bestScore: 10 }),
    );

    expect(html).toContain("Final standings");
    expect(html).toContain("#1");
    expect(html).not.toContain("Play attempt");
    expect(html).not.toContain("Leave room");
  });

  it("cancelled: shows the cancellation message", () => {
    const html = panel(state({ status: "cancelled", standings: [] }));

    expect(html).toContain("This room was cancelled");
    expect(html).not.toContain("Start room");
  });

  it("renders an inline action error", () => {
    expect(panel(state(), { actionError: "Not enough players" })).toContain("Not enough players");
  });
});

describe("forms", () => {
  it("renders the create form with every option and 2–10 sizes", () => {
    const html = renderToStaticMarkup(<RoomCreateForm onSubmit={NOOP} />);

    expect(html).toContain("No timer");
    expect(html).toContain(">5s<");
    expect(html).toContain(">10s<");
    expect(html).toContain(">15s<");
    expect(html).toContain("3 attempts");
    expect(html).toContain("5 attempts");
    expect(html).toContain('value="2"');
    expect(html).toContain('value="10"');
    expect(html).not.toContain('value="11"');
    expect(html).toContain("Create room");
  });

  it("renders server errors inline on both forms", () => {
    expect(renderToStaticMarkup(<RoomCreateForm onSubmit={NOOP} error="Boom" />)).toContain("Boom");
    expect(renderToStaticMarkup(<JoinForm onSubmit={NOOP} error="Room not found" />)).toContain(
      "Room not found",
    );
  });

  it("renders the join form with a labelled code field", () => {
    const html = renderToStaticMarkup(<JoinForm onSubmit={NOOP} />);

    expect(html).toContain("Room code");
    expect(html).toContain("Join room");
  });
});

describe("RoomResult", () => {
  function result(room: GameSubmitResponse["room"]): GameSubmitResponse {
    return {
      mode: "room",
      totalScore: EXPECTED_TOTAL,
      rounds: FIXED_TARGETS.map((target, index) => ({
        roundNumber: index + 1,
        target: { h: target.h, s: target.s, v: target.v },
        guess: FIXED_GUESSES[index] ?? SLIDER_DEFAULTS,
        score: EXPECTED_ROUND_SCORES[index] ?? 0,
        diff: { h: 5.6, s: 3.5, v: 3.5 },
        timedOut: false,
      })),
      totalGamesPlayed: null,
      pb: null,
      streak: null,
      achievements: [],
      room,
    };
  }

  const ROOM_SUMMARY = {
    attemptNumber: 2,
    bestScore: 27.5,
    isNewBest: false,
    attemptsRemaining: 1,
    memberStatus: "active" as const,
    roomStatus: "in_progress" as const,
  };

  function render(room: GameSubmitResponse["room"]) {
    return renderToStaticMarkup(
      <RoomResult result={result(room)} roomCode="ABCD2345" onNextAttempt={NOOP} onBackToRoom={NOOP} />,
    );
  }

  it("shows attempt number, best score and attempts remaining with Next attempt", () => {
    const html = render(ROOM_SUMMARY);

    expect(html).toContain("Room ABCD2345 · Attempt 2");
    expect(html).toContain("27.5 / 30");
    expect(html).toContain("Attempts left");
    expect(html).toContain("Next attempt");
    expect(html).not.toContain("Back to room");
    // Reuses the shared result layout.
    expect(html).toContain('data-testid="round-split-swatch-3"');
  });

  it("offers Back to room when no attempts remain, and has no PB/achievement/leaderboard copy", () => {
    const html = render({
      ...ROOM_SUMMARY,
      attemptsRemaining: 0,
      memberStatus: "finished",
      roomStatus: "finished",
      isNewBest: true,
    });

    expect(html).toContain("Back to room");
    expect(html).not.toContain("Next attempt");
    expect(html).toContain("New best score in this room");
    expect(html).not.toContain("benchmark");
    expect(html).not.toContain("personal best");
    expect(html).not.toContain("Achievement");
    expect(html).not.toContain("/leaderboard/");
  });
});
