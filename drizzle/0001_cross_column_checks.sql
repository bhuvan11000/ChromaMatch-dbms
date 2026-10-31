-- Cross-column checks that Drizzle cannot express in schema.ts.
-- See Database Design §6.1, §6.5, §6.7, §6.9 and §10.1.
--
-- WHAT THIS FILE DOES
-- Drizzle's schema.ts can only describe rules that involve ONE column
-- (e.g. "score between 0 and 30"). The rules below compare TWO OR MORE columns
-- in the same row, so they are added here by hand as CHECK constraints.
-- A CHECK constraint makes PostgreSQL reject any INSERT/UPDATE that breaks the rule.

-- CHECK 1 (users): the global best score and its timestamp must be set together.
-- ("global_best_score" IS NULL) = ("global_best_achieved_at" IS NULL) is only true when
-- both are NULL (player has never played) or both are NOT NULL (player has a best score).
-- This prevents a score with no date, or a date with no score.
ALTER TABLE "users"
  ADD CONSTRAINT "users_global_best_pair_check"
  CHECK (("global_best_score" IS NULL) = ("global_best_achieved_at" IS NULL));--> statement-breakpoint

-- CHECK 2 (users): the longest daily streak can never be smaller than the current streak.
-- If the current streak grows past the old record, the record must be updated at the same time.
ALTER TABLE "users"
  ADD CONSTRAINT "users_longest_ge_current_check"
  CHECK ("longest_daily_streak" >= "current_daily_streak");--> statement-breakpoint

-- CHECK 3 (room_players): a player's best score in a room and its timestamp must be set together.
-- Same "both NULL or both NOT NULL" rule as users, but for a single room.
ALTER TABLE "room_players"
  ADD CONSTRAINT "room_players_best_pair_check"
  CHECK (("best_score" IS NULL) = ("best_achieved_at" IS NULL));--> statement-breakpoint

-- CHECK 4 (achievements): threshold must match the type of achievement.
-- 'games_played', 'daily_streak' and 'perfect_round' need a number to reach, so threshold is REQUIRED.
-- 'new_pb', 'first_daily' and 'first_global' are one-off events, so threshold must be NULL.
ALTER TABLE "achievements"
  ADD CONSTRAINT "achievements_threshold_presence_check"
  CHECK (
    ("criteria_type" IN ('games_played', 'daily_streak', 'perfect_round') AND "threshold" IS NOT NULL)
    OR ("criteria_type" IN ('new_pb', 'first_daily', 'first_global') AND "threshold" IS NULL)
  );--> statement-breakpoint

-- CHECK 5 (rooms): the status of a room must agree with its started_at / ended_at timestamps.
--   lobby        -> not started, not ended
--   in_progress  -> started, not ended
--   finished     -> started and ended
--   cancelled    -> never started, but ended (cancelled while still in the lobby)
-- (The rooms_before_update trigger in 0003 enforces the same rule with clearer error codes.)
ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_status_timestamps_check"
  CHECK (
    ("status" = 'lobby' AND "started_at" IS NULL AND "ended_at" IS NULL)
    OR ("status" = 'in_progress' AND "started_at" IS NOT NULL AND "ended_at" IS NULL)
    OR ("status" = 'finished' AND "started_at" IS NOT NULL AND "ended_at" IS NOT NULL)
    OR ("status" = 'cancelled' AND "started_at" IS NULL AND "ended_at" IS NOT NULL)
  );
