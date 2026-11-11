# SQL Object Inventory

**Source of truth:** the applied migrations in `drizzle/0000_chemical_zaran.sql` through
`drizzle/0008_views.sql`. The list below was produced by reading those files; the
local database was used only to confirm the names and signatures. `scripts/ddl-demo.sql`
is a course demonstration and is deliberately **not** part of this inventory.

Logical migration order (§5.8.2) maps to the files as follows:

| Order | File | Contents |
|---|---|---|
| 1 | `0000_chemical_zaran.sql` | Tables, PK/FK/UNIQUE, defaults, simple CHECKs |
| 2 | `0001_cross_column_checks.sql` | Cross-column CHECKs |
| 3 | `0002_indexes.sql` | Performance and case-insensitive username indexes |
| 4 | `0003_triggers.sql` | Room trigger functions and triggers |
| 5 | `0004_game_functions.sql` | `evaluate_achievements`, `submit_game_result` |
| 6 | `0005_daily_function.sql` | `ensure_daily_challenge` |
| 7 | `0006_room_functions.sql` | Room functions + `check_room_over` |
| 8 | `0007_admin_procedures.sql` | `admin_set_ban`, `admin_update_user_stats` |
| 9 | `0008_views.sql` | `global_leaderboard`, `daily_leaderboard`, `room_scoreboard` |

Totals: **12 functions** (9 business + 3 trigger functions), **2 procedures**,
**3 triggers**, **3 views**, and **20 indexes** (6 explicit `CREATE INDEX` + 14
constraint-backed PK/UNIQUE indexes).

---

## 1. Functions (12)

### 1.1 Game, Daily and Room functions (9)

| Name and signature | Purpose | File |
|---|---|---|
| `evaluate_achievements(p_user_id bigint, p_mode text, p_max_round_score numeric, p_beat_existing_pb boolean, p_first_in_mode boolean) → jsonb` | Inserts newly earned achievements for the user (`ON CONFLICT DO NOTHING`) and returns the inserted `{achievement_id, name, description}` array. | `0004_game_functions.sql` |
| `submit_game_result(p_user_id bigint, p_mode text, p_challenge_id bigint, p_round_scores numeric[], p_played_at timestamptz) → jsonb` | Atomic completion of one Global/Daily game: validates input, locks the user row, updates counters/PB/streak, calls `evaluate_achievements`, returns total/PB/streak/unlocked. This is the normal game-play writer of solo-game stats; deliberate admin edits use `admin_update_user_stats`. | `0004_game_functions.sql` |
| `ensure_daily_challenge(p_date date, p_colors jsonb) → bigint` | Race-safe creation of today's Daily challenge and its 3 colours in one transaction; returns the existing id if another transaction won. Rejects any date other than the current UTC date with `INVALID_DATE`. | `0005_daily_function.sql` |
| `check_room_over(p_room_id bigint) → void` | Internal helper: if the room is `in_progress` and no member is still `active`, sets it to `finished` with `ended_at = now()`. Caller must already hold the room lock. | `0006_room_functions.sql` |
| `create_room(p_creator_id bigint, p_room_code text, p_room_size smallint, p_timer_seconds smallint, p_attempts_limit smallint) → jsonb` | Validates settings, inserts a `lobby` room and the creator's `room_players` row, returns `{room_id, room_code}`. A duplicate code surfaces as SQLSTATE `23505` for the service retry. | `0006_room_functions.sql` |
| `join_room(p_user_id bigint, p_room_code text) → jsonb` | Locks the room by code, allows joins only in `lobby`, returns `already_member` idempotently, enforces capacity and inserts the member. Returns `{room_id, outcome}`. | `0006_room_functions.sql` |
| `start_room(p_user_id bigint, p_room_code text, p_colors jsonb) → jsonb` | Creator-only start: requires `lobby` and at least 2 members, inserts the 3 room colours, then sets `in_progress` + `started_at` in the same transaction. Returns `{room_id, started_at}`. | `0006_room_functions.sql` |
| `leave_room(p_user_id bigint, p_room_code text) → jsonb` | Locks room then member. In `lobby`: creator cancels the room, other members are deleted. In `in_progress`: an `active` member becomes `left` and `check_room_over` runs. Finished/cancelled rooms are a no-op. Returns `{outcome, room_status}`. | `0006_room_functions.sql` |
| `submit_room_attempt(p_user_id bigint, p_room_id bigint, p_round_scores numeric[]) → jsonb` | Locks room then member, validates scores/status/attempts, increments `attempts_used`, updates `best_score` only when strictly better, marks the member `finished` at the limit, and runs `check_room_over`. Does not touch user stats, PBs, streaks or achievements. | `0006_room_functions.sql` |

