# Schema Diff — DB Design §5–6 vs Applied Migrations

**Compared:** `docs/ChromaMatch_Database_Design.md` §5–6 against
`src/lib/db/pg/schema.ts`, `drizzle/0000_chemical_zaran.sql`,
`drizzle/0001_cross_column_checks.sql`, and `drizzle/0002_indexes.sql`.
The live local database was inspected only to confirm the result.

**Result:** all 9 tables, 56 base columns, PKs, FKs, defaults, nullability,
and the documented simple/cross-column CHECKs match. The remaining differences
are five schema/wording gaps plus two behavioural-text gaps below.

---

## 1. Differences to update in the DB document

| # | Doc location | Document currently says | Actual migrated schema | Suggested update |
|---|---|---|---|---|
| 1 | §6.1 `users.email` | `UNIQUE (stored lowercase)` | `users_email_key UNIQUE (email)` is **case-sensitive**. Lowercasing happens in the application (`emailSchema` + `authService.normalizeEmail()`); direct SQL can insert mixed-case values or two values that differ only by case. | Either say “UNIQUE; the API normalises to lower-case before writing”, or add a future migration with `UNIQUE (lower(email))` if DB-level enforcement is required. |
| 2 | §6.1 `users.username` | `UNIQUE` | Two indexes exist: `users_username_key` on the raw value **and** `users_username_lower_key` on `lower(username)`, so usernames are unique case-insensitively (`Sam` and `sam` collide). | Document the case-insensitive rule in §6.1, not only as the “optional” index in §9. |
| 3 | §6.7 `rooms.room_code` | “Short random alphanumeric code used to join; **never reused**” | `rooms_room_code_key UNIQUE (room_code)` only prevents duplicates among **existing** rooms. If a room row is deleted, its code can be reused. The app never deletes rooms, so this is true operationally but not DB-enforced. | Say “unique among existing rooms; the application keeps finished/cancelled rooms, so codes are not reused in practice.” |
| 4 | §6.7 `rooms.room_size` | “Maximum number of players (an upper limit is still to be decided)” | DB `CHECK (room_size >= 2)` only. The API enforces the current upper bound `ROOM_MAX_SIZE = 10` (`src/lib/config/constants.ts`). | Optional: record the current application cap of 10 while keeping the DB minimum at 2. |
| 5 | §6.9 lobby leaves | “A member leaving the **lobby** has their row deleted (they never committed to the game).” | `leave_room`: a non-creator lobby member is deleted, but the **creator**’s row is kept when the room is cancelled (`outcome = room_cancelled`). | Say “non-creator members are deleted; the creator’s row is kept when the room is cancelled.” |

Items 3–5 are not column/constraint contradictions; they are documentation
claims that the database does not enforce by itself.

### Behavioural text differences (not schema-enforced)

| # | Doc location | Document currently says | Actual implementation | Suggested update |
|---|---|---|---|---|
| 6 | §6.1 streak rule | The streak becomes `1` in the “otherwise” case (never played or a day was skipped). | An earlier-day game finishing after a later day was already counted (`D < last`) leaves the streak and `last_daily_played_date` unchanged, per Architecture §5.8.3. | Add the late-finishing earlier-day case to the §6.1 rule list. |
| 7 | §6.2 challenge creation | The day and its colours are created “the first time they are needed for that date, or by a scheduled job.” | Creation is lazy (`getOrCreateToday` → `ensure_daily_challenge`); there is no scheduled job. | Say “created lazily on first request”; the scheduled-job option is future work. |

---

## 2. Verified matches

- **Tables:** `users`, `daily_challenges`, `challenge_colors`,
  `daily_personal_bests`, `achievements`, `user_achievements`, `rooms`,
  `room_colors`, `room_players` — all present with the documented columns.
- **Types and sizes:** all `BIGINT` identities, `VARCHAR` lengths
  (`username 30`, `email 255`, `achievement.name 60`, `room_code 8`,
  `role 10`, room `status 12`, member `status 10`), `NUMERIC(4,1)` HSV,
  `NUMERIC(3,1)` scores, `INTEGER` counters, `SMALLINT` room fields,
  `TIMESTAMPTZ`, and `DATE` match §6.
- **Nullability and defaults:** every `NOT NULL`, `DEFAULT now()`, `DEFAULT 0`,
  `DEFAULT false`, `DEFAULT 'player'`, `DEFAULT 'lobby'`, and
  `DEFAULT 'active'` matches §6.
- **Primary keys:** all 9 match, including five composite keys
  (`challenge_colors`, `daily_personal_bests`, `room_colors`, `room_players`,
  `user_achievements`).
- **Foreign keys:** all 9 match §5 delete behaviour:
  `challenge_colors → daily_challenges CASCADE`,
  `daily_personal_bests.user_id → users CASCADE`,
  `daily_personal_bests.daily_challenge_id → daily_challenges RESTRICT`,
  `user_achievements.user_id → users CASCADE`,
  `user_achievements.achievement_id → achievements RESTRICT`,
  `rooms.creator_id → users RESTRICT`,
  `room_colors → rooms CASCADE`,
  `room_players.room_id → rooms CASCADE`,
  `room_players.user_id → users CASCADE`.
- **UNIQUE constraints:** `users.username`, `users.email`,
  `daily_challenges.challenge_date`, `achievements.name`, `rooms.room_code`
  all present. The extra case-insensitive username index is item 2 above.
- **CHECK constraints:** HSV ranges (0–360 / 0–100 / 0–100), round numbers 1–3,
  scores 0–30, non-negative counters, roles, room settings, room/member status
  lists, and the documented cross-column rules are all present:
  - `users_global_best_pair_check`
  - `users_longest_ge_current_check`
  - `room_players_best_pair_check`
  - `achievements_threshold_presence_check`
  - `rooms_status_timestamps_check`
- **Indexes from §9:** all five required indexes plus the optional
  `UNIQUE (lower(username))` are present (see `docs/SQL_OBJECTS.md` §5).
- **Exactly 3 colours:** the composite PKs guarantee **at most** 3; the
  “exactly 3” rule is enforced by the creating transaction/function, as §6.3
  and §6.8 describe.
- **Achievement awarding:** done inside `evaluate_achievements` /
  `submit_game_result`, not by a separate trigger — the decision recorded for
  DB doc open item 17.

---

## 3. Implementation notes (not schema differences)

- The Daily colours are generated by the application (`src/lib/domain/colors.ts`)
  and passed to `ensure_daily_challenge`; the DB stores them but does not
  generate them. §6.2’s data-level description still holds.
- Room colours are likewise generated by the application and passed to
  `start_room`, which inserts all 3 and changes the status in one transaction.
- There is still no DB upper bound on `room_size`; the API supplies `10`.
- “Exactly 3 colours” and “room code never reused” cannot be expressed as
  ordinary row-level CHECK constraints; they rely on the functions/transaction
  and on the application never deleting rooms.
