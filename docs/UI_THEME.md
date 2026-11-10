# ChromaMatch UI Theme — "Prism Arcade // Colour Synthesizer"

Short, normative guide for the front end. Architecture §5.11 remains the
higher-level contract; this file fixes the visual system that the revamp uses.

## 1. Principles

1. **The cabinet is loud; the instrument is quiet.** Outside the game, the UI is
   a printed arcade cabinet: warm paper, hard ink rules, offset shadows, chunky
   keycaps and LED readouts. Inside the game, the stage is a calibrated
   achromatic instrument and never competes with the player's colours.
2. **Hardware, not decoration.** Controls read as physical objects: two-pixel
   ink outlines, a solid bottom lip, a two-to-three-pixel press. Focus is always
   visible. Soft blur belongs to overlays and to nothing else.
3. **Reward on results, never on the stage.** Count-ups, stamps and bursts live
   on result/summary screens only.
4. **Meaning never depends on colour alone.** Every mode, rank, status and
   celebration pairs an icon or shape with a text label. Colour is a bonus.
5. **Say it once.** One idea per line. Mode names are consistent through the
   flow. Avoid cute status copy, fake data and decorative paragraphs.
6. **Calm by default.** No ambient animation in chrome. The only continuous
   motion inside the stage is the flat countdown bar. CSS only, no sound.
7. **Accessible everywhere.** AA contrast, keyboard-visible focus, 360 px
   support, 44 px touch targets and `prefers-reduced-motion` honoured.
8. **Two registers, one system.** Light mode is daylight paper; dark mode is a
   midnight cathode cabinet. The stage, marquee and high-score screens are dark
   in both.

## 2. Tokens

All tokens live in `src/app/globals.css` (`:root`, dark override, `@theme inline`).
Components use token-backed Tailwind utilities or the `cm-*` component classes;
only illustrations (the prism mark, mode pins, high-score medal tones) may use
fixed colours.

Theme tokens use `light-dark()` and a `data-theme` override on `<html>`; the
system preference is the default. The stage, marquee and high-score surfaces are
fixed or near-fixed across both schemes.

| Group | Tokens |
|---|---|
| Canvas | `--background`, `--foreground` |
| Surfaces | `--card`, `--card-elevated`, `--card-foreground`, `--muted`, `--muted-strong`, `--input` |
| Lines | `--border`, `--border-lip`, `--muted-foreground`, `--input-border`, `--input-border-strong` |
| Action | `--primary`, `--primary-hover`, `--primary-lip`, `--primary-foreground`, `--primary-ink` |
| Status | `--success`, `--warning`, `--danger`, `--danger-lip`, `--danger-foreground`, plus the `-soft` tints |
| Brand accents | `--accent-cyan`, `--accent-violet`, `--accent-gold` |
| Focus / overlay | `--ring`, `--overlay` |
| Marquee | `--marquee-bg`, `--marquee-fg`, `--marquee-muted` |
| High-score screen | `--screen-bg`, `--screen-surface`, `--screen-fg`, `--screen-muted`, `--screen-line`, `--screen-gold`, `--screen-cyan`, `--screen-rose` |
| Stage (fixed) | `--stage-bg`, `--stage-surface`, `--stage-border`, `--stage-fg`, `--stage-muted` |
| Type | `--font-display` (Bricolage Grotesque), `--font-sans` (Plus Jakarta Sans), `--font-mono` (JetBrains Mono) |

Rules:
- **`--primary` is for fills, not small text.** `--primary-ink` is the text-safe
  signal orange (at least 4.8:1 on paper). Use `text-primary-ink` for links,
  eyebrows, stickers and small labels on light surfaces.
- Buttons and badges pair ink text (`--primary-foreground`) with the orange fill.
  Do not put white text on `--primary`.
- `--spectrum-gradient` is a brand flourish. Never use it inside the stage, on
  target/guess swatches, or as the only signal for a state.
- Numeric readouts (scores, HSV, timers, room codes) use `font-mono tabular-nums`.
- Do not add a second accent system. Pick an existing semantic token.

