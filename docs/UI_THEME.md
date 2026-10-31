# ChromaMatch UI Theme — "Darkroom Arcade: Studio Console"

Short, normative guide for the front end. Architecture §5.11.3/§5.11.5 remains the
higher-level contract; this file fixes the visual system that later steps follow.

## 1. Principles

1. **The game colours are the stars.** UI chrome is neutral (carbon, bone, graphite)
   and never competes with a target swatch or a guess.
2. **Tactile, not toy-like.** Controls read as hardware: rounded keycaps, a solid
   bottom lip, a 2 px press. Hover is a colour shift, focus is a visible ring.
3. **Reward on results, never on the stage.** Count-ups, stamps and bursts live on
   result/summary screens only.
4. **Meaning never depends on colour alone.** Every mode, rank and celebration
   pairs an icon, a shape and a text label. Supplementary chrome (like the
   “coming soon” lock) may be icon-only when it has an accessible label and does
   not carry essential meaning alone.
5. **Say it once.** One idea per line; cut metadata and labels that do not help
   the player. The test strip, mode tokens and celebrations carry the personality.
6. **Calm by default.** No ambient animation in chrome; no sound. CSS only.
7. **Accessible everywhere.** AA contrast, keyboard-visible focus, 360 px support,
   and `prefers-reduced-motion` honoured.

## 2. Tokens

All tokens live in `src/app/globals.css` (`:root`, dark override, `@theme inline`).
Tailwind utilities (`bg-card`, `text-muted-foreground`, `font-display`, …) map to
them; components never hard-code hex values except the stage constants and brand mark.

| Group | Tokens |
|---|---|
| Canvas | `--background`, `--foreground` |
| Surfaces | `--card`, `--card-elevated`, `--card-foreground`, `--muted`, `--input` |
| Lines | `--border`, `--border-lip`, `--muted-foreground`, `--input-border`, `--input-border-strong` |
| Action | `--primary`, `--primary-hover`, `--primary-lip`, `--primary-foreground` |
| Status | `--success`, `--warning`, `--danger`, `--danger-lip`, `--danger-soft`, `--success-soft`, `--warning-soft` |
| Brand accents | `--accent-cyan`, `--accent-violet`, `--accent-gold` |
| Focus / overlay | `--ring`, `--overlay` |
| Stage (fixed) | `--stage-bg`, `--stage-surface`, `--stage-border`, `--stage-fg`, `--stage-muted` |
| Type | `--font-display` (Space Grotesk), `--font-sans` (Plus Jakarta Sans), `--font-mono` (JetBrains Mono) |

Useful component classes: `.cm-keycap` (+ `-primary/-secondary/-outline/-danger`),
`.cm-console-card`, `.cm-spectrum-bar`, `.cm-darkroom-grid`, `.cm-game-stage`,
`.cm-burst-chip`, `.cm-celebration-badge`.

Rules:
- `--spectrum-gradient` is decorative brand flourish. **Never** use it inside the
  game stage, on target/guess swatches, or as the only signal for a state.
- `<TestStrip>` is the playful colour flourish. It is never a target or a guess
  and never appears inside `<GameStage>`.
- Numeric readouts (scores, HSV, timers, room codes) use `font-mono tabular-nums`.
- Do not add a second accent system; pick an existing semantic token.
- Contrast: light primary text `#fffdfb` on `#c2410c` is 5.1:1; dark primary text
  `#140702` on `#ff6b2c` is 7.0:1. Input boundaries use `--input-border`
  (+ `--input-border-strong`) at ≥ 3:1 rather than the decorative `--border`.

## 3. The stage rule (non-negotiable)

`<GameStage>` (`src/components/game/GameStage.tsx`) renders the fixed game surface:

- Background is **`#1e1e1e`** (`GAME_STAGE_HEX`), RGB 30/30/30, saturation 0, in both
  light and dark themes. Tray `#262626`, divider `#363636`, text `#f0f0f0`.
- No tints, gradients, glows, coloured borders, images, patterns, or decorative
  shadows. Flat achromatic structural rules (`#363636`) and the countdown track
  are the only framing allowed. The stage must look identical for every player
  and in every theme.
- No ambient motion except the flat, achromatic countdown bar during reveal and
  timed guessing. Control press/drag feedback is allowed. Never animate the
  stage background.
