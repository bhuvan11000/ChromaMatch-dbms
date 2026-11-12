# ChromaMatch — Database Viva Guide

> **Who this is for:** you and your teammate, preparing to explain the database part of
> ChromaMatch in a viva. No prior reading of the code is assumed.
>
> **How to use it:** read sections 0–4 once, then practise section 10 (Q&A) out loud.
> Section 9 gives copy-paste demo commands. Section 11 is the last-minute cheat sheet.
>
> **Honesty note:** this guide describes the code as it actually exists in the repository,
> including the small differences from the original design document. Those differences are
> listed in section 12.

---

## Table of contents

0. [The 30-second answer](#0-the-30-second-answer-memorise-this)
1. [The big picture](#1-the-big-picture)
2. [The nine PostgreSQL tables in plain English](#2-the-nine-postgresql-tables-in-plain-english)
3. [ER model for the viva](#3-er-model-for-the-viva)
4. [Keys, constraints and integrity](#4-keys-constraints-and-integrity)
5. [Advanced database features (the course checklist)](#5-advanced-database-features-the-course-checklist)
6. [The main data flows](#6-the-main-data-flows)
7. [MongoDB — the history database](#7-mongodb--the-history-database)
8. [Concurrency, consistency and security](#8-concurrency-consistency-and-security)
9. [Demo commands with expected output](#9-demo-commands-with-expected-output)
10. [Viva questions and answers](#10-viva-questions-and-answers)
11. [Last-minute cheat sheet](#11-last-minute-cheat-sheet)
12. [Known limitations and honest answers](#12-known-limitations-and-honest-answers)
13. [Where each thing lives in the repo](#13-where-each-thing-lives-in-the-repo)

---

## 0. The 30-second answer (memorise this)

> ChromaMatch is a colour-matching game. It uses **two databases**.
> **PostgreSQL** is the **system of record**: accounts, personal bests, daily challenges,
> streaks, achievements and rooms — anything that must be correct and relational.
> **MongoDB** is an **append-only history log**: one document per completed game or room
> attempt, used for stats and trends.
> The PostgreSQL side has **9 tables**, **12 functions**, **2 procedures**, **3 triggers**,
> **3 views** and **20 indexes**. Every state change goes through **one SQL function or
> procedure call**, so it is atomic. PostgreSQL is written first and is authoritative;
> MongoDB is written afterwards, best-effort.
> The client never sends scores or target colours — the server computes scores and the
> target colours travel inside a **signed game token**. So leaderboards cannot be faked.

If you remember only one sentence:

> **PostgreSQL decides the truth; MongoDB remembers the story.**

---

## 1. The big picture

### 1.1 Two databases, two jobs

| | **PostgreSQL** | **MongoDB** |
|---|---|---|
| Type | Relational / SQL | Document / NoSQL |
| Role | System of record | History log |
| Stores | users, personal bests, daily challenges, colours, streaks, achievements, rooms, room members, room scores | one document per **completed** game or room attempt |
| Must be correct? | Yes — drives leaderboards and achievements | It is supplementary; losing a document does not break rankings |
| Write pattern | Insert + update, inside transactions | Insert once, never updated |
| Used for | rankings, PBs, counters, permission checks | profile charts, recent history, analytics |
| **Never** used for | — | leaderboards, PBs, room scoreboards, achievement decisions |

The one-line reason:

- **PostgreSQL** gives us **foreign keys, unique constraints, CHECK constraints and
  multi-table transactions**. Account and score data needs all four.
- **MongoDB** gives us a **naturally nested, flexible, append-only document**. A game
  *contains* its three rounds, so one document is a complete, self-contained record.
  It also gives us **aggregation pipelines** for statistics.

### 1.2 Why not one database?

- If history lived in PostgreSQL, we would need ever-growing `games` and `rounds` tables
  purely for analytics, with no integrity benefit.
- If accounts and rooms lived in MongoDB, we would lose foreign keys, cross-collection
  uniqueness and multi-table atomic transactions — exactly what this data needs.

### 1.3 What we deliberately do **not** store

This is a favourite viva question.

| Not stored | Why | How we get it instead |
|---|---|---|
| Leaderboard ranks | A rank goes stale the moment a score changes; storing it duplicates data | Computed at query time by `VIEW`s with `ROW_NUMBER()` |
| Every Global/Daily game in PostgreSQL | They are analytics history, not authoritative state | Only the current best is kept in PostgreSQL; full games go to MongoDB |
| RGB / hex colours | HSV is the game's native model and the scoring space; RGB would be a derived, lossy duplicate | Converted by the application only for display |
| Room scoreboard table | Same reason as leaderboards — it is a sorted view of `room_players` | `room_scoreboard` view |
| Audit table for admin edits | Deliberately not added; an optional design item | Structured `admin_action` log line (section 8.4) |

### 1.4 One-screen diagram

```
                 Next.js API (server-side only)
                    │                    │
                    ▼                    ▼
        ┌────────────────────┐   ┌────────────────────┐
        │    PostgreSQL      │   │      MongoDB       │
        │  system of record  │   │   history log      │
        │                    │   │                    │
        │  users             │   │  game_history      │
        │  daily_challenges  │   │  (1 collection)    │
        │  challenge_colors  │   │                    │
        │  daily_personal_   │   │  one document =    │
        │    bests           │   │  one completed     │
        │  achievements      │   │  game / attempt    │
        │  user_achievements │   │                    │
        │  rooms             │   │  logical links:    │
        │  room_colors       │◄──┤  user_id,          │
        │  room_players      │   │  daily_challenge_id│
        └────────────────────┘   │  room_id           │
                                 └────────────────────┘
```

The links from MongoDB to PostgreSQL (`user_id`, `daily_challenge_id`, `room_id`) are
**logical links** enforced by the application, not real foreign keys. A foreign key cannot
span two different database engines.

---

## 2. The nine PostgreSQL tables in plain English

Think of the tables in **four families**:

| Family | Tables | What it answers |
|---|---|---|
| Players | `users` | Who is playing, what is their best, what is their streak? |
| Daily challenge | `daily_challenges`, `challenge_colors`, `daily_personal_bests` | What are today's 3 colours and who scored what? |
| Achievements | `achievements`, `user_achievements` | What can be unlocked, and who unlocked it? |
| Custom rooms | `rooms`, `room_colors`, `room_players` | Who created which room, with what settings, and who scored what? |

A useful reading rule: a **table** is a spreadsheet, a **row** is one record, a **column**
is one fact, a **primary key** uniquely identifies a row, and a **foreign key** points to a
row in another table.

---

### 2.1 `users`

**One row = one account** (player or admin).

| Column | Meaning | Important rule |
|---|---|---|
| `user_id` | Internal id | `BIGINT` identity, primary key |
| `username` | Display name | `NOT NULL`; unique; also unique ignoring case |
| `email` | Login id | `NOT NULL`; unique; the app lower-cases it before saving |
| `password_hash` | Argon2id hash | Never the plain password |
| `role` | `player` or `admin` | `CHECK` constraint |
| `is_banned` | Hidden from Global/Daily leaderboards | Default `false` |
| `created_at` | Registration time (UTC) | Default `now()` |
| `global_best_score` | Best Global game ever, 0–30 | Nullable until the first Global game |
| `global_best_achieved_at` | When that best was set | Must be null exactly when the score is null |
| `total_games_played` | Completed Global + Daily games | Room attempts are **not** counted |
| `current_daily_streak` | Consecutive UTC days with a completed Daily | Never negative |
| `longest_daily_streak` | Best streak ever | Must be ≥ current streak |
| `last_daily_played_date` | UTC date of the most recent completed Daily | Nullable |

**Why the stats live here:** PostgreSQL cannot read MongoDB when it is awarding
achievements, so the counters needed for achievement rules must live in PostgreSQL.
This is intentional **denormalisation**: the counters are a cache of facts derived from
games, maintained by the submission functions.

**Global personal best rule:** a new Global score replaces the stored PB only if it is
**strictly greater** (or the player had no PB). A bad game can never lower your rank.

---

### 2.2 `daily_challenges`

**One row = one day's challenge.**

| Column | Meaning | Rule |
|---|---|---|
| `daily_challenge_id` | Internal id | `BIGINT` identity, PK |
| `challenge_date` | The UTC date | `UNIQUE` — exactly one challenge per date |
| `created_at` | When the row was created | Default `now()` |

**Why a separate table?** The date is the identity of a daily challenge. Putting the date on
each colour would repeat it three times and allow two different challenges for the same day.
The `UNIQUE` constraint makes that impossible.

**How today is created:** lazily, on the first request that needs it, by
`ensure_daily_challenge`. There is no scheduled job. The application generates the three
colours from a **date-seeded** generator and passes them to the function, which stores them.
The database row is always the source of truth afterwards.

---

### 2.3 `challenge_colors` (weak entity)

**One row = one colour of one day's challenge.** There are exactly 3 rows per challenge.

| Column | Meaning | Rule |
|---|---|---|
| `daily_challenge_id` | Which challenge | Part of the **composite PK**, FK → `daily_challenges` `ON DELETE CASCADE` |
| `round_number` | Which colour: 1, 2 or 3 | Part of the **composite PK**, `CHECK` 1–3 |
| `hue` | Hue in degrees | `NUMERIC(4,1)`, `CHECK` 0–360 |
| `saturation` | Saturation percent | `NUMERIC(4,1)`, `CHECK` 0–100 |
| `value` | Brightness percent | `NUMERIC(4,1)`, `CHECK` 0–100 |

The **composite primary key** `(daily_challenge_id, round_number)` gives two guarantees:

1. One colour per round per challenge (no duplicates).
2. At most three colours per challenge.

"**Exactly** three" is guaranteed by the creation function inserting the day and its three
colours together in one transaction. A row-level `CHECK` cannot count sibling rows.

**Why is it a weak entity?** A colour has no identity on its own. "Hue 214.6" only means
something as "colour number 1 of challenge 118". Its identity depends on the challenge.
`round_number` is the **partial key** — it distinguishes colours inside one challenge.

---

### 2.4 `daily_personal_bests`

**One row = one player's best score on one day's challenge.**

| Column | Meaning | Rule |
|---|---|---|
| `user_id` | The player | Part of composite PK, FK → `users` `ON DELETE CASCADE` |
| `daily_challenge_id` | The day | Part of composite PK, FK → `daily_challenges` `ON DELETE RESTRICT` |
| `best_score` | Best game score that day | `NUMERIC(3,1)`, `CHECK` 0–30 |
| `achieved_at` | When that best was set | `NOT NULL` |

This table is the **M:N relationship "ACHIEVES"** between users and daily challenges, with
two relationship attributes (`best_score`, `achieved_at`).

- A row is inserted on the player's first completed Daily game for that day.
- It is updated **only when a later game scores strictly higher**.
- Rows are kept after the day ends, so past leaderboards still work.

`ON DELETE RESTRICT` on the challenge means you cannot delete a challenge that still has
scores — history is protected.

---

### 2.5 `achievements`

**One row = one achievement definition** (the master list, seeded by developers).

| Column | Meaning | Rule |
|---|---|---|
| `achievement_id` | Internal id | PK |
| `name` | Display name | `UNIQUE` |
| `description` | Player-facing text | `NOT NULL` |
| `criteria_type` | What is measured | `CHECK` in six values |
| `threshold` | The number to reach | Required for some types, null for others |
| `criteria_description` | Human-readable rule | `NOT NULL` |

The six `criteria_type` values:

| Type | Earned when | Threshold |
|---|---|---|
| `games_played` | `total_games_played >= threshold` | Required |
| `daily_streak` | `current_daily_streak >= threshold` | Required |
| `perfect_round` | Highest round in the game `>= threshold` | Required |
| `new_pb` | The game beat an **existing** PB | Must be `NULL` |
| `first_daily` | First completed Daily game | Must be `NULL` |
| `first_global` | First completed Global game | Must be `NULL` |

The rule "threshold is required for the first three and null for the last three" is a
**cross-column CHECK** (`achievements_threshold_presence_check`).

The seeded list includes: First Global Game, First Daily Game, Warming Up (10 games),
Regular (50), Centurion (100), Sharp Eye (9.5 round), Perfect Match (10.0 round),
Personal Best, On a Roll (3-day streak), Week Warrior (7), Monthly Master (30).

**Room attempts never trigger achievements.**

---

### 2.6 `user_achievements`

**One row = one achievement earned by one player.**

| Column | Meaning | Rule |
|---|---|---|
| `user_id` | The player | Composite PK, FK → `users` `ON DELETE CASCADE` |
| `achievement_id` | The achievement | Composite PK, FK → `achievements` `ON DELETE RESTRICT` |
| `earned_at` | When unlocked | Default `now()` |

The composite primary key guarantees an achievement can be earned **only once per player**.
The awarding function also uses `ON CONFLICT DO NOTHING` as a second guard for concurrent
requests.

This table is the **M:N relationship "EARNS"** between users and achievements.

---

### 2.7 `rooms`

**One row = one Custom Room.**

| Column | Meaning | Rule |
|---|---|---|
| `room_id` | Internal id | PK |
| `room_code` | 8-character code used to join | `UNIQUE`; random; matched case-insensitively by the app |
| `creator_id` | Who created it | FK → `users` `ON DELETE RESTRICT` |
| `room_size` | Maximum players | `CHECK >= 2`; the API also caps it at 10 |
| `timer_seconds` | Per-round guess timer | `NULL` (no timer), 5, 10 or 15 |
| `attempts_limit` | Attempts per player | 3 or 5 |
| `status` | Lifecycle state | `lobby`, `in_progress`, `finished`, `cancelled` |
| `created_at` | Creation time | Default `now()` |
| `started_at` | When the creator started | Null until `in_progress` |
| `ended_at` | When it finished/cancelled | Null until the end |

**Room lifecycle:**

```
lobby ──(creator starts, ≥ 2 players)──► in_progress ──(no active member left)──► finished
  │
  └──(creator leaves the lobby)──► cancelled
```

The status and the timestamps must agree. This is enforced twice:

1. A **cross-column CHECK** (`rooms_status_timestamps_check`) — a table-level safety net.
2. The **`rooms_before_update` trigger** — gives a clearer domain error (`VALIDATION_ERROR`).

**Why `timer_seconds` is nullable:** `NULL` means "no timer", which is different from `0`.
The `CHECK` still permits only `NULL`, 5, 10 or 15.

---

### 2.8 `room_colors` (weak entity)

**One row = one of a room's three shared colours.**

Same structure and rules as `challenge_colors`, but owned by `rooms`:

- Composite PK `(room_id, round_number)`.
- `round_number` 1–3, HSV ranges enforced.
- FK → `rooms` `ON DELETE CASCADE`.
- The three colours are generated **when the creator starts the room**, in the same
  transaction as the status change, and never change afterwards.
- Every player in the room plays the same three colours, but in a per-player shuffled order.

---

### 2.9 `room_players`

**One row = one player's membership in one room.**

| Column | Meaning | Rule |
|---|---|---|
| `room_id` | The room | Composite PK, FK → `rooms` `ON DELETE CASCADE` |
| `user_id` | The player | Composite PK, FK → `users` `ON DELETE CASCADE` |
| `joined_at` | When they joined | Default `now()` |
| `status` | `active`, `finished` or `left` | `CHECK` |
| `attempts_used` | Completed attempts | `CHECK >= 0`; cannot exceed the room's limit |
| `best_score` | Best completed attempt | Nullable, 0–30 |
| `best_achieved_at` | When that best was set | Null exactly when `best_score` is null |

The composite primary key prevents the same user joining the same room twice.
The creator is also a member (two different relationships: CREATES and JOINS).

**Member lifecycle:**

- `active`: still has attempts to play.
- `finished`: used all attempts.
- `left`: left after the room started; keeps their best score, forfeits remaining attempts.

**Leaving rules:**

- In the **lobby**: a non-creator's row is deleted; the creator leaving **cancels** the room
  (the creator's row is kept because the room row still refers to them).
- **After the start**: status becomes `left`; the best score is kept; incomplete attempt is
  discarded (it was never submitted, so it was never saved anywhere).

**Trigger-protected rules** (because they span rows/tables):

- A row can only be inserted while the room is `lobby`.
- The member count cannot exceed `room_size`.
- `attempts_used` cannot exceed the room's `attempts_limit`.
- Only an `active` member can use another attempt.
- Status only moves forward: `active → finished` or `active → left`.
- `best_score` can never decrease or be cleared.

**Room scoreboard:** members ordered by `best_score DESC`; members with no score last and
with a `NULL` rank.

---

### 2.10 How the nine tables fit together

```
users ──1:N──► rooms                     (a user creates many rooms)
users ──M:N──► rooms  via room_players   (a user joins many rooms; a room has many users)
rooms ──1:N──► room_colors               (each room has exactly 3 colours)
rooms ──1:N──► room_players              (each room has many members)

users ──M:N──► daily_challenges via daily_personal_bests
daily_challenges ──1:N──► challenge_colors

users ──M:N──► achievements via user_achievements
```

Notice there is **no leaderboard table** and **no game-history table** in PostgreSQL.
That is deliberate (section 1.3).

---

## 3. ER model for the viva

### 3.1 Entities

| Entity | Type | Why |
|---|---|---|
| USER | Strong | Has its own identity (`user_id`) |
| DAILY_CHALLENGE | Strong | Has its own identity (`daily_challenge_id`) |
| CHALLENGE_COLOR | **Weak** | No identity without its challenge |
| ACHIEVEMENT | Strong | Has its own identity (`achievement_id`) |
| ROOM | Strong | Has its own identity (`room_id`) |
| ROOM_COLOR | **Weak** | No identity without its room |

### 3.2 Relationships (Chen notation)

| Relationship | Between | Cardinality | Participation | Mapped table |
|---|---|---|---|---|
| `HAS_COLOR` (identifying) | DAILY_CHALLENGE – CHALLENGE_COLOR | 1 : N | colour is total | `challenge_colors` |
| `ACHIEVES` | USER – DAILY_CHALLENGE | M : N | partial both | `daily_personal_bests` |
| `EARNS` | USER – ACHIEVEMENT | M : N | partial both | `user_achievements` |
| `CREATES` | USER – ROOM | 1 : N | room is total | `rooms.creator_id` |
| `ROOM_HAS_COLOR` (identifying) | ROOM – ROOM_COLOR | 1 : N | colour is total | `room_colors` |
| `JOINS` | USER – ROOM | M : N | room is total | `room_players` |

Key talking points if the examiner points at the diagram:

- **Weak entity:** `CHALLENGE_COLOR` / `ROOM_COLOR`. Drawn with a double rectangle. Its
  primary key includes the owner's key.
- **Partial key:** `round_number` (1, 2 or 3). It distinguishes colours only inside one
  challenge/room.
- **Identifying relationship:** `HAS_COLOR` / `ROOM_HAS_COLOR`, drawn with a double diamond.
  Deleting the owner deletes the colours (`ON DELETE CASCADE`).
- **Total participation:** a colour must belong to a challenge/room; a room must have a
  creator and at least one member. Drawn with a double line.
- **M:N with attributes:** `ACHIEVES` carries `best_score` and `achieved_at`; `JOINS` carries
  `joined_at`, `status`, `attempts_used`, `best_score`, `best_achieved_at`.
- **Global PB is not a relationship:** it is exactly one value per user, so it is stored as
  two columns on `users`.
- **Roles are an attribute, not a subtype:** only two roles exist and they share all columns.
- **No LEADERBOARD entity:** ranks are derived.
- **No GAME entity on the ER diagram:** history lives in MongoDB.

### 3.3 Is the schema normalised?

Short answer: **the entity tables are in 3NF; the cached counters and personal bests are
deliberate, controlled denormalisation.**

Explain it like this:

- Every table has a primary key.
- Every non-key column depends on the **whole** key:
  - In `challenge_colors`, `hue` depends on `(daily_challenge_id, round_number)` — you cannot
    know the hue from the challenge id alone or from the round number alone.
  - In `daily_personal_bests`, `best_score` depends on **both** the user and the challenge.
  - In `room_players`, `attempts_used` depends on **both** the room and the user.
- There are no repeating groups (1NF): each colour is its own row, not three columns.
- No partial dependencies (2NF) and no transitive dependencies (3NF) in the entity tables.

The deliberate exceptions:

- `users.global_best_score`, `total_games_played`, streak columns: these are **cached
  aggregates**. They could be computed from history, but MongoDB is a separate database and
  achievement checks need them quickly and atomically. They are maintained by the submission
  function, so they cannot drift through normal play.
- `daily_personal_bests` is arguably both an entity and a cached best; it is the only place
  the daily best exists, so it is authoritative, not a duplicate.
- Leaderboard **ranks** are not stored at all. That is how we avoid the worst kind of
  denormalisation.

A strong answer: *"We normalised the facts, and denormalised only the aggregates that must
be updated atomically with the facts. We never store a value that can be recomputed cheaply
and would go stale, such as a rank."*

---

## 4. Keys, constraints and integrity

### 4.1 The vocabulary

| Term | Meaning in this project |
|---|---|
| **Primary key (PK)** | Uniquely identifies a row. `users.user_id`, or a composite such as `(user_id, achievement_id)` |
| **Composite key** | A PK made of two columns, e.g. `room_players(room_id, user_id)` |
| **Foreign key (FK)** | A column that references a PK in another table; prevents orphans |
| **UNIQUE** | No two rows may share the value. Used for username, email, date, achievement name, room code |
| **NOT NULL** | The column must have a value |
| **CHECK** | A boolean rule the database evaluates on every insert/update |
| **DEFAULT** | Value used when the insert does not supply one |
| **Cascading delete** | Deleting the parent deletes the children (`ON DELETE CASCADE`) |
| **Restrict** | Deleting the parent is refused while children exist (`ON DELETE RESTRICT`) |
| **Index** | A lookup structure that speeds up reads, at a small cost to writes and storage |
| **View** | A named saved query that behaves like a read-only table |
| **Trigger** | Code that runs automatically before/after a row change |
| **Function / procedure** | Named PL/pgSQL code stored in the database, called by the app |
| **Transaction** | A group of statements that either all succeed or all roll back |

### 4.2 All foreign keys and their delete behaviour

| FK | References | On delete | Plain-English reason |
|---|---|---|---|
| `challenge_colors.daily_challenge_id` | `daily_challenges` | CASCADE | Colours are meaningless without their day |
| `daily_personal_bests.user_id` | `users` | CASCADE | A PB belongs to its player |
| `daily_personal_bests.daily_challenge_id` | `daily_challenges` | RESTRICT | Do not delete a day that still has results |
| `user_achievements.user_id` | `users` | CASCADE | Earned badges belong to their player |
| `user_achievements.achievement_id` | `achievements` | RESTRICT | Do not delete a badge people have earned |
| `rooms.creator_id` | `users` | RESTRICT | Deleting a user must not silently delete rooms other people played in |
| `room_colors.room_id` | `rooms` | CASCADE | Colours are meaningless without their room |
| `room_players.room_id` | `rooms` | CASCADE | Membership belongs to the room |
| `room_players.user_id` | `users` | CASCADE | Membership belongs to the player |

**Important design choice:** users are normally **banned, not deleted**. A hard delete is
blocked by `rooms.creator_id RESTRICT` while the user owns rooms, and it would also require
cleaning up MongoDB documents, which the database cannot enforce.

### 4.3 The five cross-column CHECKs

These are rules Drizzle could not express on a single column, so they are hand-written SQL
in `drizzle/0001_cross_column_checks.sql`.

| Constraint | Rule | Why |
|---|---|---|
| `users_global_best_pair_check` | `global_best_score` and `global_best_achieved_at` are null together or set together | No score without a date, no date without a score |
| `users_longest_ge_current_check` | `longest_daily_streak >= current_daily_streak` | The record can never be lower than the current run |
| `room_players_best_pair_check` | `best_score` and `best_achieved_at` are null together | Same pair rule for a room best |
| `achievements_threshold_presence_check` | Threshold required for `games_played`/`daily_streak`/`perfect_round`; null for `new_pb`/`first_daily`/`first_global` | A threshold makes no sense for a one-off event |
| `rooms_status_timestamps_check` | `lobby` → neither timestamp; `in_progress` → started only; `finished` → both; `cancelled` → ended only | The lifecycle and timestamps must agree |

### 4.4 Simple CHECKs (single column)

- HSV ranges: hue 0–360, saturation 0–100, value 0–100.
- `round_number` 1–3.
- Scores 0–30 (game) or 0–10 (round, enforced by the function/validator because it lives in
  an array).
- Counters ≥ 0.
- `role` in (`player`, `admin`).
- `criteria_type` in the six allowed values.
- `threshold > 0` when present.
- `room_size >= 2`, `timer_seconds` in (5, 10, 15) or null, `attempts_limit` in (3, 5).
- Room status and member status in their allowed lists.

### 4.5 Rules that cannot be a simple CHECK

| Rule | Enforced by | Why not a CHECK |
|---|---|---|
| Exactly 3 colours per challenge/room | The creating SQL function (one transaction) | A CHECK cannot count sibling rows |
| Room capacity | `room_players_before_insert` trigger + `join_room` | Needs a count of other rows |
| Only lobby joins | Trigger + `join_room` | Needs the parent room's status |
| Attempts within limit | `room_players_before_update` trigger + `submit_room_attempt` | Needs the parent room's limit |
| Attempts only by an active member | Trigger + function | Needs the old row state |
| Best score never decreases | Trigger + function | Needs the old row state |
| Valid room status transitions | Trigger | Needs the old status |
| Room code never reused | Application never deletes rooms | A UNIQUE index only prevents duplicates among **existing** rows |
| Email stored lower-case | Application `normalizeEmail()` | The DB unique index is case-sensitive |

That last point is worth repeating honestly if asked: **usernames** are case-insensitively
unique at the database level (a unique index on `lower(username)`), but **emails** are
lower-cased by the application before insert. Direct SQL could insert `A@x.com` and `a@x.com`
as two rows. The API prevents it; the DB does not.

### 4.6 Defence in depth: where validation happens

This is an excellent answer to "how do you ensure data is valid?"

1. **Browser form** — Zod validation for a fast, friendly error before a request.
2. **API route** — Zod schemas reject unknown keys and wrong shapes.
3. **Service layer** — business rules (e.g. room size ≤ 10, only the creator can start).
4. **SQL function/procedure** — validates arguments again; never trusts the caller.
5. **Table constraints** — `NOT NULL`, `UNIQUE`, `CHECK`, FK.
6. **Triggers** — cross-row and lifecycle rules.
7. **MongoDB JSON Schema validator** — document shape, ranges, exactly 3 rounds.

---

## 5. Advanced database features (the course checklist)

The project brief asked for at least four advanced concepts. The implementation uses **six**.

| Feature | Where | Count |
|---|---|---|
| Transactions | Every SQL function call; multi-row changes are atomic | — |
| Stored functions | `drizzle/0004`, `0005`, `0006` | 12 (9 business + 3 trigger functions) |
| Stored procedures | `drizzle/0007` | 2 |
| Triggers | `drizzle/0003` | 3 |
| Views | `drizzle/0008` | 3 |
| Indexing | `drizzle/0002` + constraints | 20 (6 explicit + 14 constraint-backed) |
| NoSQL JSON Schema + aggregation | `scripts/init-mongo.ts`, `aggregations.ts` | 1 validator + 4 indexes |

### 5.1 Transactions (ACID)

- **Atomicity:** all changes in one function call commit together or roll back together.
- **Consistency:** constraints/triggers are checked at the end.
- **Isolation:** concurrent writers are serialised with row locks where needed.
- **Durability:** once committed, the data survives a crash (PostgreSQL guarantee).

Concrete examples:

1. **Finishing a Global game** calls `submit_game_result` once. Inside that one call:
   lock the user, increment games, maybe update the PB, maybe update streak counters, maybe
   insert achievements, build the response. If anything fails, none of it is saved.
2. **Starting a room** calls `start_room` once. It inserts the three colours **and** changes
   the status to `in_progress` in the same transaction. There can never be a started room
   with zero colours.
3. **Creating today's challenge** inserts the day and its three colours together. There can
   never be a challenge row with one colour.

Demo trick: run the function in `BEGIN; ... ROLLBACK;` and show that the counters are
unchanged (section 9.1).

### 5.2 Stored functions (9 business functions)

| Function | Signature (short) | What it does |
|---|---|---|
| `evaluate_achievements` | `(user_id, mode, max_round, beat_pb, first_in_mode)` | Finds newly satisfied achievements, inserts them, returns them |
| `submit_game_result` | `(user_id, mode, challenge_id, scores[], played_at)` | The whole PostgreSQL side of a Global/Daily game |
| `ensure_daily_challenge` | `(date, colors jsonb)` | Race-safe creation of today's challenge + 3 colours |
| `check_room_over` | `(room_id)` | Internal helper: finish the room when no member is `active` |
| `create_room` | `(creator, code, size, timer, attempts)` | Inserts a lobby room + creator membership |
| `join_room` | `(user, code)` | Lobby-only, capacity-checked, idempotent join |
| `start_room` | `(user, code, colors jsonb)` | Creator-only start; inserts colours + status in one transaction |
| `leave_room` | `(user, code)` | Lobby delete/cancel; in-progress `left`; no-op when finished |
| `submit_room_attempt` | `(user, room_id, scores[])` | Consumes an attempt, updates best if strictly better, finishes member/room |

**Why put this logic in the database instead of the API?**

- It runs **inside one transaction** with the locks and constraints.
- It cannot be bypassed by another piece of application code.
- The validation and the write happen in the same place.
- It gives a single, reliable error path (`CM000`).

**Function vs procedure:** a function returns a value and is called with `SELECT`; a
procedure is called with `CALL`, returns nothing, and is used for admin side effects.

### 5.3 Stored procedures (2)

| Procedure | What it does |
|---|---|
| `admin_set_ban(admin_id, target_id, banned)` | Re-checks that the caller is an admin; locks the target; refuses self/admin targets; sets `is_banned` |
| `admin_update_user_stats(admin_id, target_id, patch jsonb)` | Re-checks admin; accepts **only six** stats keys; applies the patch; maps bad values to `VALIDATION_ERROR` |

**Why re-check the admin role inside SQL?** The API already checks it, but the procedure is a
second line of defence. If someone calls the procedure directly, the role check still holds.

Allowed keys: `global_best_score`, `global_best_achieved_at`, `total_games_played`,
`current_daily_streak`, `longest_daily_streak`, `last_daily_played_date`.

The API schema additionally requires the two Global PB fields to be sent together, and their
nulls to agree. The procedure's table `CHECK`s catch the rest.

### 5.4 Triggers (3)

A trigger is **automatic**; the application cannot forget it.

| Trigger | Table / event | Rules |
|---|---|---|
| `trg_room_players_before_insert` | `room_players` BEFORE INSERT | Lock the room row; reject if not `lobby` (`ROOM_NOT_LOBBY`); reject if already full (`ROOM_FULL`) |
| `trg_room_players_before_update` | `room_players` BEFORE UPDATE | Attempts cannot exceed the limit; only an `active` member can use an attempt; only forward status transitions; best score cannot decrease |
| `trg_rooms_before_update` | `rooms` BEFORE UPDATE | Only `lobby → in_progress`, `lobby → cancelled`, `in_progress → finished`; timestamps must match the status |

The trigger functions lock the `rooms` row with `FOR UPDATE`. This is what makes two
simultaneous "last slot" joins safe: the second transaction waits, then re-counts and sees
the room is full.

**Why a trigger for this and not a function-only check?** The rule spans other rows. A
constraint cannot count members. A trigger also protects direct SQL that bypasses
`join_room`.

### 5.5 Views (3)

A view is a saved query. The API reads views for leaderboards, never the base tables.

| View | What it returns | Filter |
|---|---|---|
| `global_leaderboard` | `rank, user_id, username, score, achieved_at` | `is_banned = false` and PB is not null; rank by score DESC, earliest achieved_at, user_id |
| `daily_leaderboard` | `daily_challenge_id, challenge_date, rank, user_id, username, score, achieved_at` | joins PBs, users, challenges; excludes banned; ranks **per challenge** with `PARTITION BY` |
| `room_scoreboard` | `room_id, rank, user_id, username, member_status, attempts_used, best_score, best_achieved_at` | all members; **banned players are not filtered**; rank is null when no best; `NULLS LAST` |

Why views are a good answer:

- **Consistency:** the list and the "my rank" query use the same definition, so they can
  never disagree.
- **Simplicity:** the API just does `SELECT ... FROM global_leaderboard`.
- **Security by construction:** every consumer gets the banned-user filter automatically.
- **No stale ranks:** it is a normal view, computed on read. A materialised view would need
  refreshing; at this scale that is unnecessary.

### 5.6 Indexes (20)

An index is like a book's index: instead of scanning every page, the database jumps to the
right rows. It speeds up reads but costs storage and a little write time.

**Six explicit indexes:**

| Index | Purpose |
|---|---|
| `users_global_best_score_idx` on `users(global_best_score DESC)` **WHERE not banned and score not null** | Global leaderboard; **partial** so it only contains rows the view uses |
| `daily_personal_bests_daily_challenge_score_idx` on `(daily_challenge_id, best_score DESC)` | Daily leaderboard lookup + sort |
| `room_players_room_score_idx` on `(room_id, best_score DESC)` | Room scoreboard |
| `room_players_user_id_idx` on `(user_id)` | "Which rooms is this user in?" — the composite PK starts with `room_id`, so it cannot help here |
| `rooms_status_idx` on `(status)` | Filtering rooms by lifecycle |
| `users_username_lower_key` **UNIQUE** on `lower(username)` | Case-insensitive username uniqueness (`Sam` = `sam`) |

**Fourteen indexes are created implicitly** by primary-key and UNIQUE constraints (one per
PK/UNIQUE). They are still real indexes; we list them in `docs/SQL_OBJECTS.md` so the count
is honest.

Two index concepts worth knowing:

- **Partial index:** includes only rows matching a `WHERE` clause. Ours contains only
  non-banned users with a PB — exactly the leaderboard rows — so it is small and fast.
- **Leftmost-prefix rule:** a composite index `(room_id, best_score)` can serve queries that
  filter by `room_id`, but not queries that filter only by `best_score`. Likewise the PK
  `(room_id, user_id)` cannot serve `user_id` alone, hence the extra `room_players_user_id_idx`.

### 5.7 MongoDB JSON Schema + aggregation

Covered in section 7.

### 5.8 DDL demonstration

`scripts/ddl-demo.sql` is a separate course deliverable, not an application migration. It
runs in a scratch schema `cm_ddl_demo` inside `BEGIN … ROLLBACK`, so it leaves the real
schema untouched. It demonstrates:

- `CREATE TABLE` with PK, UNIQUE, FK, CHECK, defaults.
- `ALTER TABLE ... ADD COLUMN`, `ADD CONSTRAINT`, `RENAME COLUMN`, `RENAME TABLE`.
- `CREATE INDEX` and `DROP INDEX`.
- `ALTER TABLE ... DROP COLUMN`.
- `DROP TABLE` in the correct order (child first).

---

## 6. The main data flows

### 6.1 Global game — submit

1. The browser calls `POST /api/games/start`. The server generates three random HSV colours.
2. The server signs a **game token** containing the targets, user id, mode and a 2-hour
   expiry, and sends the token + targets to the browser.
3. The player plays. The browser sends only the **three guesses** and the token.
4. `POST /api/games/submit`:
   - verifies the token signature, `typ`, `aud`, expiry, user match, exactly 3 rounds and
     elapsed ≥ 13 s (anti-cheat);
   - scores the guesses with the pure `scoreRound` function;
   - calls **`submit_game_result` exactly once**;
   - builds the MongoDB document and inserts it **best-effort**;
   - returns the round scores, PB info and unlocked achievements.

Inside `submit_game_result`:

```
validate inputs
  → SELECT the user FOR UPDATE            (serialise concurrent submissions)
  → total = sum(scores), max = max(scores)
  → first_in_mode = (global_best_score IS NULL)
  → total_games_played += 1
  → if total > global_best_score (or null):
        update global_best_score + achieved_at
  → UPDATE users
  → evaluate_achievements(...)
  → return JSON
```

The response includes:

```json
{
  "total_score": 25.3,
  "mode": "global",
  "total_games_played": 12,
  "pb": {
    "scope": "global",
    "previous": 22.0,
    "current": 25.3,
    "updated": true,
    "beat_existing": true
  },
  "unlocked": [
    { "achievement_id": 4, "name": "Personal Best", "description": "..." }
  ]
}
```

`updated` means the PB was created or changed. `beat_existing` is true only when an
**existing** PB was strictly beaten; a first-ever game sets a PB but does not "beat" one.
That distinction matters for the `new_pb` achievement.

### 6.2 Daily game — submit and streak

Most of the flow is the same. Differences:

- `daily_challenges` holds the day; the token carries `cid` (challenge id) and `cdate`.
- The per-player play order is shuffled; each round carries `n` = the stored colour number.
- `submit_game_result` mode is `"daily"` and `p_challenge_id` is required.
- The DB row, not the generator, is the source of truth for the colours.

Inside the function:

1. Validate the challenge exists; read its `challenge_date` (the day the game **started**).
2. Read the existing `daily_personal_bests` row for `(user, challenge)`:
   - none → insert it;
   - existing and new total is strictly greater → update it;
   - otherwise leave it alone.
3. Apply the streak rule:

| Situation | New current streak |
|---|---|
| `last_daily_played_date` is null (first ever Daily) | 1 |
| challenge date = last date (played again today) | unchanged |
| challenge date = last date + 1 day | current + 1 |
| challenge date > last date + 1 (a day was skipped) | 1 |
| challenge date < last date (a late-finishing earlier game) | unchanged |

4. `longest = greatest(longest, current)`.
5. `last_daily_played_date = greatest(last, challenge_date)` so it only moves forward.
6. Update the user row once, then evaluate achievements.

**Display nuance:** `current_daily_streak` is only updated when a Daily is played. When
showing it, treat it as 0 if `last_daily_played_date` is older than yesterday (UTC). The
profile service uses `displayStreak()` for this.

**Daily challenge creation:** `ensure_daily_challenge(date, colors)`:

- rejects any date other than **today in UTC** (`INVALID_DATE`) — this stops arbitrary past
  or future days being created;
- validates exactly 3 colour objects with numeric h/s/v in range;
- `INSERT ... ON CONFLICT (challenge_date) DO NOTHING RETURNING id`;
- if it inserted, it inserts the three colours and returns the id;
- if another transaction won the race, it selects and returns the existing id;
- the service then **re-reads** the stored colours, so all callers see the same values.

### 6.3 Custom Room lifecycle

Every room operation is one SQL function call = one transaction. Lock order is always:
**`rooms` row first, then the member row.** This fixed order prevents deadlocks.

| Step | Function | What happens |
|---|---|---|
| Create | `create_room` | Validates settings; inserts `rooms` (`lobby`) + creator in `room_players`; duplicate code → `23505`, service retries with a new code |
| Join | `join_room` | Lock by code; `ROOM_NOT_FOUND`; must be `lobby`; existing member → `already_member`; full → `ROOM_FULL`; insert member |
| Start | `start_room` | Lock; creator only (`NOT_ROOM_CREATOR`); `lobby`; at least 2 members (`NOT_ENOUGH_PLAYERS`); insert 3 colours; set `in_progress` + `started_at` |
| Play attempt | `submit_room_attempt` | Lock room; must be `in_progress`; lock member; must be `active`; attempts left; increment `attempts_used`; update best only if strictly greater; at the limit → member `finished`; `check_room_over` |
| Leave (lobby) | `leave_room` | Creator → room `cancelled` + `ended_at`; non-creator → delete membership row |
| Leave (in progress) | `leave_room` | `active` → `left` (best score kept); `check_room_over` |
| Room over | `check_room_over` | If `in_progress` and no member is `active` → `finished` + `ended_at` |

Important consequences:

- Attempts are consumed at **submit**, not at start. An abandoned attempt uses nothing.
- A room attempt **never** touches `users` stats, PBs, streaks, games-played or achievements.
- Room scoreboards include banned players.
- The creator is a normal member too; they play and rank like everyone else.

### 6.4 Admin actions

- `GET /api/admin/users` — search by username/email substring, filter banned, paginate
  (default 50, max 100).
- `GET /api/admin/users/{id}` — detail + last 30 Daily bests + earned achievements.
- `GET /api/admin/users/{id}/history` — the same history reader as the profile.
- `PATCH /api/admin/users/{id}/stats` — allow-listed patch through
  `admin_update_user_stats`.
- `POST /api/admin/users/{id}/ban` and `/unban` — through `admin_set_ban`.

The route guard re-reads the caller's role from PostgreSQL; the stored procedure re-checks
it again. Successful changes log one structured `admin_action` line with `admin`, `target`,
`action`, and (for stats) `patch`. There is no audit table — an honest, documented choice.

### 6.5 PostgreSQL first, MongoDB second

The order is always:

```
1. PostgreSQL function/procedure commits  ← authoritative
2. MongoDB insert                         ← best-effort supplement
3. HTTP response
```

If the MongoDB insert fails, the service logs a warning, retries **once**, and swallows the
error. The request still succeeds. This is correct because history is supplementary: the
score, PB, streak and achievements are already committed in PostgreSQL.

**Why not a two-phase commit?** PostgreSQL and MongoDB cannot share a transaction. A
distributed transaction would add complexity for data that is not allowed to block gameplay.
The accepted limitation is that a game can occasionally be missing from history while its
authoritative result is correct.

**Admin edits** change PostgreSQL only; they do not rewrite history. Stats and history can
therefore legitimately differ after a correction.

---

## 7. MongoDB — the history database

### 7.1 Why one collection?

A game is a self-contained nested object: three rounds, each with a target colour, a guess
and a score. One document = one completed game. No joins are needed to read it back. The
`mode` field distinguishes Global, Daily and Room shapes, so one collection is enough.

The write pattern is **insert once, never update** — append-only. That is a natural fit for a
document store.

### 7.2 The three document shapes

**Global** — no challenge id, no colour numbers:

```json
{
  "_id": "ObjectId(...)",
  "user_id": 42,
  "mode": "global",
  "played_at": "2026-10-17T14:32:08Z",
  "total_score": 24.6,
  "rounds": [
    {
      "round_number": 1,
      "target": { "h": 214.6, "s": 62.0, "v": 80.5 },
      "guess":  { "h": 209.0, "s": 58.5, "v": 77.0 },
      "score": 8.9
    }
    // rounds 2 and 3 omitted here
  ]
}
```

**Daily** — adds `daily_challenge_id` and `rounds[].color_number` (which stored colour this
was; the player saw it in a shuffled order):

```json
{
  "user_id": 42,
  "mode": "daily",
  "daily_challenge_id": 118,
  "played_at": "...",
  "total_score": 24.6,
  "rounds": [
    { "round_number": 1, "color_number": 3, "target": {}, "guess": {}, "score": 8.9 }
  ]
}
```

**Room** — adds `room_id`, `attempt_number`, and per-round `timed_out`:

```json
{
  "user_id": 42,
  "mode": "room",
  "room_id": 7,
  "attempt_number": 2,
  "played_at": "...",
  "total_score": 22.1,
  "rounds": [
    {
      "round_number": 1,
      "color_number": 2,
      "target": {},
      "guess": {},
      "score": 7.6,
      "timed_out": false
    }
  ]
}
```

Field notes:

- `rounds` is always **exactly 3**, in the order the player actually played.
- `target` and `guess` are always full HSV objects.
- `score` is the server-computed round score.
- `timed_out` exists only for rooms; false in untimed rooms.
- `played_at` is stored as a BSON `Date` (shown as an ISO string above).
- `user_id`, `daily_challenge_id` and `room_id` are **logical** references to PostgreSQL.
  They are written as BSON `Long` because the validator expects `long`; round/attempt
  numbers are BSON `Int32`.

### 7.3 The JSON Schema validator

MongoDB does not enforce a shape by default. `scripts/init-mongo.ts` creates the collection
with `validationLevel: "strict"`, `validationAction: "error"` and a `$jsonSchema`.

It enforces, at the database level:

- Required: `user_id`, `mode`, `played_at`, `total_score`, `rounds`.
- `mode` is `"global"`, `"daily"` or `"room"`.
- `rounds` has **exactly 3** items (`minItems: 3`, `maxItems: 3`).
- `h` 0–360; `s`/`v` 0–100.
- Round score 0–10; total 0–30.
- `daily_challenge_id` and each round's `color_number` are required for Daily.
- `room_id`, `attempt_number` and each round's `color_number` are required for Room.

The mode-specific rules use a `oneOf` of three branches because MongoDB's `$jsonSchema`
does **not** support `if/then`.

The script is **idempotent**: first run creates the collection; later runs use `collMod` to
update the validator, and `createIndex` is safe to repeat.

### 7.4 The four indexes

| Index | Purpose |
|---|---|
| `{ user_id: 1, played_at: -1 }` | A player's history, newest first — the most common query |
| `{ mode: 1, played_at: -1 }` | Recent games per mode; time-window analytics |
| `{ daily_challenge_id: 1, user_id: 1 }` **partial on `mode: "daily"`** | All games for one day; one player's day |
| `{ room_id: 1, user_id: 1, attempt_number: 1 }` **partial on `mode: "room"`** | All attempts in a room; one player's attempts |

### 7.5 History pagination

`listUserHistory(userId, { limit, cursor })` sorts by `played_at DESC, _id DESC` and uses a
cursor containing `(played_at, _id)`. The next page asks for rows "older than this pair".

Why a cursor instead of `skip`?

- `skip` gets slower as the offset grows.
- New games can be inserted between requests, which would shift rows and duplicate/skip
  entries with `skip`.
- The cursor is stable and uses the index.

The API encodes the cursor as base64url. Limit is clamped to 1–100, default 20.

### 7.6 Aggregations (the "NoSQL analytics" feature)

All user-level pipelines match `mode: { $in: ["global", "daily"] }`, so **room attempts
never leak into a player's overall stats**. They still appear in recent history, tagged
`mode: "room"`.

| Function | Pipeline idea | Used for |
|---|---|---|
| `userModeSummary` | `$match` → `$group` by mode → count/avg/max/min | Profile cards per mode |
| `userTrend` | `$match` + date range → `$group` by UTC day/week | Score trend chart |
| `userChannelAccuracy` | `$unwind` rounds → absolute H/S/V error; hue uses the short way around the circle → `$avg` | Which channel the player misses most |
| `userHueRegionAccuracy` | `$unwind` → `$bucket` on `target.h` in 30° bins → average score | Which colour regions are hard |
| `dailyChallengeSummary` | match challenge → unwind → group by `color_number` → avg score, distinct players | How a day went |
| `roomSummary` | match room → unwind → group by `color_number` → avg score, timeout count | How a room went |
| `userRoomProgress` | match room + user → sort by `attempt_number` | A player's attempt-by-attempt progress |

A nice concrete example to explain:

```js
db.game_history.aggregate([
  { $match: { mode: { $in: ["global", "daily"] } } },
  { $group: {
      _id: { mode: "$mode",
             day: { $dateToString: { format: "%Y-%m-%d", date: "$played_at", timezone: "UTC" } } },
      games: { $sum: 1 },
      avgScore: { $avg: "$total_score" }
  } },
  { $sort: { "_id.day": 1, "_id.mode": 1 } }
])
```

If the examiner asks what `$unwind` does: it turns one document with an array of three rounds
into three documents, one per round, so you can group/average per round.

### 7.7 What MongoDB is **not** used for

- Leaderboards, ranks, personal bests, room scoreboards — all from PostgreSQL views/tables.
- Achievement decisions — those need the authoritative counters in PostgreSQL.
- Scoring — scoring happens before either database is written.

This separation is the key design argument. If MongoDB is down, the game still works and
rankings are still correct; only the profile history block degrades.

---

## 8. Concurrency, consistency and security

### 8.1 Race conditions and how they are solved

| Race | Fix |
|---|---|
| Two Global games submit at once for one user | `SELECT ... FROM users WHERE user_id = ... FOR UPDATE` at the start of `submit_game_result`; the second waits, then sees the first's PB/counters |
| Two players join the last room slot | `join_room` locks the room row; the insert trigger also locks the room and re-counts |
| Creator starts while someone joins | Both lock the room row first, so they serialise |
| Two first requests create today's challenge | `UNIQUE (challenge_date)` + `INSERT ... ON CONFLICT DO NOTHING`; loser re-reads the winner's row |
| Same achievement inserted twice | Composite PK on `user_achievements` + `ON CONFLICT DO NOTHING` |
| Two rooms get the same random code | `UNIQUE (room_code)` + service retries up to 5 times with a fresh code |
| The same game submitted twice (replay) | **Partially handled, and we say so honestly.** The token is signed and expires after 2 h, and the 13-second floor stops instant scripts, but the app does not keep a used-token table, so a replay inside the TTL would be accepted. The token protects targets and scores, not replay. A `jti` table is the future fix. |

> **Honest answer on replay:** the signed token prevents tampering and expired use, and the
> 13-second floor prevents instant scripted submission. A deliberate replay of a still-valid
> token is not blocked by a nonce table. That is a known limitation and a possible future
> improvement (store `jti` per user or make the submission idempotent).

### 8.2 Row locks and deadlocks

- `FOR UPDATE` locks the selected row until the transaction ends.
- Room functions always lock `rooms` **first**, then `room_players`. If two functions used
  opposite orders, each could hold one lock and wait for the other — a deadlock. The fixed
  order prevents that.
- `submit_game_result` locks only the caller's `users` row, which cannot deadlock with a
  room transaction.

### 8.3 Error handling

SQL functions and triggers raise domain errors like this:

```sql
RAISE EXCEPTION 'ROOM_FULL' USING ERRCODE = 'CM000';
```

`CM000` is a custom SQLSTATE; the message is an application error code from the catalog
(`src/lib/errors.ts`). The mapper in `src/lib/db/pg/errors.ts`:

| PostgreSQL signal | Mapped to |
|---|---|
| `CM000` + a known code | `AppError(message)` — e.g. `ROOM_FULL`, `MEMBER_NOT_ACTIVE` |
| `23505` on `users_username_key` or `users_username_lower_key` | `USERNAME_TAKEN` |
| `23505` on `users_email_key` | `EMAIL_TAKEN` |
| `23505` on `rooms_room_code_key` | Caught by the service to retry; if it still fails, `INTERNAL_ERROR` |
| `23514` (CHECK violation) | `VALIDATION_ERROR` |
| Connection error / timeout | `SERVICE_UNAVAILABLE` (503) |
| Anything else | `INTERNAL_ERROR` (500), logged with a sanitised stack |

Drizzle wraps driver errors, so the mapper first unwraps `.cause`. It never sends SQL,
constraint names or stack traces to the browser.

### 8.4 Security

| Concern | Control |
|---|---|
| Passwords | Argon2id hash, never plaintext. Unknown emails still pay a dummy verify cost, so response time does not reveal whether an account exists |
| Session | HS256 JWT in an `HttpOnly`, `Secure` (production), `SameSite=Lax` cookie; 7-day expiry |
| Role checks | Session role is a hint only; `requireAdmin` and the admin procedures re-read the role from PostgreSQL |
| Request forgery | Every mutation needs `Content-Type: application/json` and an `Origin`/`Referer` matching `APP_ORIGIN` |
| SQL injection | All queries parameterized through Drizzle's `sql` template; no string-built SQL |
| Browser access | The browser never connects to a database; all access goes through the API |
| Room privacy | Access requires membership; random codes make rooms hard to guess |
| Admin edits | Allow-listed fields, role re-check, structured `admin_action` log |
| Secrets | Environment variables only; `.env*` is git-ignored except `.env.example` |
| Response leakage | Generic error messages; detailed errors only in server logs |

### 8.5 Banning behaviour

- A banned player can still log in and play by default (`BANNED_CAN_PLAY = true`).
- Banned players are excluded from `global_leaderboard` and `daily_leaderboard`.
- Banned players **are** shown on `room_scoreboard` (design default).
- The ban flag never deletes data.

---

## 9. Demo commands with expected output

These come from `docs/DEMO.md`. Run from the repo root after `docker compose up -d`,
`npm install`, `npm run db:migrate`, `npm run mongo:init`, `npm run db:seed`.

```bash
cp .env.example .env.local
docker compose up -d && npm install
npm run db:migrate && npm run mongo:init && npm run db:seed
npm run dev
set -a; . ./.env.local; set +a     # so psql can see $DATABASE_URL_DIRECT
```

Register `player1@example.com`, `player2@example.com`, `admin@example.com` in the UI
(password ≥ 8 characters), then:

```bash
npm run db:seed-admin -- admin@example.com
psql "$DATABASE_URL_DIRECT" -c "select user_id, username, role from users order by user_id;"
```

### 9.1 Transaction rollback (the strongest demo)

Play one Global game as player1 first, then:

```sql
BEGIN;
SELECT submit_game_result(
  (SELECT user_id FROM users WHERE email='player1@example.com'),
  'global', NULL, ARRAY[9.7,9.9,5.7]::numeric[], now());
SELECT total_games_played, global_best_score
  FROM users WHERE email='player1@example.com';   -- values changed
ROLLBACK;
-- run the SELECT again: unchanged, because the whole function call rolled back
```

Talking point: one function call contains several writes (counter, PB, achievements), and
they all roll back together. That is atomicity.

### 9.2 Room start is atomic

Use a fresh room code on each rerun (`DEMO01` already exists after the first run).

```sql
SELECT create_room((SELECT user_id FROM users WHERE email='player1@example.com'),
                   'DEMO01', 2::smallint, NULL::smallint, 3::smallint);
SELECT join_room((SELECT user_id FROM users WHERE email='player2@example.com'), 'DEMO01');
SELECT start_room((SELECT user_id FROM users WHERE email='player1@example.com'), 'DEMO01',
  '[{"h":200,"s":50,"v":80},{"h":10,"s":90,"v":40},{"h":300,"s":20,"v":60}]'::jsonb);
SELECT status, started_at FROM rooms WHERE room_code='DEMO01';
SELECT count(*) AS colours FROM room_colors
 WHERE room_id=(SELECT room_id FROM rooms WHERE room_code='DEMO01');   -- 3
```

Talking point: the status change and the three colour inserts happen in one function call.

### 9.3 Triggers reject bad direct SQL

```sql
-- ROOM_FULL: a lobby of size 2 with creator + player2, then try a third
SELECT create_room((SELECT user_id FROM users WHERE email='player1@example.com'),
                   'DEMO02', 2::smallint, NULL::smallint, 3::smallint);
SELECT join_room((SELECT user_id FROM users WHERE email='player2@example.com'), 'DEMO02');
INSERT INTO room_players (room_id, user_id)
VALUES ((SELECT room_id FROM rooms WHERE room_code='DEMO02'),
        (SELECT user_id FROM users WHERE email='admin@example.com'));

-- ROOM_NOT_LOBBY: DEMO01 was started in 9.2
INSERT INTO room_players (room_id, user_id)
VALUES ((SELECT room_id FROM rooms WHERE room_code='DEMO01'),
        (SELECT user_id FROM users WHERE email='admin@example.com'));

-- ATTEMPTS_EXHAUSTED: DEMO01's attempts_limit is 3
UPDATE room_players SET attempts_used=4
 WHERE room_id=(SELECT room_id FROM rooms WHERE room_code='DEMO01')
   AND user_id=(SELECT user_id FROM users WHERE email='player1@example.com');

-- VALIDATION_ERROR: in_progress -> lobby is not allowed
UPDATE rooms SET status='lobby' WHERE room_code='DEMO01';
```

Each statement fails with `ERROR: <CODE>` and SQLSTATE `CM000`. `\errverbose` shows the
SQLSTATE.

### 9.4 Views

```sql
SELECT rank, username, score FROM global_leaderboard ORDER BY rank LIMIT 10;

SELECT rank, username, score FROM daily_leaderboard
 WHERE challenge_date = CURRENT_DATE ORDER BY rank LIMIT 10;

SELECT rank, username, member_status, attempts_used, best_score
  FROM room_scoreboard
 WHERE room_id = (SELECT room_id FROM rooms WHERE room_code='DEMO01')
 ORDER BY rank NULLS LAST;

-- "My rank" is the same view filtered by user_id, so it always agrees with the list
SELECT * FROM global_leaderboard
 WHERE user_id = (SELECT user_id FROM users WHERE email='player1@example.com');
```

### 9.5 MongoDB aggregation

```bash
docker compose exec -T mongo mongosh chromamatch --quiet --eval '
db.game_history.aggregate([
  { $match: { mode: { $in: ["global", "daily"] } } },
  { $group: { _id: { mode: "$mode",
      day: { $dateToString: { format: "%Y-%m-%d", date: "$played_at", timezone: "UTC" } } },
      games: { $sum: 1 }, avgScore: { $avg: "$total_score" } } },
  { $sort: { "_id.day": 1, "_id.mode": 1 } }
]).forEach(printjson)
'
```

Change `$match` to `{ mode: "room" }` to show room attempts separately, or add
`{ $unwind: "$rounds" }` to get per-colour stats.

### 9.6 Role-based access

```sql
-- player1 is not an admin
CALL admin_set_ban(
  (SELECT user_id FROM users WHERE email='player1@example.com'),
  (SELECT user_id FROM users WHERE email='player2@example.com'), true);
-- ERROR: FORBIDDEN (CM000)

-- the admin succeeds
CALL admin_set_ban(
  (SELECT user_id FROM users WHERE email='admin@example.com'),
  (SELECT user_id FROM users WHERE email='player2@example.com'), true);

-- banned players disappear from Global/Daily but stay on room scoreboards
SELECT count(*) FROM global_leaderboard
 WHERE user_id=(SELECT user_id FROM users WHERE email='player2@example.com');  -- 0
SELECT count(*) FROM room_scoreboard
 WHERE user_id=(SELECT user_id FROM users WHERE email='player2@example.com');  -- >0
```

### 9.7 DDL demonstration

```bash
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f scripts/ddl-demo.sql
```

Expected: the script creates and alters objects in `cm_ddl_demo`, then rolls back. Afterwards
`public.users` still exists and `to_regclass('cm_ddl_demo.demo_players')` is `NULL`.

---

## 10. Viva questions and answers

### Design and justification

**Q1. Why two databases? Why not just PostgreSQL?**
PostgreSQL is the system of record because account/score/room data needs foreign keys,
uniqueness, CHECKs and multi-table transactions. MongoDB is the history log because a game is
a naturally nested, append-only document, and aggregation pipelines are a good fit for
statistics. History in PostgreSQL would mean ever-growing tables purely for analytics, with
no integrity benefit.

**Q2. Why not just MongoDB?**
We would lose foreign keys, cross-collection uniqueness and multi-table atomic transactions.
Personal bests, room membership and bans must be correct and relational.

**Q3. What is a vector database? Why not use one?**
A database for embeddings/similarity search. ChromaMatch does no semantic search or
recommendations, so a vector DB would add complexity with no use case. The brief listed it as
optional.

**Q4. What is the source of truth for a leaderboard?**
PostgreSQL. `global_leaderboard`, `daily_leaderboard` and `room_scoreboard` are views over
authoritative tables. MongoDB is never read for rankings.

**Q5. Why are ranks not stored?**
A rank changes whenever anyone's score changes. Storing it duplicates data and goes stale.
`ROW_NUMBER()` computes it consistently at read time.

**Q6. Why store HSV instead of hex/RGB?**
HSV is the game's input model and the scoring space. Hex/RGB is a derived display format.
Storing both would create two sources of truth.

### Schema and ER

**Q7. How many tables, and what are they?**
Nine: `users`, `daily_challenges`, `challenge_colors`, `daily_personal_bests`,
`achievements`, `user_achievements`, `rooms`, `room_colors`, `room_players`.

**Q8. What are the weak entities?**
`challenge_colors` and `room_colors`. A colour has no identity without its challenge/room.
Their primary keys include the owner's key, and they are deleted with the owner.

**Q9. What is a partial key?**
An attribute that distinguishes members of a weak entity inside one owner. Here it is
`round_number` (1–3).

**Q10. What is an identifying relationship?**
A relationship where the child's identity depends on the parent. `HAS_COLOR` and
`ROOM_HAS_COLOR` are identifying; they are drawn with a double diamond and mapped to a
foreign key in the child's composite PK.

**Q11. Why is Global PB on `users` but Daily PB in a separate table?**
Global PB is exactly one value per user, so it is a pair of columns on `users`. Daily PB is
one value per `(user, day)`, so it belongs in a bridge table keyed by both.

**Q12. Why is `room_players` a separate table instead of columns on `rooms`?**
A room has many players — a many-to-many relationship with attributes (`attempts_used`,
`best_score`, `status`, `joined_at`). Putting them on `rooms` would repeat rows and violate
1NF.

**Q13. Why does `rooms` have `creator_id` if the creator is also in `room_players`?**
They are two different relationships. CREATES is 1:N and gives the room an owner;
JOINS is M:N and gives the creator a playing membership. Both are needed.

**Q14. What is the cardinality of `JOINS`, and what attributes does it carry?**
M:N — a user can join many rooms, a room has many users. Attributes: `joined_at`, `status`,
`attempts_used`, `best_score`, `best_achieved_at`.

**Q15. Is the schema in 3NF?**
The entity tables are. Cached counters and PBs are deliberate denormalisation so that
achievements and leaderboards can be computed atomically from PostgreSQL. Ranks are not
stored at all.

**Q16. What is the difference between a candidate key, primary key and foreign key?**
A candidate key is any minimal unique identifier (e.g. `email`); the primary key is the one
chosen (`user_id`); a foreign key is a column that references a primary key in another table.

### Constraints and integrity

**Q17. What are the composite primary keys?**
`challenge_colors(daily_challenge_id, round_number)`,
`daily_personal_bests(user_id, daily_challenge_id)`,
`user_achievements(user_id, achievement_id)`,
`room_colors(room_id, round_number)`,
`room_players(room_id, user_id)`.

**Q18. How do you prevent a user earning the same achievement twice?**
The composite PK `(user_id, achievement_id)` plus `ON CONFLICT DO NOTHING` in
`evaluate_achievements`.

**Q19. How do you prevent two challenges for the same day?**
`UNIQUE (challenge_date)` plus `INSERT ... ON CONFLICT DO NOTHING`; the loser re-reads the
winner's row.

**Q20. How do you prevent a room exceeding its size?**
`join_room` checks the count while holding a `FOR UPDATE` lock on the room, and the
`room_players_before_insert` trigger re-checks as a safety net. The room row lock serialises
simultaneous joins.

**Q21. Why `ON DELETE CASCADE` on some FKs and `RESTRICT` on others?**
CASCADE for dependent data with no meaning on its own (colours, memberships, a user's PBs).
RESTRICT for history that must not silently disappear (a challenge with scores, an earned
achievement, a user who owns rooms).

**Q22. What is the difference between `UNIQUE` and a primary key?**
Both enforce uniqueness; a PK also implies `NOT NULL` and is the table's main identity. A
table can have several UNIQUE constraints but only one PK.

**Q23. Why is there both `users_username_key` and `users_username_lower_key`?**
The first preserves exact-case uniqueness; the second makes usernames case-insensitively
unique (`Sam` and `sam` collide). Without the second, a display-name impersonation is
possible.

**Q24. Is email case-insensitive at the database level?**
No. The application lower-cases it before insert. This is a documented difference; a future
migration could add `UNIQUE (lower(email))`.

**Q25. What rules cannot be expressed as a CHECK?**
Rules that count or read other rows: exactly 3 colours, room capacity, lobby-only joins,
attempts within the room's limit, status transitions, and "best score never decreases".
These use functions and triggers.

### Functions, procedures, triggers

**Q26. Function vs procedure vs trigger?**
A function returns a value (`SELECT fn()`); a procedure performs side effects (`CALL p()`);
a trigger is invoked automatically by INSERT/UPDATE/DELETE and returns a trigger row.

**Q27. Why is the game logic in PL/pgSQL rather than TypeScript?**
It needs to be atomic with the locks and constraints, and it must not be bypassable. One
function call = one transaction. The API stays a thin validation layer.

**Q28. Walk me through `submit_game_result`.**
Validate → lock user → sum/max → first-in-mode → increment games → update Global PB or Daily
PB + streak → update the user row → evaluate achievements → return JSON.

**Q29. How does `evaluate_achievements` work?**
It selects achievements the user does not have whose rule is now true (CTE `eligible`),
inserts them with `ON CONFLICT DO NOTHING` (CTE `inserted`), and returns only the rows that
were actually inserted, ordered by id.

**Q30. Why does the trigger lock the room row on insert?**
To serialise joins. Without the lock, two transactions could both count "one slot free" and
both insert, exceeding `room_size`.

**Q31. What are the allowed room status transitions?**
`lobby → in_progress`, `lobby → cancelled`, `in_progress → finished`. Same-status updates
are allowed; everything else raises `VALIDATION_ERROR`.

**Q32. What happens when the last active member leaves/finishes?**
`check_room_over` sees no `active` member and sets the room to `finished` with `ended_at`.

**Q33. Why no trigger for achievements?**
The design decision was to award them inside `submit_game_result` so the whole result is one
transaction and one code path. A separate trigger would add ordering/recursion complexity for
no benefit.

### Views, indexes, performance

**Q34. What is a view? Is it stored data?**
A named query. A normal view stores no data; it runs against the base tables each time.
A materialised view would store results but need refreshing.

**Q35. How are ties broken on the leaderboard?**
Score DESC, then earliest `achieved_at`, then lowest `user_id`. This makes the rank
deterministic, so the list and "my rank" always agree.

**Q36. Why does the room view have `rank = NULL` for some rows?**
Members who have not completed an attempt have no score. They are shown at the bottom
without a rank rather than being given a fake 0.

**Q37. What is a partial index, and why use one?**
An index with a `WHERE` clause. Our Global leaderboard index contains only non-banned users
with a PB, which is exactly the view's rows, so it is smaller and cheaper.

**Q38. Why is there a separate index on `room_players(user_id)`?**
The PK is `(room_id, user_id)`. A B-tree can use the leftmost column (`room_id`) but not
`user_id` alone. "Which rooms is this user in?" needs the extra index.

**Q39. Does an index slow writes?**
Yes, slightly: every insert/update must maintain it. We only added indexes that match real
queries, and we documented all 20 (6 explicit + 14 backing constraints).

**Q40. How would you make the leaderboard faster at huge scale?**
Materialised views or cached snapshots, refreshed periodically; partitioning; read replicas.
At classroom scale the indexed views are already fast, and live ranks are simpler and always
correct.

### Transactions and concurrency

**Q41. What is ACID? Give an example.**
Atomicity, Consistency, Isolation, Durability. A game submission updates the counter, PB,
streak and achievements; if the achievement insert fails, everything rolls back and the game
is not counted. One function call = one transaction.

**Q42. What is `FOR UPDATE`?**
A row lock. It blocks other transactions from updating the same row until this transaction
ends. We use it on the user row for submissions and on the room row for room operations.

**Q43. How do you avoid deadlocks?**
A fixed lock order: always `rooms` first, then `room_players`. Game submissions lock only the
user row.

**Q44. Two players submit their final room attempt at the same time. What happens?**
Each locks the room row in turn. The first increments its attempt and runs
`check_room_over`; the second then does the same. The second sees the first's committed state,
so the room finishes exactly once.

**Q45. What happens if the same Global game is submitted twice?**
The second call is a separate valid submission: it increments games again and may update the
PB. There is no nonce table. This is a known limitation; the token's 2-hour expiry and the
13-second floor limit abuse but do not make submission idempotent. A future fix is a
`jti`-based used-token table or a uniqueness constraint per game.

### MongoDB

**Q46. Why one collection for all modes?**
The shapes share a common core (`user_id`, `mode`, `played_at`, `total_score`, `rounds`);
only a few fields differ. One collection keeps queries and analytics simple. The `mode` field
distinguishes them.

**Q47. What does the JSON Schema validator enforce?**
Required fields, allowed modes, exactly 3 rounds, HSV ranges, score ranges, and the
mode-specific fields (`daily_challenge_id`, `room_id`, `attempt_number`, `color_number`).

**Q48. Why `oneOf` instead of `if/then`?**
MongoDB's `$jsonSchema` does not support `if/then`, so the three mode branches are expressed
as a `oneOf`.

**Q49. What is `$unwind`?**
It expands an array field into one document per element. We use it to analyse individual
rounds.

**Q50. How does history pagination work?**
Newest first, `(played_at, _id)` cursor, limit + 1 to detect more. Index
`{user_id: 1, played_at: -1}`. A cursor avoids the offset drift of `skip`.

**Q51. Why do aggregations exclude rooms?**
Room attempts are a separate social mode; they must not inflate a player's overall games,
average or accuracy. Pipelines match `mode ∈ {global, daily}`. Recent history still shows
rooms, tagged.

**Q52. What happens if MongoDB is down?**
The game still submits and Postgres stays authoritative. The insert is logged, retried once,
and swallowed. The profile's history block degrades (`historyAvailable: false`) but the
Postgres counters still render.

**Q53. Why are the ids in MongoDB `Long`?**
PostgreSQL ids are 64-bit. BSON `Long` preserves that range and matches the validator's
`bsonType: "long"`. Round/attempt numbers are `Int32`.

**Q54. Is there referential integrity between the two databases?**
No. `user_id`, `daily_challenge_id` and `room_id` are logical references enforced by the
application. A foreign key cannot cross database engines.

### Security and operations

**Q55. How do you stop a player submitting a fake score?**
The browser never sends scores. The server computes them from the signed token's targets and
the guesses. The token is HS256-signed, has a 2-hour expiry, is audience/user-bound, and the
submit path enforces exactly 3 rounds and at least 13 seconds elapsed.

**Q56. How do you stop SQL injection?**
Every query is parameterized through Drizzle's `sql` template or the Drizzle query builder.
No request value is concatenated into SQL.

**Q57. How are passwords stored?**
Argon2id hashes with per-password salts. Unknown emails still run a dummy verify so timing
does not reveal account existence.

**Q58. How is authorisation enforced?**
Session cookie for identity; `requireUser` / `requireAdmin` re-read role and ban state from
PostgreSQL; admin procedures re-check the role inside SQL. Room actions check membership.

**Q59. Why is the room code random instead of a sequential id?**
A sequential id is guessable and would let anyone join a private room. The 8-character code
from an unambiguous alphabet is used for sharing; the numeric `room_id` stays internal.

**Q60. What does `CM000` mean?**
A custom SQLSTATE used by our functions/triggers to signal a **domain** error. The message is
an application error code such as `ROOM_FULL`; the mapper turns it into a clean `AppError`
without leaking SQL details.

### Testing

**Q61. How is the database tested?**
Unit tests use fakes for services; integration tests run against **real** Docker PostgreSQL
and MongoDB. They cover schema/constraints, indexes, triggers, functions, views, seeds,
Mongo validator/indexes, history documents/pagination, every aggregation, auth queries,
leaderboard services and admin procedures. The e2e tests play real games in Chromium.

**Q62. Why not mock the database in integration tests?**
Mocking would not prove that a constraint, trigger or JSON Schema actually fires. The bugs
we care about are database behaviours, so the tests use the real engines.

---

## 11. Last-minute cheat sheet

### Numbers

| Thing | Count / value |
|---|---|
| Databases | 2 (PostgreSQL + MongoDB) |
| PostgreSQL tables | 9 |
| Base columns | 56 |
| SQL functions | 12 total = 9 business + 3 trigger functions |
| Stored procedures | 2 |
| Triggers | 3 |
| Views | 3 |
| Indexes | 20 = 6 explicit + 14 backing PK/UNIQUE constraints |
| MongoDB collections | 1 (`game_history`) |
| MongoDB indexes | 4 (2 partial) |
| Rounds per game / attempt | 3 |
| Round score | 0.0–10.0 |
| Game score | 0.0–30.0 |
| Reveal window | 5 seconds |
| Anti-cheat minimum | 13 seconds |
| Game token TTL | 2 hours |
| Default/max leaderboard page | 50 / 100 |
| Default/max history page | 20 / 100 |
| Room size | DB minimum 2; API maximum 10 |
| Room attempts | 3 or 5 |
| Room timers | null, 5, 10 or 15 seconds |
| Daily reset | 00:00 UTC |

### One-line definitions

- **PK:** uniquely identifies a row.
- **FK:** points to a PK in another table; prevents orphans.
- **Composite key:** PK made of two or more columns.
- **Weak entity:** no identity without its owner.
- **Partial key:** distinguishes weak entities inside one owner (`round_number`).
- **CHECK:** a boolean rule enforced by the database.
- **Index:** read-speed structure; costs write time and space.
- **Partial index:** index with a `WHERE` filter.
- **View:** saved query; no stored rows.
- **Trigger:** automatic code on row change.
- **Function/procedure:** stored PL/pgSQL code; function returns a value, procedure uses CALL.
- **Transaction:** all-or-nothing unit of work.
- **ACID:** Atomicity, Consistency, Isolation, Durability.
- **Denormalisation:** storing a derived value for speed; here, only cached counters/PBs.
- **Logical foreign key:** a cross-database reference the app enforces, not the DB.

### The three “if you get stuck” sentences

1. *"PostgreSQL is the system of record; MongoDB is the append-only history log."*
2. *"Every state change is one SQL function call, so it is atomic and cannot be bypassed."*
3. *"Constraints handle single-row rules; functions and triggers handle rules that span rows."*

### Whiteboard order (60 seconds)

```
users ──< room_players >── rooms ──< room_colors
  │                          │
  │                          └── creator_id
  ├──< daily_personal_bests >── daily_challenges ──< challenge_colors
  └──< user_achievements >── achievements
```

Then say: straight line = 1:N, bridge = M:N, double box = weak entity, and the two databases
are linked only logically by ids.

---

## 12. Known limitations and honest answers

Examiners respect a team that knows its boundaries. These are the real ones.

| Limitation | Why it exists | What you can say |
|---|---|---|
| No transaction spans PostgreSQL and MongoDB | Different engines cannot share a transaction | PostgreSQL commits first and is authoritative; Mongo is best-effort with a log + one retry. A missing history row never corrupts a score |
| Replaying a still-valid game token is not blocked | No used-token (`jti`) table | The token stops tampering/expiry; 13-second floor stops instant scripts; a replay is a known future fix |
| Room timers are client-reported (`timed_out`) | The timer runs in the browser | The server scores the submitted slider positions normally; the flag is only metadata for history |
| Email uniqueness is case-sensitive in SQL | The app lower-cases before insert | A future migration could add `UNIQUE (lower(email))` |
| `room_size` has no DB upper bound | Design left it open | The API caps it at 10 (`ROOM_MAX_SIZE`); the DB enforces ≥ 2 |
| Room code “never reused” is operational, not absolute | UNIQUE only covers existing rooms | The app never deletes rooms, so in practice it holds |
| Exactly 3 colours is not a CHECK | A row CHECK cannot count siblings | The creation function inserts the day/room and its three colours in one transaction |
| Creator's lobby row is kept when the room is cancelled | The room row still references the creator | Non-creator lobby leavers are deleted; the creator's membership remains for the cancelled room |
| No audit table for admin edits | Optional design item; logging chosen instead | Successful edits/bans emit a structured `admin_action` log |
| Admin edits do not rewrite MongoDB history | History is insert-only | Stats and history can legitimately differ after a correction |
| No scheduled Daily creation job | Creation is lazy on first request | `ensure_daily_challenge` is race-safe and only allows today (UTC) |
| A late-finishing Daily game from an earlier day | The challenge date is when the game started | The function handles `D < last` by leaving the streak and last date unchanged; this is documented |
| Banned players still appear in room scoreboards | Design default | Ban affects Global/Daily fairness; private rooms keep everyone |
| Displayed streak can differ from stored streak | Stored value updates only when a Daily is played | `displayStreak()` shows 0 once the last play is older than yesterday (UTC) |

---

## 13. Where each thing lives in the repo

| Topic | File |
|---|---|
| Full design rationale | `docs/ChromaMatch_Database_Design.md` |
| Architecture rules | `docs/ChromaMatch_Architecture.md` §5.8–5.9 |
| Game rules | `docs/ChromaMatch_Game_Design.md` |
| SQL object inventory | `docs/SQL_OBJECTS.md` |
| Design-vs-implementation differences | `docs/SCHEMA_DIFF.md` |
| Demo script | `docs/DEMO.md` |
| DDL demonstration | `scripts/ddl-demo.sql` |
| Drizzle table definitions | `src/lib/db/pg/schema.ts` |
| Migration 1: tables and FKs | `drizzle/0000_chemical_zaran.sql` |
| Migration 2: cross-column checks | `drizzle/0001_cross_column_checks.sql` |
| Migration 3: indexes | `drizzle/0002_indexes.sql` |
| Migration 4: triggers | `drizzle/0003_triggers.sql` |
| Migration 5: game functions | `drizzle/0004_game_functions.sql` |
| Migration 6: daily function | `drizzle/0005_daily_function.sql` |
| Migration 7: room functions | `drizzle/0006_room_functions.sql` |
| Migration 8: admin procedures | `drizzle/0007_admin_procedures.sql` |
| Migration 9: views | `drizzle/0008_views.sql` |
| Typed SQL wrappers | `src/lib/db/pg/functions.ts` |
| Postgres error mapping | `src/lib/db/pg/errors.ts` |
| Leaderboard readers | `src/lib/db/pg/queries/leaderboards.ts` |
| Daily readers | `src/lib/db/pg/queries/daily.ts` |
| Room readers | `src/lib/db/pg/queries/rooms.ts` |
| User readers | `src/lib/db/pg/queries/users.ts` |
| Admin readers | `src/lib/db/pg/queries/admin.ts` |
| Achievement readers | `src/lib/db/pg/queries/achievements.ts` |
| Mongo client | `src/lib/db/mongo/client.ts` |
| Mongo document builder/repository | `src/lib/db/mongo/historyRepo.ts` |
| Mongo aggregations | `src/lib/db/mongo/aggregations.ts` |
| Mongo validator + indexes | `scripts/init-mongo.ts` |
| Achievement seed | `scripts/seed-achievements.ts` |
| Admin seed | `scripts/seed-admin.ts` |
| Game submit flow | `src/lib/services/gameService.ts` |
| Daily flow | `src/lib/services/dailyChallengeService.ts` |
| Room flow | `src/lib/services/roomService.ts` |
| Profile/stats flow | `src/lib/services/statsService.ts` |
| Admin flow | `src/lib/services/adminService.ts` |
| Health check | `src/lib/services/healthService.ts` |
| Integration tests | `tests/integration/` |
| E2E tests | `tests/e2e/` |

---

## Final advice for the viva

1. **Start with the two-database sentence.** It anchors everything else.
2. **Draw the nine tables as four families.** Do not try to recite columns.
3. **Name the advanced features with an example each:** transaction (game submit), function
   (`submit_game_result`), procedure (`admin_set_ban`), trigger (room capacity), view
   (`global_leaderboard`), index (partial Global index), NoSQL aggregation (trend).
4. **Know one concurrency story cold:** two players joining the last room slot, or two game
   submissions for one user. Explain the lock.
5. **Know one integrity story cold:** the composite keys and the cross-column checks.
6. **Be honest about limitations.** Section 12 gives you the exact sentences.
7. **If you do not know something, say what you do know** and reason from the design:
   "The database enforces X, the service enforces Y, and here is why."

Good luck.