### 1.2 Trigger functions (3)

| Name and signature | Purpose | File |
|---|---|---|
| `room_players_before_insert() → trigger` | Locks the room row, rejects inserts when the room is not `lobby` (`ROOM_NOT_LOBBY`) and when the member count is already `room_size` (`ROOM_FULL`). | `0003_triggers.sql` |
| `room_players_before_update() → trigger` | Rejects `attempts_used > attempts_limit` (`ATTEMPTS_EXHAUSTED`), attempts increases when the old status is not `active` (`MEMBER_NOT_ACTIVE`), invalid status transitions (`MEMBER_NOT_ACTIVE`), and decreasing/clearing `best_score` (`VALIDATION_ERROR`). | `0003_triggers.sql` |
| `rooms_before_update() → trigger` | Allows only `lobby → in_progress`, `lobby → cancelled`, `in_progress → finished` (or same-status updates) and checks `started_at`/`ended_at` against the new status (`VALIDATION_ERROR`). | `0003_triggers.sql` |

---

## 2. Procedures (2)

| Name and signature | Purpose | File |
|---|---|---|
| `admin_set_ban(p_admin_id bigint, p_target_id bigint, p_banned boolean)` | Re-checks that the caller is an admin (`FORBIDDEN`), locks the target, rejects self/admin targets (`CANNOT_BAN_ADMIN`), then sets `users.is_banned`. Invoked with `CALL`. | `0007_admin_procedures.sql` |
| `admin_update_user_stats(p_admin_id bigint, p_target_id bigint, p_patch jsonb)` | Re-checks the admin role, locks the target, accepts only the six documented stats keys (`INVALID_PATCH` otherwise), applies the patch, and maps type/constraint failures to `VALIDATION_ERROR`. Invoked with `CALL`. | `0007_admin_procedures.sql` |

---

## 3. Triggers (3)

| Name | Table / event | Purpose | File |
|---|---|---|---|
| `trg_room_players_before_insert` | `room_players` BEFORE INSERT, FOR EACH ROW | Attaches `room_players_before_insert()`: lobby-only joins and capacity. | `0003_triggers.sql` |
| `trg_room_players_before_update` | `room_players` BEFORE UPDATE, FOR EACH ROW | Attaches `room_players_before_update()`: attempt limits, status transitions, non-decreasing best score. | `0003_triggers.sql` |
| `trg_rooms_before_update` | `rooms` BEFORE UPDATE, FOR EACH ROW | Attaches `rooms_before_update()`: status transitions and timestamp consistency. | `0003_triggers.sql` |

---

## 4. Views (3)

| Name | Columns | Purpose | File |
|---|---|---|---|
| `global_leaderboard` | `rank`, `user_id`, `username`, `score`, `achieved_at` | Non-banned users with a Global PB, ranked by score DESC, earliest `achieved_at`, then `user_id`. | `0008_views.sql` |
| `daily_leaderboard` | `daily_challenge_id`, `challenge_date`, `rank`, `user_id`, `username`, `score`, `achieved_at` | Non-banned Daily PBs joined to users and challenges, ranked per `daily_challenge_id` with the same tie-break. | `0008_views.sql` |
| `room_scoreboard` | `room_id`, `rank`, `user_id`, `username`, `member_status`, `attempts_used`, `best_score`, `best_achieved_at` | Room members joined to users; banned players are **not** filtered. `rank` is `NULL` when `best_score` is `NULL`. | `0008_views.sql` |