## 3. The stage rule (non-negotiable)

`<GameStage>` (`src/components/game/GameStage.tsx`) renders the fixed game
surface:

- Background is **`#1e1e1e`** (`GAME_STAGE_HEX`), RGB 30/30/30, saturation 0, in
  both light and dark themes. Tray `#262626`, divider `#363636`, text `#f0f0f0`.
- No tints, gradients, glows, coloured borders, images, patterns or decorative
  shadows. Flat achromatic rules and the countdown track are the only framing.
- No ambient motion except the flat, achromatic countdown bar during reveal and
  timed guessing. Control press/drag feedback is allowed.
- Only the target/guess swatch, the functional HSV slider ramps, neutral
  readouts and the single stage action belong inside.
- The guess dock is the one functional-colour exception: the three HSV ramp
  tracks may show their channel gradients because they are controls. The stage
  surround, HUD and all non-control chrome stay achromatic.
- The stage may sit inside `.cm-stage-bezel`, a dark cabinet part with four
  bolts. The bezel is outside the stage and may be physical; it must not tint
  the stage itself.
- The HUD uses mono labels (`Round 1 / 3`, mode, phase) and exposes the
  countdown with `role="progressbar"` plus a polite once-per-second
  screen-reader message.

Later play screens (`reveal`, `guess`) must render inside `<GameStage>`; they
must not recreate their own stage background.

## 4. Shell and navigation

- `AppHeader` (`src/components/layout/AppHeader.tsx`) is the shared chrome for
  signed-in pages and public boards. Desktop: wordmark, Play / Boards / Rooms /
  Profile tabs, optional Admin link, player chip and logout. Mobile: compact
  wordmark + player chip + a fixed four-item bottom dock.
- The header is sticky, two-pixel ink, with a spectrum hairline at the top. The
  bottom dock sits above the safe area and the app shell reserves bottom space.
- `ThemeToggle` switches the light/dark override and stores it as `cm_theme`.
  The system preference is the default; the pre-paint script in the root layout
  applies the stored value before hydration, so there is no flash.
- Page-level headers are small mode plates (glyph, `Mode`, title, back action).
  Do not repeat the wordmark inside a page header; the shell owns it.
- Shell widths: app `max-w-7xl`; home/profile/boards `max-w-5xl`–`max-w-6xl`;
  game and room detail `max-w-3xl`. Cards stack before they shrink.
- Public leaderboards use the shell but show a `Sign in` action instead of the
  player/logout cluster.

## 5. Component inventory