- Only the target/guess swatch, the functional HSV slider ramps, neutral
  readouts and the single stage action belong inside. Celebrations, score
  count-ups, test strips, spectrum bars and mode accent colours stay outside.
- The guess dock is the one functional-colour exception: the three HSV ramp
  tracks may show their channel gradients because they are controls, not
  decoration. The stage surround, HUD and all non-control chrome stay
  achromatic.
- The HUD uses mono labels (`Round 1 / 3`, mode, phase) and exposes the countdown
  with `role="progressbar"` plus a polite once-per-second screen-reader message.

Later play screens (`reveal`, `guess`, `slider`) must render inside `<GameStage>`;
they must not recreate their own stage background.

## 4. Component inventory

| Component | File | Notes |
|---|---|---|
| `Wordmark` | `components/ui/Wordmark.tsx` | Filter-trio mark + spectrum underline; sizes `sm/md/lg`, optional tagline. |
| `TestStrip` | `components/ui/TestStrip.tsx` | Film-strip colour wells with an optional dashed “?” well; brand flourish, never a game swatch. |
| `Button` | `components/ui/Button.tsx` | `primary/secondary/outline/ghost/danger` × `sm/md/lg/icon`; loading + disabled; keycap press. |
| `Input` | `components/ui/Input.tsx` | Recessed well, label/hint/error, icon + text error (not colour alone). |
| `Card` | `components/ui/Card.tsx` | `interactive`/`elevated` options; header/title/description/content/footer helpers. |
| `Modal` | `components/ui/Modal.tsx` | Focus trap, Escape, backdrop close, mobile bottom sheet, spectrum strip. |
| `Toast` | `components/ui/Toast.tsx` | Circle, shield and octagon icon badges + title; no status prefix text. |
| `Spinner` | `components/ui/Spinner.tsx` | Aperture ring; stops under reduced motion. |
| `ErrorMessage` | `components/ui/ErrorMessage.tsx` | Icon + title + message; no repeated diagnostic label. |
| `EmptyState` | `components/ui/EmptyState.tsx` | Friendly empty tray with an optional next action. |
| `ModeGlyph` | `components/ui/ModeGlyph.tsx` | Enamel arcade pin: 48/64 px, coloured rim, dark plate, bold mini-scene and bottom lip. Decorative, so always render the mode name as the visible label. |
| `GameStage` | `components/game/GameStage.tsx` | Fixed neutral stage; header, countdown, content, optional footer. |
| `ColorSwatch` | `components/game/ColorSwatch.tsx` | Display-only HSV swatch; sizes `sm/md/lg/reveal/canvas/fill`; stage or chrome tone. |
| `RevealCountdown` | `components/game/RevealCountdown.tsx` | Achromatic timer + progress bar used by `GameStage`. |
| `HsvSliders` | `components/game/HsvSliders.tsx` | The guess dock: three vertical functional HSV ramps + live canvas. |
| `RoundProgress` | `components/game/RoundProgress.tsx` | Three-pill round tracker; check icon and text carry completion. |
| `ChannelDiffBars` | `components/game/ChannelDiffBars.tsx` | Result delta rows for H/S/V, each with a labelled value and bar. |
| `GameResult` | `components/game/GameResult.tsx` | Result-screen score header, split target/guess wells, deltas, notices. |
| `GlobalGameView` | `components/game/GlobalGameView.tsx` | Presentational phase shell for the Global mode; the pattern future modes reuse. |
| `LeaderboardTable` | `components/leaderboard/LeaderboardTable.tsx` | Rank/player/score/date table; highlights the viewer row with a visible “You” label. |
| `RankBadge` | `components/leaderboard/RankBadge.tsx` | Rank pill; top three add a medal cue, never colour alone. |
| `YourRankCard` | `components/leaderboard/YourRankCard.tsx` | Compact viewer rank/score card, rendered only when `me` exists. |
| `LeaderboardView` | `components/leaderboard/LeaderboardView.tsx` | Shared public Global/Daily screen: tabs, date picker, pagination and states. |
| `Celebration` | `components/ui/Celebration.tsx` | Result-screen stamp: tag + shape + icon + text. |
| `ScoreCountUp` | `components/ui/Celebration.tsx` | Integer-tenths count-up; instant final value under reduced motion / SSR. |

