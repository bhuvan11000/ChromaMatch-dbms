-- Game result functions. Architecture §5.8.3 (orders 5).
-- Domain errors use SQLSTATE CM000; the message is an §8.1 error code.
--
-- WHAT THIS FILE DOES
-- Creates the two functions that run when a solo game (global or daily mode) ends:
--   evaluate_achievements  -> works out which new achievements the player unlocked.
--   submit_game_result     -> validates the scores, updates personal bests, streaks and
--                             game counts, then calls evaluate_achievements.

-- FUNCTION 1: evaluate_achievements
-- INPUTS : user id, mode ('global' or 'daily'), highest single-round score,
--          whether the player beat their existing personal best, whether this was
--          their first game in this mode.
-- RETURNS: a JSON array of the achievements newly unlocked, e.g.
--          [{"achievement_id":1,"name":"...","description":"..."}] or [] if none.
-- STEPS  :
--   1. Validate the inputs (bad input -> VALIDATION_ERROR).
--   2. Load the user's total games and current daily streak (missing user -> USER_NOT_FOUND).
--   3. "eligible" = achievements the user does NOT have yet whose rule is now met
--      (games_played, daily_streak, perfect_round, new_pb, first_daily, first_global).
--   4. "inserted" = save them into user_achievements. ON CONFLICT DO NOTHING means a
--      parallel request can't create duplicates.
--   5. Return only the rows that were actually inserted, ordered by achievement id.
CREATE OR REPLACE FUNCTION "evaluate_achievements"(
  p_user_id bigint,
  p_mode text,
  p_max_round_score numeric,
  p_beat_existing_pb boolean,
  p_first_in_mode boolean
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_games integer;
  v_current_streak integer;
  v_result jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('global', 'daily') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_max_round_score IS NULL OR p_max_round_score < 0 OR p_max_round_score > 10 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_beat_existing_pb IS NULL OR p_first_in_mode IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  SELECT u."total_games_played", u."current_daily_streak"
    INTO v_total_games, v_current_streak
    FROM "users" u
   WHERE u."user_id" = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  WITH eligible AS (
    SELECT a."achievement_id", a."name", a."description"
      FROM "achievements" a
     WHERE NOT EXISTS (
             SELECT 1
               FROM "user_achievements" ua
              WHERE ua."user_id" = p_user_id
                AND ua."achievement_id" = a."achievement_id"
           )
       AND (
             (a."criteria_type" = 'games_played' AND v_total_games >= a."threshold")
          OR (a."criteria_type" = 'daily_streak' AND v_current_streak >= a."threshold")
          OR (a."criteria_type" = 'perfect_round' AND p_max_round_score >= a."threshold")
          OR (a."criteria_type" = 'new_pb' AND p_beat_existing_pb)
          OR (a."criteria_type" = 'first_daily' AND p_mode = 'daily' AND p_first_in_mode)
          OR (a."criteria_type" = 'first_global' AND p_mode = 'global' AND p_first_in_mode)
       )
  ),
  inserted AS (
    INSERT INTO "user_achievements" ("user_id", "achievement_id")
    SELECT p_user_id, e."achievement_id"
      FROM eligible e
    ON CONFLICT ("user_id", "achievement_id") DO NOTHING
    RETURNING "achievement_id"
  )
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'achievement_id', e."achievement_id",
               'name', e."name",
               'description', e."description"
             )
             ORDER BY e."achievement_id"
           ),
           '[]'::jsonb
         )
    INTO v_result
    FROM inserted i
    JOIN eligible e ON e."achievement_id" = i."achievement_id";

  RETURN v_result;
END;
$$;--> statement-breakpoint

