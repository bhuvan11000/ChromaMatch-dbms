-- Leaderboard and scoreboard views. Architecture §5.8.5 (order 9).
-- Ranks use ROW_NUMBER() with a deterministic tie-break:
-- score DESC, earliest achieved_at, lowest user_id.

CREATE OR REPLACE VIEW "global_leaderboard" AS
SELECT
  ROW_NUMBER() OVER (
    ORDER BY u."global_best_score" DESC,
             u."global_best_achieved_at" ASC,
             u."user_id" ASC
  ) AS "rank",
  u."user_id" AS "user_id",
  u."username" AS "username",
  u."global_best_score" AS "score",
  u."global_best_achieved_at" AS "achieved_at"
FROM "users" u
WHERE u."is_banned" = false
  AND u."global_best_score" IS NOT NULL;--> statement-breakpoint

CREATE OR REPLACE VIEW "daily_leaderboard" AS
SELECT
  dpb."daily_challenge_id" AS "daily_challenge_id",
  dc."challenge_date" AS "challenge_date",
  ROW_NUMBER() OVER (
    PARTITION BY dpb."daily_challenge_id"
    ORDER BY dpb."best_score" DESC,
             dpb."achieved_at" ASC,
             dpb."user_id" ASC
  ) AS "rank",
  dpb."user_id" AS "user_id",
  u."username" AS "username",
  dpb."best_score" AS "score",
  dpb."achieved_at" AS "achieved_at"
FROM "daily_personal_bests" dpb
JOIN "users" u ON u."user_id" = dpb."user_id"
JOIN "daily_challenges" dc
  ON dc."daily_challenge_id" = dpb."daily_challenge_id"
WHERE u."is_banned" = false;--> statement-breakpoint

-- Banned players are intentionally shown in room scoreboards (§6 default).
CREATE OR REPLACE VIEW "room_scoreboard" AS
SELECT
  rp."room_id" AS "room_id",
  CASE
    WHEN rp."best_score" IS NULL THEN NULL
    ELSE ROW_NUMBER() OVER (
      PARTITION BY rp."room_id"
      ORDER BY rp."best_score" DESC NULLS LAST,
               rp."best_achieved_at" ASC NULLS LAST,
               rp."user_id" ASC
    )
  END AS "rank",
  rp."user_id" AS "user_id",
  u."username" AS "username",
  rp."status" AS "member_status",
  rp."attempts_used" AS "attempts_used",
  rp."best_score" AS "best_score",
  rp."best_achieved_at" AS "best_achieved_at"
FROM "room_players" rp
JOIN "users" u ON u."user_id" = rp."user_id";
