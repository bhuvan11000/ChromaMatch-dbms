# ChromaMatch — Game Design & Architecture

> This document describes the **game** at a high level: what it is, how every mode works, who the users are, and how the pieces fit together. It deliberately contains no code. The database side is in `ChromaMatch_Database_Design.md`.
>
> Status: design is tentative and may change in later phases. Items still undecided are collected in [Section 14](#14-open-items-not-yet-decided).
> All three game modes — **Global, Daily and Custom Room** — are in scope and will be implemented.

---

## Table of contents

1. [What ChromaMatch is](#1-what-chromamatch-is)
2. [How a single round works](#2-how-a-single-round-works)
3. [How a game works](#3-how-a-game-works)
4. [How a round is scored](#4-how-a-round-is-scored)
5. [Game mode 1 — Global](#5-game-mode-1--global)
6. [Game mode 2 — Daily](#6-game-mode-2--daily)
7. [Game mode 3 — Custom Room](#7-game-mode-3--custom-room)
8. [Leaderboards](#8-leaderboards)
9. [Accounts, authentication and roles](#9-accounts-authentication-and-roles)
10. [Player statistics and achievements](#10-player-statistics-and-achievements)
11. [Admin capabilities](#11-admin-capabilities)
12. [Screens and user flow](#12-screens-and-user-flow)
13. [High-level system architecture](#13-high-level-system-architecture)
14. [Open items (not yet decided)](#14-open-items-not-yet-decided)
15. [Decision log](#15-decision-log)
16. [Glossary](#16-glossary)

---

## 1. What ChromaMatch is

ChromaMatch is a **browser-based color-memory game**, inspired by dialed.gg. The player is shown a color for a few seconds, the color is then hidden, and the player has to **recreate it from memory** using sliders. The closer the recreation, the more points they earn.

On top of that core loop, ChromaMatch adds a gamified layer:

- Player accounts (email + password)
- A **global leaderboard** (all-time personal bests)
- A **daily challenge** with its own **daily leaderboard**, where everyone plays the same colors
- **Custom Rooms**: private, configurable sessions where a group of friends all play the same colors and are ranked against each other
- **Achievements** that unlock automatically
- **Streaks** for playing the daily challenge on consecutive days
- An **admin** role for moderating players

Players never face each other head-to-head in real time. In **Global** and **Daily** they play alone and compare scores on leaderboards. In **Custom Room** a group plays the *same* challenge, each at their own pace, and is ranked on a room scoreboard.

---

## 2. How a single round works

A **round** is the smallest unit of play. It always works the same way in every mode:

1. **Reveal (5 seconds).** A target color is displayed on screen for exactly **5 seconds**. This reveal time is the same in all modes.
2. **Hide.** After 5 seconds the target color disappears. From this point the player must rely on memory.
3. **Recreate.** The player adjusts three **HSV sliders** to rebuild the color they remember:
   - **H (Hue)** — range 0 to 360 (degrees around the color wheel)
   - **S (Saturation)** — range 0 to 100
   - **V (Value / brightness)** — range 0 to 100
   - All sliders allow **one decimal place** of precision (for example, H = 214.6).
4. **Submit.** The player confirms their guess.
5. **Result.** The game shows the round's score (0 to 10) along with a breakdown of how far off the guess was on each of H, S and V.

**Time to guess.** In Global and Daily modes there is **no time limit** for step 3 — the player can take as long as they like. In Custom Room the creator can choose a time limit (see Section 7). If a limit is set and the clock runs out, the **slider positions at that moment are submitted automatically** and scored normally.

**Where scoring happens.** The score for a round is calculated by the **server**, not by the player's browser. This prevents anyone from faking a score on a leaderboard.

---

## 3. How a game works

A **game** (called an **attempt** in Custom Room) is exactly **3 rounds** played back to back. This is true for all three modes.

- Each round awards **0 to 10 points** (one decimal place).
- The **game score** is the **sum of the three round scores**, so it ranges from **0 to 30**.
- A game only "counts" once all three rounds have been submitted.

**Incomplete games are discarded.** If a player quits, closes the tab, or otherwise leaves before submitting all three rounds, **nothing is saved** for that game — no score, no history. There is no "resume later". Because of this, the player's browser holds the in-progress rounds locally and sends the **entire completed game to the server in one go** at the end.

In Global and Daily, players may play **as many games as they want**. In Custom Room, the number of attempts is fixed by the room (3 or 5).

---

## 4. How a round is scored

The score compares the **target color** with the player's **guess**, both expressed in HSV. It is intentionally simple (a weighted Euclidean distance) rather than a perceptual color-science formula.

In plain language:

1. **Hue difference.** Hue is a circle (359° is right next to 1°), so the difference is the *shorter way around* the circle. That value is divided by 180 so it becomes a number between 0 and 1.
2. **Saturation difference.** The absolute difference divided by 100 (a number between 0 and 1).
3. **Value difference.** The absolute difference divided by 100 (a number between 0 and 1).
4. **Combine.** The three differences are combined as a **weighted Euclidean distance**: square each difference, multiply by its weight, add them up, take the square root. The three weights add up to 1. To start, all three weights are equal (one third each). They can be tuned later — for example giving hue slightly more weight, since hue errors are usually the most noticeable.
5. **Convert to points.** `round score = 10 × (1 − combined distance)`, clamped so it never goes below 0 or above 10, then rounded to one decimal place.

Consequences:

- A perfect match scores 10.0.
- The worst possible guess scores 0.0.
- The score does not depend on how long the player took (the only time effect is the Custom Room time limit described above).

The result screen shows the round score and how far off the guess was on each of H, S and V.

---

## 5. Game mode 1 — Global

**Purpose:** the "always available" mode, used to build an all-time personal best and climb the global leaderboard.

**Rules**

- 3 rounds per game, 0–10 points per round, game score 0–30.
- **Colors are completely random.** Every round of every game uses a freshly generated random color, independently for every player and every game.
- **No timer** — unlimited time to guess (after the 5-second reveal).
- **Unlimited games** — a player can play as many times as they want.

**Personal best (PB) logic**

Each player has exactly one **global personal best**: the highest game score (sum of 3 rounds) they have ever achieved in Global mode.

- When a Global game finishes, its total is compared with the player's current PB.
- If the new total is **strictly greater** than the current PB (or the player has no PB yet), it becomes the new PB, and the time it was achieved is recorded.
- If the new total is **less than or equal to** the current PB, **nothing changes** — the player's PB and leaderboard position stay exactly as they were.

**Leaderboard position** is determined only by PB, so a bad game never hurts a player's rank.

---

## 6. Game mode 2 — Daily

**Purpose:** a fair, shared daily competition — everyone is judged on the same colors.

**Rules**

- Same structure as Global: 3 rounds, 0–10 per round, game score 0–30, no timer, unlimited games.
- **The day's colors are the same for every player.** Each day has a set of **exactly 3 target colors**.
- **Colors are generated automatically**, using a random generator **seeded by the date**. Because the seed is the date, the same day always yields the same three colors, and no admin has to curate anything.
- **Order is shuffled per player.** Everyone gets the same three colors, but each player sees them in their own random order (for example, one player might see color B, then A, then C, while another sees A, C, B). Each color is revealed only in its own round, for 5 seconds, just like dialed.gg.
- Because the same three colors are involved, every player's game score for the day is comparable.

**Daily reset**

- The daily challenge resets at **midnight UTC**. A "day" is a UTC calendar date everywhere in the world, regardless of the player's local time zone.
- Each day is a **completely independent competition**: yesterday's daily PB and ranking do not carry over; every player starts the new day with no daily PB.
- Past days' challenges, colors and results are **kept** (not deleted), so historical daily leaderboards remain possible.

**Daily personal best**

- Each player has one **daily PB per day**: the best game score they achieved on that day's challenge.
- The same rule as Global applies: a new total only replaces the day's PB if it is strictly greater; otherwise nothing changes.

**Streaks**

- A player's **daily streak** is the number of **consecutive UTC days** on which they completed at least one Daily game.
- Missing a day resets the streak (the next Daily game starts a new streak at 1).
- The game remembers both the **current streak** and the **longest streak** ever reached.

---

## 7. Game mode 3 — Custom Room

**Purpose:** let a group of friends play the same challenge together in a private session and see who does best.

### 7.1 Creating a room

Any logged-in player can create a room and chooses:

| Setting | Options |
|---|---|
| **Room size** | The maximum number of players. At least 2. (An upper limit is still to be decided — see Section 14) |
| **Timer per round** | **No timer**, **5 seconds**, **10 seconds**, or **15 seconds**. This is the time limit to submit a guess *after* the 5-second reveal |
| **Attempts** | **3 or 5.** One *attempt* is one full 3-round game. The number of rounds per attempt is always 3, as in every other mode. There is **no infinite option** in rooms |

On creation the system generates a unique **room code / link**. The creator is automatically the first member of the room.

### 7.2 Lobby (before the game starts)

- Rooms are **private**. Others join **only through the room code / link**. There is **no public list** of rooms to browse.
- Players can join **only while the room is in the lobby**. **Once the creator starts the room, nobody else can join.**
- Players can leave the lobby freely. If the **creator** leaves the lobby, the room is cancelled (assumption — see Section 14).
- The room cannot hold more players than the chosen room size.
- The **creator starts the room manually**, and only when **at least 2 players** are in it. It does not start automatically, even when full.
- At the moment of starting, the room's **3 shared target colors are generated** (random) and fixed for the whole session.

### 7.3 Playing

- **Everyone in the room plays the same 3 colors** (as in Daily), so scores are directly comparable.
- The colors are **shuffled per player**: each player sees the same three colors in their own order.
- Each player plays their allowed number of attempts (3 or 5), each attempt being 3 rounds, with the 5-second reveal in every round.
- Players play **independently, at their own pace** — rounds are not synchronized between players (assumption — see Section 14). Players may be at different attempts at the same moment.
- **Timed rooms:** if a time limit was chosen and it runs out during the guessing step of a round, the **slider positions at that moment are submitted automatically and scored normally**. The player is not penalized beyond having committed to whatever they had set.
- An attempt **counts only when all 3 rounds are submitted**. Each completed attempt uses up one of the player's attempts.

### 7.4 Ranking inside a room

- A player's room score is their **best attempt**: the highest 3-round total among their completed attempts.
- As elsewhere, a later attempt only replaces the best if it is **strictly greater**.
- The room scoreboard ranks players by that best score. **Ties are ranked arbitrarily.**
- A player who has not completed any attempt has no score yet and is shown at the bottom without a rank.

### 7.5 Leaving a room mid-game

- If a player **leaves or disconnects after the room has started**, they **forfeit their remaining attempts** but **keep the best score they already achieved**.
- An attempt that was in progress at that moment is **discarded** (incomplete games are never saved).
- A player cannot rejoin once they have left, because joining is only possible in the lobby.

### 7.6 How a room ends

- A player is **done** when they have used all their attempts or have left.
- The room **ends automatically when every player is done**. Final standings are shown.
- Finished rooms and their final standings are kept (assumption — see Section 14).

### 7.7 Room games are separate from everything else

Custom Room games **do not affect any overall statistic**:

- They do **not** change the Global PB or any Daily PB.
- They do **not** count toward the daily streak.
- They do **not** count toward total games played.
- They do **not** unlock achievements.

A room has its own scoreboard only. The full round-by-round record of room attempts is still kept in the game history log, marked as room games (see the database document).

---

## 8. Leaderboards

| Leaderboard | Ranks players by | Scope | Resets? |
|---|---|---|---|
| **Global leaderboard** | Each player's global PB (best Global game score) | All-time | Never |
| **Daily leaderboard** | Each player's daily PB for that day's challenge | One UTC day | A new, independent leaderboard every day; old ones are kept |
| **Room scoreboard** | Each player's best attempt in that room | One room | Per room; only members of the room can see it |

Key properties:

- **Rankings are computed, not stored.** A player's rank is worked out from stored personal bests whenever a leaderboard is requested. This means ranks can never become stale or inconsistent, and there is no separate "leaderboard" data to maintain.
- **Ties are ranked arbitrarily.** If two players have the same score, no special tie-break rule is applied.
- **Banned players are hidden** from the Global and Daily leaderboards. Their data is kept (see Section 11).
- A player's PB changes only when they beat it, so their position only ever improves through their own play (other players overtaking them can still push them down).

---

## 9. Accounts, authentication and roles

**Sign-in.** Players register and log in with **email and password** only. Authentication is **built and managed by the project itself** inside the database (no third-party login providers). Passwords are **never stored in plain text** — only a secure hash is stored.

**Profile basics.** Each account has a username, an email, a role, a ban flag and a creation time, plus the statistics described in Section 10.

**Roles** (the project requires at least two):

| Role | What they can do |
|---|---|
| **Player** | Register, log in, play Global and Daily, create and join Custom Rooms, view leaderboards, view their own stats and achievements |
| **Admin** | Everything a player can do, plus the moderation tools in Section 11 |

---

## 10. Player statistics and achievements

### Statistics tracked per player

- Global personal best (and when it was achieved)
- Daily personal bests (one per day played)
- Total number of completed games (**Global + Daily only**; Custom Room attempts are not counted)
- Current daily streak and longest daily streak
- The date of the player's last Daily game

Beyond these counters, **every completed game** (including Custom Room attempts) is also recorded in full in a history log — target colors, guessed colors and scores for each round — used for deeper statistics and for admins to review a player's history. See the database document.

### Achievements

Achievements are **awarded automatically by the system** right after a Global or Daily game is completed. Players cannot claim them manually, and admins do not hand them out. An achievement can be earned **only once** per player. Custom Room games never unlock achievements.

The achievement types the game supports:

| Type | Awarded when | Examples |
|---|---|---|
| **Milestones** | The player's total completed games reaches a number | "Play 10 games", "Play 100 games" |
| **Score-based** | A round or game reaches a score condition, e.g. a round at or above a given score ("perfect round"), or the player beats their existing PB | "Perfect round", "New personal best" |
| **Streaks** | The player's daily streak reaches a length | "3-day streak", "7-day streak" |
| **Mode-based** | The player completes their first game in a mode (Global or Daily) | "First Daily game", "First Global game" |

The examples above are illustrative; the exact list of achievements and their thresholds is still to be finalized. Each achievement has a name, a description for players to read, and a precise rule the system can check automatically.

---

## 11. Admin capabilities

Admins can:

1. **View players** and their statistics.
2. **Edit player stats** (for example, correct or reset a personal best or a counter).
3. **Ban and unban players.**

**What a ban does:**

- A banned player's entries are **hidden from the Global and Daily leaderboards**.
- **All their data is kept** — nothing is deleted.
- A ban is **reversible**: unbanning restores them to the leaderboards.

Admins do **not** create or edit achievements (the achievement list is prepared by the developers). The detailed admin workflows are intentionally left for later.

---

## 12. Screens and user flow

The exact UI will be finalized during application development; this is the intended flow.

```
Register / Login
      │
      ▼
   Home
      │
      ▼
 Mode Select ──► Global ──────────┐
      │                           │
      ├────────► Daily ───────────┤
      │                           │
      └──► Custom Room            │
              ├─ Create room ──► Lobby ──► (creator starts)
              └─ Join with code ─► Lobby ──┘        │
                                                    │
                          ┌─────────────────────────┘
                          ▼
        Round 1 → Round 2 → Round 3   (one game / attempt)
          (each: 5s reveal → hide → HSV sliders → submit,
           with the countdown in timed rooms)
                          │
                          ▼
        Game Result (round scores, per-channel breakdown, total;
                     new-PB / achievement notices for Global & Daily)
                          │
                          ▼
        Global / Daily:  Leaderboard
        Custom Room:     next attempt, or Room scoreboard when done
```

Other expected screens: player profile (stats, streaks, achievements), the global and daily leaderboard pages, the room lobby (member list, room settings, Start button for the creator), the room scoreboard, and an admin panel (player list, stats editing, ban/unban).

---

## 13. High-level system architecture

```
┌──────────────────────────────────────────────┐
│                 Web browser                  │
│   Next.js frontend: game screens, sliders,   │
│   leaderboards, rooms, profile, admin panel  │
└──────────────────────┬───────────────────────┘
                       │ HTTP requests
┌──────────────────────▼───────────────────────┐
│        Next.js backend (API route handlers)  │
│  authentication · target-color generation ·  │
│  server-side scoring · game submission ·     │
│  leaderboards · room management · admin      │
└───────────┬──────────────────────┬───────────┘
            │                      │
┌───────────▼───────────┐ ┌────────▼────────────┐
│ PostgreSQL (SQL)      │ │ MongoDB (NoSQL)     │
│ Accounts, roles,      │ │ Full history of     │
│ personal bests, daily │ │ every completed     │
│ challenges, rooms and │ │ game/attempt (round │
│ their members, stats  │ │ by round)           │
│ counters, achievements│ │                     │
└───────────────────────┘ └─────────────────────┘
```

**Technology**

- **Frontend:** Next.js
- **Backend/API:** Next.js route handlers (the browser never talks to a database directly)
- **Databases:** PostgreSQL (SQL) and MongoDB (NoSQL)
- **Version control:** Git + GitHub
- **Configuration:** database credentials and secrets live in environment variables, never in source code

**Rooms and live updates.** Players in a room play independently, so rooms do not need real-time synchronization. The lobby (who has joined, whether the room has started) and the room scoreboard are expected to refresh by periodic polling. This is an assumption (Section 14).

**Why two databases (short version)**

- **PostgreSQL** holds the data that has real relationships and must stay correct: accounts, personal bests, daily challenges, rooms and room members, achievements. A game result must update several of these together or not at all, which is what SQL transactions are for.
- **MongoDB** holds the full history of every completed game and room attempt: a large, ever-growing, append-only log of round-by-round documents whose shape varies by mode. This does not need relational integrity, and statistics are computed from it with aggregation.
- A **vector database is not used**. The project requirement lists it as optional, and nothing in this game needs similarity search.

**Key design principle.** Leaderboard, PB and room-score data (small, authoritative, must be exactly right) live in Postgres; the bulky history lives in Mongo. If the history log ever failed to record a game, leaderboards, room scoreboards and stats would still be correct.

---

## 14. Open items (not yet decided)

| # | Item | Notes |
|---|---|---|
| 1 | Custom Room: maximum room size | Minimum is 2; no upper limit chosen yet |
| 2 | Custom Room: what happens if the **creator** leaves during the lobby | Current assumption: the room is cancelled. After the room has started, the creator is just another player |
| 3 | Custom Room: players are **not** synchronized — each plays at their own pace | Assumption |
| 4 | Custom Room: whether players can see live standings while the room is in progress, or only at the end | Not decided |
| 5 | Custom Room: how long finished rooms and their standings are kept | Current assumption: kept indefinitely, like past daily challenges |
| 6 | Custom Room: cleanup of lobbies that are abandoned without starting | Not decided (e.g., auto-cancel after some inactivity) |
| 7 | Custom Room: whether banned players appear in room scoreboards | Not decided |
| 8 | Custom Room: how strictly the server verifies timers (the countdown runs in the browser) | Not decided |
| 9 | Whether the **shuffled color order** (Daily and Room) is fixed per player or re-shuffled for each game/attempt | Not decided |
| 10 | Whether a banned player can still log in and play (their scores are hidden regardless) | |
| 11 | Which day a Daily game belongs to if it starts before and finishes after midnight UTC | Suggested: the day it started |
| 12 | Starting position of the HSV sliders at the beginning of each round (fixed default vs. random) | |
| 13 | Precision of round scores: currently assumed to be one decimal place | |
| 14 | The exact list of achievements, their names and thresholds | |
| 15 | Admin workflows in detail, including whether admin stat edits should be logged in an audit trail | An audit log is optional and undecided |
| 16 | Constraints on random Global colors (fully uniform vs. avoiding near-black/near-white/near-gray) | Currently: fully random |
| 17 | Tuning of the scoring weights (currently equal weights for H, S, V) | |
| 18 | Whether rooms update by polling or by a push mechanism | Assumed: polling |

---

## 15. Decision log

| Area | Decision |
|---|---|
| Game type | No real-time head-to-head; Global and Daily are solo; Custom Room is a shared challenge played independently |
| Modes | Global, Daily, Custom Room — all three implemented |
| Game structure | 3 rounds per game/attempt; 0–10 points per round; 0–30 per game |
| Reveal | Target color shown for 5 seconds at the start of each round, in all modes |
| Input | HSV sliders (H 0–360, S 0–100, V 0–100), one decimal place |
| Timers | Global/Daily: none. Custom Room: none / 5 s / 10 s / 15 s |
| Timer expiry (rooms) | Current slider position is auto-submitted and scored normally |
| Scoring | Server-side; weighted Euclidean distance over H (circular), S, V mapped to 0–10 |
| Global colors | Completely random |
| Daily colors | 3 shared colors per day, auto-generated from a date seed; order shuffled per player |
| Daily reset | Midnight UTC; each day independent; history kept |
| PB rule | New total must be strictly greater than the current PB to replace it (applies to Global, Daily and room best) |
| Rankings | By PB / best attempt; computed on demand; ties arbitrary |
| Incomplete games | Discarded; whole game submitted in one go |
| Replays | Unlimited in Global and Daily |
| Room settings | Size (≥ 2), timer (none/5/10/15 s), attempts (3 or 5; no infinite) |
| Room access | Private code/link; join only in the lobby; no public list |
| Room start | Creator starts manually, needs at least 2 players; colors generated at start |
| Room colors | Same 3 colors for everyone, shuffled per player |
| Room ranking | Best attempt per player; ties arbitrary |
| Room leaving | Forfeit remaining attempts, keep best score so far; no rejoin |
| Room end | Automatically when every player has used all attempts or left |
| Room vs. stats | Room games do not affect PBs, streaks, games-played count or achievements |
| Authentication | Email + password, self-managed, hashed passwords |
| Roles | Player, Admin |
| Bans | Hidden from Global/Daily leaderboards, data kept, reversible |
| Achievements | Automatic; milestone, score-based, streak and mode-based types; Global/Daily games only |
| Admin powers | View players, edit stats, ban/unban |
| Databases | PostgreSQL + MongoDB; no vector database |

---

## 16. Glossary

- **Round** — one target color: 5-second reveal, then recreate and submit.
- **Game / attempt** — 3 rounds; the unit that produces a score out of 30. "Attempt" is the term used inside Custom Rooms.
- **PB (personal best)** — a player's highest game score in a given scope (global, or one day).
- **Best attempt** — a player's highest attempt score within one Custom Room.
- **HSV** — Hue, Saturation, Value: the color model used by the sliders.
- **Reveal** — the 5 seconds during which the target color is visible.
- **Daily challenge** — the shared set of 3 colors for one UTC day.
- **Streak** — consecutive UTC days with at least one completed Daily game.
- **Room code** — the short code (or link) used to join a private Custom Room.
- **Lobby** — the waiting phase of a Custom Room before the creator starts it.
- **Forfeit** — leaving a room mid-game: remaining attempts are lost, the best score so far is kept.
