-- PostgreSQL indexes from Database Design §9 / Architecture §5.8.6.
-- `rooms.room_code` and `daily_challenges.challenge_date` are already covered
-- by their UNIQUE constraints.

CREATE INDEX "users_global_best_score_idx"
  ON "users" ("global_best_score" DESC)
  WHERE "is_banned" = false AND "global_best_score" IS NOT NULL;--> statement-breakpoint

CREATE INDEX "daily_personal_bests_daily_challenge_score_idx"
  ON "daily_personal_bests" ("daily_challenge_id", "best_score" DESC);--> statement-breakpoint

CREATE INDEX "room_players_room_score_idx"
  ON "room_players" ("room_id", "best_score" DESC);--> statement-breakpoint

CREATE INDEX "room_players_user_id_idx"
  ON "room_players" ("user_id");--> statement-breakpoint

CREATE INDEX "rooms_status_idx"
  ON "rooms" ("status");--> statement-breakpoint

-- Architecture §1.5 R2: usernames are unique case-insensitively.
CREATE UNIQUE INDEX "users_username_lower_key"
  ON "users" (lower("username"));