| Component | File | Notes |
|---|---|---|
| `AppHeader` | `components/layout/AppHeader.tsx` | Sticky cabinet nav + mobile dock; session chip and logout. |
| `Wordmark` | `components/ui/Wordmark.tsx` | Prism badge, joined `ChromaMatch` display word, spectrum underline. |
| `TestStrip` | `components/ui/TestStrip.tsx` | Six-well calibration film with a dashed `?`; brand flourish only. |
| `ModeGlyph` | `components/ui/ModeGlyph.tsx` | Enamel arcade pin, 48/64 px, silhouette + mini-scene. Decorative, so always render the mode name. |
| `Button` | `components/ui/Button.tsx` | `primary/secondary/outline/ghost/danger` × `sm/md/lg/icon`; hard keycap lip and press. |
| `Input` | `components/ui/Input.tsx` | Recessed well, mono label, icon + text error. |
| `Card` | `components/ui/Card.tsx` | Panel with ink border, offset print shadow and optional interactive lift. |
| `Modal` | `components/ui/Modal.tsx` | Focus trap, Escape, backdrop close, mobile sheet, spectrum top bar. |
| `Toast` | `components/ui/Toast.tsx` | Shape + icon + title; no status prefix text. |
| `Spinner` | `components/ui/Spinner.tsx` | Aperture ring; stops under reduced motion. |
| `ErrorMessage` | `components/ui/ErrorMessage.tsx` | Icon + title + message + optional retry. |
| `EmptyState` | `components/ui/EmptyState.tsx` | Dashed empty tray with an optional next action. |
| `Celebration` | `components/ui/Celebration.tsx` | Result-screen stamp: tag + shape + icon + text. |
| `ScoreCountUp` | `components/ui/Celebration.tsx` | Integer-tenths count-up; instant final value under reduced motion / SSR. |
| `AuthCabinet` | `components/auth/AuthCabinet.tsx` | Shared access-terminal shell for login/register. |
| `ClickSpark` | `components/ui/ClickSpark.tsx` | ReactBits-adapted canvas click burst; decorative, reduced-motion-safe. |
| `ThemeToggle` | `components/ui/ThemeToggle.tsx` | Persisted light/dark override; system is the default. |
| `GameStage` | `components/game/GameStage.tsx` | Fixed neutral stage; HUD, countdown, content, optional footer. |
| `ColorSwatch` | `components/game/ColorSwatch.tsx` | Display-only HSV swatch; sizes `sm/md/lg/reveal/canvas/fill`. |
| `RevealCountdown` | `components/game/RevealCountdown.tsx` | Achromatic timer + segmented bar used by `GameStage`. |
| `HsvSliders` | `components/game/HsvSliders.tsx` | Guess dock: three vertical ramps + live canvas, mono readouts. |
| `RoundProgress` | `components/game/RoundProgress.tsx` | Three-slot round rail; completion uses a check + text. |
| `ChannelDiffBars` | `components/game/ChannelDiffBars.tsx` | H/S/V miss meters with visible numeric values. |
| `RoundScoreReveal` | `components/game/RoundScoreReveal.tsx` | Per-guess server score: split target/mix wells, grade sticker, score cells, next action. |
| `GameResult` | `components/game/GameResult.tsx` | Dark score header, split target/guess wells, deltas, notices and actions. |
| `GameView` | `components/game/GameView.tsx` | Shared phase shell for Global, Daily and Room. |
| `GlobalGameView` / `DailyGameView` | `components/game/*GameView.tsx` | Thin mode wrappers. |
| `GlobalCabinet` | `components/home/HomePanels.tsx` | Home hero cabinet with a decorative 5.0 s readout and the Global CTA. |
| `DailyCard` | `components/home/DailyCard.tsx` | Live Daily ticket: today's best, streak, reset countdown. |
| `RoomsCard` / `BoardsCard` / `ProfileCard` | `components/home/HomePanels.tsx` | Home mode cards; asymmetric grid. |
| `LeaderboardView` | `components/leaderboard/LeaderboardView.tsx` | Public board: marquee hero, tabs, date picker, pagination, states. |
| `LeaderboardTable` | `components/leaderboard/LeaderboardTable.tsx` | Dark high-score table; viewer row labelled `You`. |
| `RankBadge` | `components/leaderboard/RankBadge.tsx` | Number + medal cue; `tone="screen"` for dark boards. |
| `YourRankCard` | `components/leaderboard/YourRankCard.tsx` | Viewer rank/score card, rendered only when `me` exists. |
| `StatsCards` | `components/profile/StatsCards.tsx` | Four meters with accent rails and one-decimal scores. |
| `AchievementGrid` | `components/profile/AchievementGrid.tsx` | Badge plaques with earned/locked labels and criteria. |
| `TrendChart` / `AccuracyChart` / `HueRegionChart` | `components/profile/*.tsx` | Recharts panels; tokens for axes and series. |
| `HistoryList` | `components/profile/HistoryList.tsx` | Ticket-style rows; room attempts set apart; expandable rounds. |
| `ProfileView` | `components/profile/ProfileView.tsx` | Player card, stats, charts, badges and logbook. |
| `RoomPanel` | `components/rooms/RoomPanel.tsx` | Room link-up: LED code, settings plates, lobby/in-progress/finished states. |
| `RoomCreateForm` / `JoinForm` | `components/rooms/*.tsx` | Keycap option groups and recessed inputs; shared Zod validation. |
| `LobbyMemberList` | `components/rooms/LobbyMemberList.tsx` | Player ports with Host/You tags. |
| `RoomScoreboard` | `components/rooms/RoomScoreboard.tsx` | Dark room standings; ranked/unranked and `You` labels. |
| `RoomResult` | `components/rooms/RoomResult.tsx` | Shared result layout with room summary and next/back action. |
| `AdminNavLink` | `components/admin/AdminNavLink.tsx` | Admin-only header link; renders nothing for players. |
| `AdminUsersView` / `AdminUserView` | `components/admin/*.tsx` | Roster and player record screens; table and stats editor. |