---

## 5. Indexes (20)

### 5.1 Explicit `CREATE INDEX` (6)

| Name | Definition | Purpose | File |
|---|---|---|---|
| `users_global_best_score_idx` | `users (global_best_score DESC) WHERE is_banned = false AND global_best_score IS NOT NULL` | Partial index for the Global leaderboard. | `0002_indexes.sql` |
| `daily_personal_bests_daily_challenge_score_idx` | `daily_personal_bests (daily_challenge_id, best_score DESC)` | Daily leaderboard lookup/sort. | `0002_indexes.sql` |
| `room_players_room_score_idx` | `room_players (room_id, best_score DESC)` | Room scoreboard lookup/sort. | `0002_indexes.sql` |
| `room_players_user_id_idx` | `room_players (user_id)` | “Which rooms is this user in?”; the composite PK cannot serve it. | `0002_indexes.sql` |
| `rooms_status_idx` | `rooms (status)` | Filtering rooms by lifecycle state. | `0002_indexes.sql` |
| `users_username_lower_key` | `UNIQUE users (lower(username))` | Case-insensitive username uniqueness (the optional §5.8.6 index). | `0002_indexes.sql` |

### 5.2 Indexes created implicitly by PK/UNIQUE constraints (14)

These are real indexes but are created by the constraints in `0000_chemical_zaran.sql`,
not by a separate `CREATE INDEX` statement.

| Table | Index | Backing constraint |
|---|---|---|
| `achievements` | `achievements_pkey` | PK (`achievement_id`) |
| `achievements` | `achievements_name_key` | UNIQUE (`name`) |
| `challenge_colors` | `challenge_colors_pkey` | PK (`daily_challenge_id`, `round_number`) |
| `daily_challenges` | `daily_challenges_pkey` | PK (`daily_challenge_id`) |
| `daily_challenges` | `daily_challenges_challenge_date_key` | UNIQUE (`challenge_date`) |
| `daily_personal_bests` | `daily_personal_bests_pkey` | PK (`user_id`, `daily_challenge_id`) |
| `room_colors` | `room_colors_pkey` | PK (`room_id`, `round_number`) |
| `room_players` | `room_players_pkey` | PK (`room_id`, `user_id`) |
| `rooms` | `rooms_pkey` | PK (`room_id`) |
| `rooms` | `rooms_room_code_key` | UNIQUE (`room_code`) |
| `user_achievements` | `user_achievements_pkey` | PK (`user_id`, `achievement_id`) |
| `users` | `users_pkey` | PK (`user_id`) |
| `users` | `users_email_key` | UNIQUE (`email`) |
| `users` | `users_username_key` | UNIQUE (`username`) |

---

## 6. Architecture §5.8 alignment

| Check | Result |
|---|---|
| Migration files are contiguous (`0000`–`0008`) and match the nine logical migrations in §5.8.2 | ✅ No gaps or reordering |
| Every function named in §5.8.3 exists with the documented argument order/types and return type | ✅ All 9 business functions match |
| `check_room_over` is an internal helper and is not called by the app directly | ✅ Only called by `leave_room` / `submit_room_attempt` |
| Every trigger named in §5.8.4 exists on the documented table/event with the documented purpose | ✅ 3/3 match |
| Every view in §5.8.5 exists with the documented columns and tie-break rules | ✅ 3/3 match |
| Every index in §5.8.6 exists | ✅ 5 required indexes present |
| The optional `UNIQUE (lower(username))` from §5.8.6 | ✅ Present as `users_username_lower_key` |
| No extra business functions, procedures, triggers or views beyond §5.8 | ✅ None found |

**Mismatches with Architecture §5.8: none.**

The only optional item exercised is `users_username_lower_key`, which §5.8.2/§5.8.6
explicitly allow. The three trigger function names (`room_players_before_insert`,
`room_players_before_update`, `rooms_before_update`) are implementation details;
§5.8.4 specifies the trigger names and behaviour, both of which match.
