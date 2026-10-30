import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GAME_STAGE_HEX, GAME_STAGE_NEUTRAL_TOKEN, GameStage } from "@/components/game";
import {
  Button,
  Celebration,
  EmptyState,
  ErrorMessage,
  Input,
  ModeGlyph,
  ScoreCountUp,
  Spinner,
  Wordmark,
  formatScoreTenths,
  getCelebrationMeta,
  modeTag,
  type CelebrationKind,
} from "@/components/ui";

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

describe("GameStage", () => {
  it("exposes the fixed calibrated neutral gray", () => {
    expect(GAME_STAGE_HEX).toBe("#1e1e1e");
    expect(GAME_STAGE_NEUTRAL_TOKEN).toBe("neutral-1e1e1e");
  });

  it("renders the neutral HUD, round readout and countdown", () => {
    const html = render(
      <GameStage
        roundNumber={2}
        modeLabel="Global"
        phaseLabel="Memorise swatch"
        countdown={{ remainingMs: 2500, totalMs: 5000 }}
      >
        <span>target</span>
      </GameStage>,
    );

    expect(html).toContain('data-testid="game-stage"');
    expect(html).toContain(`data-stage-calibration="${GAME_STAGE_NEUTRAL_TOKEN}"`);
    expect(html).toContain('data-testid="game-stage-mode"');
    expect(html).toContain("Global");
    expect(html).toContain("Round 2 / 3");
    expect(html).toContain("Memorise swatch");
    expect(html).toContain('role="timer"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("3 seconds remaining");
    expect(html).toContain("2.5s");
    expect(html).toContain("width:50%");
    expect(html).toContain("target");
  });

  it("omits countdown chrome when no timer is supplied", () => {
    const html = render(
      <GameStage roundNumber={1}>
        <span>guess</span>
      </GameStage>,
    );

    expect(html).toContain("Round 1 / 3");
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain('role="progressbar"');
  });

  it("never uses the brand spectrum inside the stage", () => {
    const html = render(
      <GameStage countdown={{ remainingMs: 1000, totalMs: 5000 }}>
        <span>target</span>
      </GameStage>,
    );

    expect(html).not.toContain("cm-spectrum-bar");
    expect(html).not.toContain("gradient");
  });
});

describe("score formatting and count-up", () => {
  it("formats integer tenths without floating-point drift", () => {
    expect(formatScoreTenths(0)).toBe("0.0");
    expect(formatScoreTenths(97)).toBe("9.7");
    expect(formatScoreTenths(253)).toBe("25.3");
    expect(formatScoreTenths(300)).toBe("30.0");
    expect(formatScoreTenths(249.6)).toBe("25.0");
  });

  it("renders the final value on the server", () => {
    const html = render(<ScoreCountUp value={25.3} max={30} />);

    expect(html).toContain('data-testid="score-count-up"');
    expect(html).toContain("25.3");
    expect(html).toContain("25.3 out of 30.0");
    expect(html).toContain("tabular-nums");
  });
});

describe("Celebration", () => {
  const kinds: CelebrationKind[] = ["pb", "achievement", "streak", "room-win"];

  it("maps each kind to a distinct tag and shape", () => {
    expect(getCelebrationMeta("pb")).toEqual({
      badgeLabel: "NEW PB",
      shapeName: "octagon",
      defaultTitle: "New personal best!",
    });
    expect(getCelebrationMeta("achievement").shapeName).toBe("diamond");
    expect(getCelebrationMeta("streak").shapeName).toBe("pill");
    expect(getCelebrationMeta("room-win").shapeName).toBe("hexagon");

    const labels = kinds.map((kind) => getCelebrationMeta(kind).badgeLabel);
    expect(new Set(labels).size).toBe(kinds.length);
  });

  it("never relies on colour alone", () => {
    for (const kind of kinds) {
      const html = render(<Celebration kind={kind} subtitle="Result screen only" />);
      const meta = getCelebrationMeta(kind);

      expect(html).toContain(`data-celebration-kind="${kind}"`);
      expect(html).toContain(`data-celebration-shape="${meta.shapeName}"`);
      expect(html).toContain(`[${meta.badgeLabel}]`);
      expect(html).toContain(meta.defaultTitle);
      expect(html).toContain("Result screen only");
    }
  });

  it("renders nothing when inactive", () => {
    expect(render(<Celebration kind="pb" active={false} />)).toBe("");
  });
});

describe("base UI kit", () => {
  it("renders the wordmark and its subtitle", () => {
    const html = render(<Wordmark size="lg" subtitle="Darkroom calibration console" />);

    expect(html).toContain("Chroma");
    expect(html).toContain("Match");
    expect(html).toContain("Darkroom calibration console");
    expect(html).toContain("cm-spectrum-bar");
  });

  it("marks a loading button busy and disabled", () => {
    const html = render(<Button loading>Saving</Button>);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("cm-keycap");
  });

  it("wires input hints and errors to the field", () => {
    const html = render(
      <Input
        id="email"
        label="Email"
        hint="Use your account email."
        error="Enter a valid email."
      />,
    );

    expect(html).toContain('id="email"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-hint email-error"');
    expect(html).toContain('id="email-hint"');
    expect(html).toContain('id="email-error"');
    expect(html).toContain("Enter a valid email.");
  });

  it("renders a diagnostic error alert with a non-colour tag", () => {
    const html = render(
      <ErrorMessage title="Room is full" message="Ask the host for a bigger room." />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("[ERR]");
    expect(html).toContain("Room is full");
    expect(html).toContain("Ask the host for a bigger room.");
  });

  it("renders the spinner without duplicating its label when decorative", () => {
    const html = render(<Spinner decorative />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("sr-only");
  });

  it("renders a friendly empty state with a next action", () => {
    const html = render(
      <EmptyState
        title="No attempts yet"
        description="Play your first round to put a colour on the board."
        action={<Button size="sm">Play a round</Button>}
      />,
    );

    expect(html).toContain("No attempts yet");
    expect(html).toContain("Play your first round");
    expect(html).toContain("Play a round");
    expect(html).toContain("border-dashed");
  });

  it("gives every mode glyph a distinct visible tag", () => {
    const kinds = ["global", "daily", "room", "boards", "profile"] as const;
    const tags = kinds.map((kind) => modeTag(kind));

    expect(new Set(tags).size).toBe(kinds.length);
    for (const kind of kinds) {
      expect(render(<ModeGlyph kind={kind} />)).toContain("clip-path");
    }
  });
});
