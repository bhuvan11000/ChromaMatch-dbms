-- PostgreSQL indexes from Database Design §9 / Architecture §5.8.6.
-- `rooms.room_code` and `daily_challenges.challenge_date` are already covered
-- by their UNIQUE constraints.
--
-- WHAT THIS FILE DOES
-- An index is a lookup structure that lets PostgreSQL find or sort rows quickly
-- without scanning the whole table. These indexes speed up the leaderboards,
-- room scoreboards and room look-ups. They cost a little extra storage and write time.

-- INDEX 1: speeds up the global leaderboard (highest score first).
-- It is a PARTIAL index: it only includes users who are not banned and who have a score,
-- which is exactly what the global_leaderboard view (0008) shows, so the index stays small.
CREATE INDEX "users_global_best_score_idx"
  ON "users" ("global_best_score" DESC)
  WHERE "is_banned" = false AND "global_best_score" IS NOT NULL;--> statement-breakpoint

-- INDEX 2: speeds up the daily leaderboard. Finds all scores for one daily challenge,
-- already sorted from highest to lowest.
CREATE INDEX "daily_personal_bests_daily_challenge_score_idx"
  ON "daily_personal_bests" ("daily_challenge_id", "best_score" DESC);--> statement-breakpoint

-- INDEX 3: speeds up the room scoreboard. Finds all players of one room,
-- already sorted by best score.
CREATE INDEX "room_players_room_score_idx"
  ON "room_players" ("room_id", "best_score" DESC);--> statement-breakpoint

-- INDEX 4: speeds up "which rooms is this user in?" queries.
-- The primary key (room_id, user_id) can't help here because user_id is not its first column.
CREATE INDEX "room_players_user_id_idx"
  ON "room_players" ("user_id");--> statement-breakpoint

-- INDEX 5: speeds up filtering rooms by status (e.g. listing rooms still in the 'lobby').
CREATE INDEX "rooms_status_idx"
  ON "rooms" ("status");--> statement-breakpoint

-- INDEX 6 (UNIQUE): usernames must be unique ignoring upper/lower case.
-- "Sam" and "sam" count as the same name, because the index is built on lower("username").
-- Architecture §1.5 R2: usernames are unique case-insensitively.
CREATE UNIQUE INDEX "users_username_lower_key"
  ON "users" (lower("username"));