## 6. Surfaces and utilities

Use these classes instead of re-inventing borders, shadows or screens:

- `.cm-keycap` (+ `-primary/-secondary/-outline/-danger`) — physical button.
- `.cm-cabinet` — large panel with offset shadow, used for heroes and game shells.
- `.cm-console-card` — standard panel shadow.
- `.cm-marquee` — dark marquee with a spectrum top bar and perforation dots.
- `.cm-led-well` — recessed dark readout for scores, timers, room codes.
- `.cm-screen` — dark score screen for tables and high-score surfaces.
- `.cm-score-table` — dark table typography, hover and viewer row.
- `.cm-ticket`, `.cm-sticker`, `.cm-rule`, `.cm-eyebrow`, `.cm-display`, `.cm-stencil`.
- `.cm-stage-bezel` — physical surround for the fixed stage.
- `.cm-countdown-track` — achromatic timer ticks.
- `.cm-ramp-slider` — functional HSV faders inside the stage.
- `.cm-spectrum-bar`, `.cm-test-strip`, `.cm-mode-token`, `.cm-halftone`,
  `.cm-speaker`, `.cm-barcode`, `.cm-darkroom-grid` (legacy alias for the auth grid).
- `.cm-rise`, `.cm-pop`, `.cm-blink` — chrome entrance/blink motion; never stage motion.

The hard offset shadow is part of the brand. Soft blur is reserved for overlays.
Do not add `rounded-full` to every panel; the cabinet uses small-to-medium radii.

## 7. Layout and copy

- Mobile-first: 360 px minimum, 44 px targets, cards stack before they shrink.
  Keep the mobile bottom dock clear with shell padding.
- Home is an attract screen, not a dashboard: one headline, one rule line, the
  Global cabinet, then Daily / Rooms / Boards / Profile.
- One job per label. Buttons keep their name through the flow. Avoid cute
  status copy, fake data and extra taglines.
- Voice: direct and dry, with arcade warmth. Prefer "Play Global", "Same palette
  for everyone today" and "Your best score of the day counts." over jokes.
- Empty states invite the next action; errors say what happened and what to do.

## 8. Game round language (all modes)

Every mode uses the same four-beat rhythm. Daily and Room may change the source
of the colours, the timer and the notices, but never the visual grammar.

```
IDLE / intro ──► REVEAL ──► GUESS ──► ROUND SCORE ──► next round / RESULT
```

1. **Intro.** A dark marquee, a mode glyph, a short headline, three spec plates
   and one primary action. Brand flourishes live here, outside the stage.
2. **Reveal.** `.cm-stage-bezel` frames `<GameStage>`. The target is a full-canvas
   `<ColorSwatch>` (`size="canvas"`, `frame="none"`); only the achromatic HUD,
   countdown and round rail accompany it. The target must unmount when the
   reveal ends — never use `display: none` or opacity.
3. **Guess.** The stage becomes a colour dock: `<HsvSliders>` shows the live mix
   as a large canvas and three vertical functional ramps. Use the stage-styled
   submit keycap in the footer; do not introduce a second primary action.
4. **Round score.** After each guess, `<RoundScoreReveal>` shows the stateless
   server preview: a big count-up, a 10-cell score strip, a grade sticker, the
   split target/mix wells and the channel deltas. Near-perfect rounds get a
   colour burst. The player advances with **Next round** or **See total**; a
   failed preview never blocks the game.
