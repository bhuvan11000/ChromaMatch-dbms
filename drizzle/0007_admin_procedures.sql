-- Admin procedures. Architecture §5.8.3 (order 8) and §5.7.7.
-- `CREATE PROCEDURE` objects are invoked with CALL.
-- The caller's admin role is re-checked inside every procedure.
-- Domain errors use SQLSTATE CM000; the message is an §8.1 error code.

CREATE OR REPLACE PROCEDURE "admin_set_ban"(
  p_admin_id bigint,
  p_target_id bigint,
  p_banned boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_role varchar(10);
  v_target_role varchar(10);
BEGIN
  IF p_admin_id IS NULL OR p_target_id IS NULL OR p_banned IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  SELECT "role"
    INTO v_admin_role
    FROM "users"
   WHERE "user_id" = p_admin_id;

  IF NOT FOUND OR v_admin_role <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'CM000';
  END IF;

  SELECT "role"
    INTO v_target_role
    FROM "users"
   WHERE "user_id" = p_target_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  IF p_admin_id = p_target_id OR v_target_role = 'admin' THEN
    RAISE EXCEPTION 'CANNOT_BAN_ADMIN' USING ERRCODE = 'CM000';
  END IF;

  UPDATE "users"
     SET "is_banned" = p_banned
   WHERE "user_id" = p_target_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE PROCEDURE "admin_update_user_stats"(
  p_admin_id bigint,
  p_target_id bigint,
  p_patch jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_role varchar(10);
  v_target_role varchar(10);
  v_key text;
BEGIN
  IF p_admin_id IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  SELECT "role"
    INTO v_admin_role
    FROM "users"
   WHERE "user_id" = p_admin_id;

  IF NOT FOUND OR v_admin_role <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'CM000';
  END IF;

  SELECT "role"
    INTO v_target_role
    FROM "users"
   WHERE "user_id" = p_target_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_PATCH' USING ERRCODE = 'CM000';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN (
      'global_best_score',
      'global_best_achieved_at',
      'total_games_played',
      'current_daily_streak',
      'longest_daily_streak',
      'last_daily_played_date'
    ) THEN
      RAISE EXCEPTION 'INVALID_PATCH' USING ERRCODE = 'CM000';
    END IF;
  END LOOP;

  BEGIN
    UPDATE "users"
       SET "global_best_score" = CASE
             WHEN p_patch ? 'global_best_score'
               THEN (p_patch ->> 'global_best_score')::numeric
             ELSE "global_best_score"
           END,
           "global_best_achieved_at" = CASE
             WHEN p_patch ? 'global_best_achieved_at'
               THEN (p_patch ->> 'global_best_achieved_at')::timestamptz
             ELSE "global_best_achieved_at"
           END,
           "total_games_played" = CASE
             WHEN p_patch ? 'total_games_played'
               THEN (p_patch ->> 'total_games_played')::integer
             ELSE "total_games_played"
           END,
           "current_daily_streak" = CASE
             WHEN p_patch ? 'current_daily_streak'
               THEN (p_patch ->> 'current_daily_streak')::integer
             ELSE "current_daily_streak"
           END,
           "longest_daily_streak" = CASE
             WHEN p_patch ? 'longest_daily_streak'
               THEN (p_patch ->> 'longest_daily_streak')::integer
             ELSE "longest_daily_streak"
           END,
           "last_daily_played_date" = CASE
             WHEN p_patch ? 'last_daily_played_date'
               THEN (p_patch ->> 'last_daily_played_date')::date
             ELSE "last_daily_played_date"
           END
     WHERE "user_id" = p_target_id;
  EXCEPTION
    WHEN data_exception OR integrity_constraint_violation THEN
      -- Bad types, ranges, null-together pairs and longest >= current all
      -- surface as a validation error rather than an internal error.
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END;
END;
$$;
