-- Cross-column checks that Drizzle cannot express in schema.ts.
-- See Database Design §6.1, §6.5, §6.7, §6.9 and §10.1.

ALTER TABLE "users"
  ADD CONSTRAINT "users_global_best_pair_check"
  CHECK (("global_best_score" IS NULL) = ("global_best_achieved_at" IS NULL));--> statement-breakpoint

ALTER TABLE "users"
  ADD CONSTRAINT "users_longest_ge_current_check"
  CHECK ("longest_daily_streak" >= "current_daily_streak");--> statement-breakpoint

ALTER TABLE "room_players"
  ADD CONSTRAINT "room_players_best_pair_check"
  CHECK (("best_score" IS NULL) = ("best_achieved_at" IS NULL));--> statement-breakpoint

ALTER TABLE "achievements"
  ADD CONSTRAINT "achievements_threshold_presence_check"
  CHECK (
    ("criteria_type" IN ('games_played', 'daily_streak', 'perfect_round') AND "threshold" IS NOT NULL)
    OR ("criteria_type" IN ('new_pb', 'first_daily', 'first_global') AND "threshold" IS NULL)
  );--> statement-breakpoint

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_status_timestamps_check"
  CHECK (
    ("status" = 'lobby' AND "started_at" IS NULL AND "ended_at" IS NULL)
    OR ("status" = 'in_progress' AND "started_at" IS NOT NULL AND "ended_at" IS NULL)
    OR ("status" = 'finished' AND "started_at" IS NOT NULL AND "ended_at" IS NOT NULL)
    OR ("status" = 'cancelled' AND "started_at" IS NULL AND "ended_at" IS NOT NULL)
  );