-- FUNCTION 2: submit_game_result
-- INPUTS : user id, mode ('global' or 'daily'), daily challenge id (daily mode only),
--          the 3 round scores (each 0-10), and when the game was played.
-- RETURNS: JSON with total_score, mode, total_games_played, a "pb" object
--          (previous / current / updated / beat_existing), the newly "unlocked"
--          achievements, and (daily mode only) the "streak" (current / longest).
-- STEPS  :
--   1. Validate: mode, exactly 3 scores each between 0 and 10, played_at present,
--      and challenge id required for daily but not allowed for global.
--      In daily mode the challenge must exist (else VALIDATION_ERROR).
--   2. Lock the user's row (FOR UPDATE) so parallel submissions can't corrupt stats.
--      Missing user -> USER_NOT_FOUND.
--   3. Total = sum of the 3 rounds; max round = highest single round.
--   4. Remember whether this is the player's FIRST game in this mode (done before any update).
--   5. Add 1 to total games played.
--   6. GLOBAL mode: if the total beats (or is the first) global best, save it as the new best.
--   7. DAILY mode: insert or improve the personal best for that challenge, then update the streak:
--        first ever daily -> 1 | same day again -> unchanged | next day -> +1 |
--        gap of more than one day -> reset to 1 | older day played late -> unchanged.
--      Longest streak = the larger of the old longest and the new current streak;
--      last_daily_played_date only moves forward.
--   8. Save all changes to the users row.
--   9. Call evaluate_achievements and build the JSON response.
CREATE OR REPLACE FUNCTION "submit_game_result"(
  p_user_id bigint,
  p_mode text,
  p_challenge_id bigint,
  p_round_scores numeric[],
  p_played_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric;
  v_max_round numeric;
  v_total_games integer;
  v_global_best numeric;
  v_global_best_at timestamptz;
  v_current_daily_streak integer;
  v_longest_daily_streak integer;
  v_last_daily_played_date date;
  v_challenge_date date;
  v_first_in_mode boolean;
  v_updated boolean := false;
  v_beat_existing boolean := false;
  v_previous_pb numeric;
  v_current_pb numeric;
  v_new_global_best numeric;
  v_new_global_best_at timestamptz;
  v_new_current_streak integer;
  v_new_longest_streak integer;
  v_new_last_date date;
  v_daily_previous numeric;
  v_daily_found boolean;
  v_unlocked jsonb;
  v_response jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('global', 'daily') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_round_scores IS NULL
     OR array_ndims(p_round_scores) IS DISTINCT FROM 1
     OR cardinality(p_round_scores) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM unnest(p_round_scores) AS s("value")
     WHERE s."value" IS NULL
        OR s."value" < 0
        OR s."value" > 10
  ) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_played_at IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_mode = 'daily' AND p_challenge_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_mode = 'global' AND p_challenge_id IS NOT NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_mode = 'daily' THEN
    SELECT dc."challenge_date"
      INTO v_challenge_date
      FROM "daily_challenges" dc
     WHERE dc."daily_challenge_id" = p_challenge_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;
  END IF;

  SELECT u."global_best_score",
         u."global_best_achieved_at",
         u."total_games_played",
         u."current_daily_streak",
         u."longest_daily_streak",
         u."last_daily_played_date"
    INTO v_global_best,
         v_global_best_at,
         v_total_games,
         v_current_daily_streak,
         v_longest_daily_streak,
         v_last_daily_played_date
    FROM "users" u
   WHERE u."user_id" = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  v_total := (
    SELECT sum(s."value")
      FROM unnest(p_round_scores) AS s("value")
  );
  v_max_round := (
    SELECT max(s."value")
      FROM unnest(p_round_scores) AS s("value")
  );

  -- Captured before any PB/streak/counter update.
  IF p_mode = 'global' THEN
    v_first_in_mode := v_global_best IS NULL;
  ELSE
    v_first_in_mode := v_last_daily_played_date IS NULL;
  END IF;

  v_total_games := v_total_games + 1;
  v_new_global_best := v_global_best;
  v_new_global_best_at := v_global_best_at;
  v_new_current_streak := v_current_daily_streak;
  v_new_longest_streak := v_longest_daily_streak;
  v_new_last_date := v_last_daily_played_date;

  IF p_mode = 'global' THEN
    v_previous_pb := v_global_best;

    IF v_global_best IS NULL OR v_total > v_global_best THEN
      v_new_global_best := v_total;
      v_new_global_best_at := p_played_at;
      v_updated := true;
      v_beat_existing := v_global_best IS NOT NULL;
    END IF;

    v_current_pb := v_new_global_best;
  ELSE
    SELECT dpb."best_score"
      INTO v_daily_previous
      FROM "daily_personal_bests" dpb
     WHERE dpb."user_id" = p_user_id
       AND dpb."daily_challenge_id" = p_challenge_id;

    v_daily_found := FOUND;
    v_previous_pb := v_daily_previous;

    IF NOT v_daily_found THEN
      INSERT INTO "daily_personal_bests" (
        "user_id", "daily_challenge_id", "best_score", "achieved_at"
      )
      VALUES (
        p_user_id, p_challenge_id, v_total, p_played_at
      );

      v_current_pb := v_total;
      v_updated := true;
      v_beat_existing := false;
    ELSIF v_total > v_daily_previous THEN
      UPDATE "daily_personal_bests"
         SET "best_score" = v_total,
             "achieved_at" = p_played_at
       WHERE "user_id" = p_user_id
         AND "daily_challenge_id" = p_challenge_id;

      v_current_pb := v_total;
      v_updated := true;
      v_beat_existing := true;
    ELSE
      v_current_pb := v_daily_previous;
    END IF;

    IF v_last_daily_played_date IS NULL THEN
      v_new_current_streak := 1;
    ELSIF v_challenge_date = v_last_daily_played_date THEN
      v_new_current_streak := v_current_daily_streak;
    ELSIF v_challenge_date = v_last_daily_played_date + 1 THEN
      v_new_current_streak := v_current_daily_streak + 1;
    ELSIF v_challenge_date > v_last_daily_played_date + 1 THEN
      v_new_current_streak := 1;
    ELSE
      -- A game started on an earlier day finished after a later day counted.
      v_new_current_streak := v_current_daily_streak;
    END IF;

    v_new_longest_streak := GREATEST(v_longest_daily_streak, v_new_current_streak);

    IF v_last_daily_played_date IS NULL
       OR v_challenge_date > v_last_daily_played_date THEN
      v_new_last_date := v_challenge_date;
    ELSE
      v_new_last_date := v_last_daily_played_date;
    END IF;
  END IF;

  UPDATE "users"
     SET "global_best_score" = v_new_global_best,
         "global_best_achieved_at" = v_new_global_best_at,
         "total_games_played" = v_total_games,
         "current_daily_streak" = v_new_current_streak,
         "longest_daily_streak" = v_new_longest_streak,
         "last_daily_played_date" = v_new_last_date
   WHERE "user_id" = p_user_id;

  v_unlocked := evaluate_achievements(
    p_user_id,
    p_mode,
    v_max_round,
    v_beat_existing,
    v_first_in_mode
  );

  v_response := jsonb_build_object(
    'total_score', v_total,
    'mode', p_mode,
    'total_games_played', v_total_games,
    'pb', jsonb_build_object(
      'scope', p_mode,
      'previous', v_previous_pb,
      'current', v_current_pb,
      'updated', v_updated,
      'beat_existing', v_beat_existing
    ),
    'unlocked', v_unlocked
  );

  IF p_mode = 'daily' THEN
    v_response := v_response || jsonb_build_object(
      'streak', jsonb_build_object(
        'current', v_new_current_streak,
        'longest', v_new_longest_streak
      )
    );
  END IF;

  RETURN v_response;
END;
$$;