5. **Result.** `<GameResult>` owns the dark score header, PB/achievement notices
   and the full split round breakdown. `<ChannelDiffBars>` accompanies each
   round. The result sits outside the stage and may use brand colour,
   celebrations and count-ups.

### 8.1 Reuse map

- **Global:** `GlobalGameView` is the reference implementation.
- **Daily:** reuse `GameStage`, `HsvSliders`, `RoundProgress`, `GameResult` and
  `ChannelDiffBars`. Change only the intro copy, mode label and daily notices.
- **Room:** reuse the same components. Add the room timer through
  `GameStage.countdown` and auto-submit, but keep the stage, dock, round rail
  and result layout identical.
- Do not fork a per-mode slider, result card or reveal panel.

### 8.2 Slider ramp rule

The H/S/V ramps are **functional controls**, not decoration. Hue shows the full
wheel; saturation and value ramp from the current mix to that channel's extreme.
Never use a ramp as a target swatch or as the only carrier of a value. Keep the
mono numeric readout, `aria-valuetext`, native range semantics and Shift+Arrow
step.

### 8.3 Result split well

Target is always the upper half and the player's mix the lower half, separated
by a hard seam. Each half carries a visible label and HSV mono badge. Do not
swap the order between modes.

### 8.4 Motion & effects

- Chrome may move; the stage may not. Entrance rises, card lifts, the live-dot
  pulse, `ClickSpark` and marquee details are all outside the stage.
- `ClickSpark` is adapted from ReactBits. It draws a short canvas burst on
  primary press and is not installed at all under reduced motion.
- Round-score feedback adds: a count-up, a sequential 10-cell fill, a grade
  sticker and an optional colour burst for 9.0+. A near-perfect round (9.5+)
  also gets the slow ReactBits-style star border around the LED score well.
- The Home hero word uses a ReactBits-style shiny-text sweep; it keeps the
  base orange readable and only animates the highlight band.
- Leaderboard, room-scoreboard and history rows use a short staggered entrance
  (`cm-list-row`); this is a list reveal, never a looping effect.
- All of these are skipped or static under reduced motion.
- Do not add ambient motion to the stage, a target swatch or the guess canvas.

## 9. Celebrations

Use `<Celebration>` only on result, room-summary, profile-unlock or other
non-stage screens:

| Kind | Trigger |
|---|---|
| `pb` | Existing Global/Daily PB strictly beaten (`pb.beatExisting`). |
| `achievement` | Newly unlocked achievement(s) returned by submit. |
| `streak` | Daily streak milestone (3, 7, 30). |
| `room-win` | Player finishes first in a room scoreboard. |

Rules:
- Never render inside `<GameStage>` or over a reveal/guess swatch.
- One celebration at a time; queue achievements rather than stacking banners.
- Pair with `<ScoreCountUp>` for the total; never announce the animated value.
- The shape + mono tag + icon + text must remain even when colour is removed or
  motion is reduced.
- Sound is off by default; no sound is part of this design system.

## 10. Styleguide

`/styleguide` (`src/app/styleguide/page.tsx`) is the dev-only workshop. It is a
404 in production. Keep it in sync when adding a primitive, a surface class, a
game state or a celebration. It shows tokens, the type stack, keycaps, forms,
surfaces, mode pins, the stage and result states.

## 11. Deliberate choices

- **System theme by default, explicit override when asked.** Both schemes are
  first-class; the marquee, stage and high-score screens are dark in both.
  `ThemeToggle` persists only the display preference (`cm_theme`).
- **Dark screens as a material.** Leaderboards and room standings use the dark
  high-score material in both themes; that contrast is the arcade screen.
- **The stage is the one fixed surface.** The surrounding cabinet can be loud,
  physical and hard-edged; the stage never is.
- **No fake counts.** Decorative readouts on Home show the rules (3 rounds,
  5.0 s) or pure illustration, never invented player statistics.