Styleguide: **`/styleguide`** (`src/app/styleguide/page.tsx`). Dev-only — the
production build resolves `NODE_ENV` and returns 404. It shows tokens, type,
test strips, mode pins, all component states, the stage, and celebrations.

Home grid: four vertical mode cards plus a wide Profile banner spanning two
columns. Profile is an account station rather than a play mode, and the span
keeps both the 2-column and 3-column grids full.

## 5. Celebrations

Use `<Celebration>` only on result, room-summary, profile-unlock or other
non-stage screens:

| Kind | Trigger |
|---|---|
| `pb` | Existing Global/Daily PB strictly beaten (`pb.beatExisting`). |
| `achievement` | Newly unlocked achievement(s) returned by submit. |
| `streak` | Daily streak milestone (e.g. 3, 7, 30). |
| `room-win` | Player finishes first in a room scoreboard. |

Rules:
- Never render inside `<GameStage>` or over a reveal/guess swatch.
- One celebration at a time; queue achievements rather than stacking banners.
- Pair with `<ScoreCountUp>` for the total; never announce the animated value.
- The shape (octagon/diamond/pill/hexagon) + mono tag + icon must remain even
  when colour is removed or motion is reduced. Under reduced motion the burst is
  hidden and the badge is static.
- Sound is off by default; no sound is part of this design system.

## 6. Microcopy & layout

- Voice: a calm colourist's console with arcade warmth. Playful, never childish.
  Prefer "What are we mixing today?", "Fresh eyes wanted.", "Count me in" and
  "For people who argue about teal." over generic system phrasing.
- One job per label; actions keep their name through the flow (Publish → Published).
- If a card needs a tag, a detail line and a paragraph, cut two of them. The
  mode token and name already say what the card is.
- Layout is mobile-first: 360 px minimum, 44 px touch targets, cards stack before
  they shrink. Never rely on hover for an essential action.
- Empty states invite the next action; errors say what happened and what to do.

## 7. Game round language (all modes)

Every mode uses the same four-beat rhythm. Daily and Room may change the source
of the colours, the timer and the notices, but never the visual grammar.

```
IDLE / intro ──► REVEAL ──► GUESS ──► RESULT
```

1. **Intro.** A mode token, a short editorial headline, three facts and one
   primary action. Brand flourishes (`<TestStrip>`) live here, outside the stage.
2. **Reveal.** `<GameStage>` frames the target as a full-canvas `<ColorSwatch>`
   (`size="canvas"`, `frame="none"`). The only chrome is the achromatic HUD,
   `<RevealCountdown>` and the round tracker. The target must unmount when the
   reveal ends — never use `display: none` or opacity.
3. **Guess.** The stage becomes a colour dock: `<HsvSliders>` shows the live
   guess as a large canvas and three vertical functional ramps. The live mix
   and its ramps are the only chromatic content inside the stage. Use the
   stage-styled submit keycap in the footer; do not introduce a second primary
   action.
4. **Result.** `<GameResult>` owns the score header, PB/achievement notices and
   the split `Target / Your mix` wells. `<ChannelDiffBars>` accompanies each
   round. The result sits outside the stage and may use brand colour,
   celebrations and count-ups.

### 7.1 Reuse map

- **Global:** `GlobalGameView` is the reference implementation.
- **Daily:** reuse `GameStage`, `HsvSliders`, `RoundProgress`, `GameResult` and
  `ChannelDiffBars`. Change only the intro copy, mode label, and daily notices.
- **Room:** reuse the same components. Add the room timer through
  `GameStage.countdown` and auto-submit, but keep the stage, dock, round tracker
  and result layout identical.
- Do not fork a per-mode slider, result card or reveal panel. Mode-specific
  differences belong in copy, data and notices.

### 7.2 Slider ramp rule

The H/S/V ramps are **functional controls**, not decoration. Hue shows the full
wheel; saturation and value ramp from the current mix to that channel's extreme.
Never use a ramp as a target swatch, a decorative gradient, or the only carrier
of a value. Keep the mono numeric readout, `aria-valuetext`, native range
semantics and Shift+Arrow step.

### 7.3 Result split well

Target is always the upper half and the player's mix the lower half, separated
by a hairline. Each half carries a visible label and HSV mono badge. Do not swap
the order between modes; players should learn the seam once.

When a new mode or screen is added, update `/styleguide` with its state and reuse
these components before inventing a new visual pattern.
