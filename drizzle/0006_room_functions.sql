-- Custom room functions. Architecture §5.8.3 (order 7) and §5.12.3.
-- All room operations lock the `rooms` row first, then the member row.
-- Domain errors use SQLSTATE CM000; the message is an §8.1 error code.

CREATE OR REPLACE FUNCTION "check_room_over"(p_room_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Internal helper: the caller already holds the rooms row lock.
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM "rooms"
     WHERE "room_id" = p_room_id
       AND "status" = 'in_progress'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM "room_players"
     WHERE "room_id" = p_room_id
       AND "status" = 'active'
  ) THEN
    UPDATE "rooms"
       SET "status" = 'finished',
           "ended_at" = now()
     WHERE "room_id" = p_room_id
       AND "status" = 'in_progress';
  END IF;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "create_room"(
  p_creator_id bigint,
  p_room_code text,
  p_room_size smallint,
  p_timer_seconds smallint,
  p_attempts_limit smallint
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id bigint;
BEGIN
  IF p_creator_id IS NULL
     OR p_room_code IS NULL
     OR btrim(p_room_code) = ''
     OR length(p_room_code) > 8 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_room_size IS NULL OR p_room_size < 2 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_timer_seconds IS NOT NULL
     AND p_timer_seconds NOT IN (5, 10, 15) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF p_attempts_limit IS NULL
     OR p_attempts_limit NOT IN (3, 5) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  PERFORM 1
    FROM "users"
   WHERE "user_id" = p_creator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  INSERT INTO "rooms" (
    "room_code",
    "creator_id",
    "room_size",
    "timer_seconds",
    "attempts_limit",
    "status"
  )
  VALUES (
    p_room_code,
    p_creator_id,
    p_room_size,
    p_timer_seconds,
    p_attempts_limit,
    'lobby'
  )
  RETURNING "room_id" INTO v_room_id;

  -- The BEFORE INSERT trigger re-checks lobby status and capacity.
  INSERT INTO "room_players" ("room_id", "user_id")
  VALUES (v_room_id, p_creator_id);

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'room_code', p_room_code
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "join_room"(
  p_user_id bigint,
  p_room_code text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id bigint;
  v_status varchar(12);
  v_room_size smallint;
  v_member_count bigint;
BEGIN
  IF p_user_id IS NULL
     OR p_room_code IS NULL
     OR btrim(p_room_code) = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  SELECT "room_id", "status", "room_size"
    INTO v_room_id, v_status, v_room_size
    FROM "rooms"
   WHERE "room_code" = p_room_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  IF v_status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_NOT_LOBBY' USING ERRCODE = 'CM000';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "room_players"
     WHERE "room_id" = v_room_id
       AND "user_id" = p_user_id
  ) THEN
    RETURN jsonb_build_object(
      'room_id', v_room_id,
      'outcome', 'already_member'
    );
  END IF;

  SELECT count(*)
    INTO v_member_count
    FROM "room_players"
   WHERE "room_id" = v_room_id;

  IF v_member_count >= v_room_size THEN
    RAISE EXCEPTION 'ROOM_FULL' USING ERRCODE = 'CM000';
  END IF;

  PERFORM 1
    FROM "users"
   WHERE "user_id" = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  -- The BEFORE INSERT trigger re-checks capacity as a safety net.
  INSERT INTO "room_players" ("room_id", "user_id")
  VALUES (v_room_id, p_user_id);

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'outcome', 'joined'
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "start_room"(
  p_user_id bigint,
  p_room_code text,
  p_colors jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id bigint;
  v_creator_id bigint;
  v_status varchar(12);
  v_member_count bigint;
  v_started_at timestamptz;
  v_i integer;
  v_color jsonb;
  v_h numeric;
  v_s numeric;
  v_v numeric;
BEGIN
  IF p_user_id IS NULL
     OR p_room_code IS NULL
     OR btrim(p_room_code) = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  SELECT "room_id", "creator_id", "status"
    INTO v_room_id, v_creator_id, v_status
    FROM "rooms"
   WHERE "room_code" = p_room_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  IF v_creator_id <> p_user_id THEN
    RAISE EXCEPTION 'NOT_ROOM_CREATOR' USING ERRCODE = 'CM000';
  END IF;

  IF v_status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_NOT_LOBBY' USING ERRCODE = 'CM000';
  END IF;

  SELECT count(*)
    INTO v_member_count
    FROM "room_players"
   WHERE "room_id" = v_room_id;

  IF v_member_count < 2 THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS' USING ERRCODE = 'CM000';
  END IF;

  IF p_colors IS NULL
     OR jsonb_typeof(p_colors) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_colors) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  FOR v_i IN 1..3 LOOP
    v_color := p_colors -> (v_i - 1);

    IF jsonb_typeof(v_color) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_color -> 'h') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_color -> 's') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_color -> 'v') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;

    v_h := round((v_color ->> 'h')::numeric, 1);
    v_s := round((v_color ->> 's')::numeric, 1);
    v_v := round((v_color ->> 'v')::numeric, 1);

    IF v_h < 0 OR v_h > 360
       OR v_s < 0 OR v_s > 100
       OR v_v < 0 OR v_v > 100 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;
  END LOOP;

  INSERT INTO "room_colors" (
    "room_id", "round_number", "hue", "saturation", "value"
  )
  SELECT
    v_room_id,
    c."ord"::smallint,
    round((c."color" ->> 'h')::numeric, 1),
    round((c."color" ->> 's')::numeric, 1),
    round((c."color" ->> 'v')::numeric, 1)
  FROM jsonb_array_elements(p_colors) WITH ORDINALITY AS c("color", "ord");

  v_started_at := now();

  UPDATE "rooms"
     SET "status" = 'in_progress',
         "started_at" = v_started_at
   WHERE "room_id" = v_room_id;

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'started_at', v_started_at
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "leave_room"(
  p_user_id bigint,
  p_room_code text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id bigint;
  v_status varchar(12);
  v_creator_id bigint;
  v_member_status varchar(10);
BEGIN
  IF p_user_id IS NULL
     OR p_room_code IS NULL
     OR btrim(p_room_code) = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  SELECT "room_id", "status", "creator_id"
    INTO v_room_id, v_status, v_creator_id
    FROM "rooms"
   WHERE "room_code" = p_room_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  SELECT "status"
    INTO v_member_status
    FROM "room_players"
   WHERE "room_id" = v_room_id
     AND "user_id" = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_ROOM_MEMBER' USING ERRCODE = 'CM000';
  END IF;

  IF v_status = 'lobby' THEN
    IF v_creator_id = p_user_id THEN
      UPDATE "rooms"
         SET "status" = 'cancelled',
             "ended_at" = now()
       WHERE "room_id" = v_room_id;

      RETURN jsonb_build_object(
        'outcome', 'room_cancelled',
        'room_status', 'cancelled'
      );
    END IF;

    DELETE FROM "room_players"
     WHERE "room_id" = v_room_id
       AND "user_id" = p_user_id;

    RETURN jsonb_build_object(
      'outcome', 'left_lobby',
      'room_status', 'lobby'
    );
  END IF;

  IF v_status = 'in_progress' THEN
    IF v_member_status = 'active' THEN
      UPDATE "room_players"
         SET "status" = 'left'
       WHERE "room_id" = v_room_id
         AND "user_id" = p_user_id;

      PERFORM "check_room_over"(v_room_id);

      SELECT "status"
        INTO v_status
        FROM "rooms"
       WHERE "room_id" = v_room_id;

      RETURN jsonb_build_object(
        'outcome', 'left_in_progress',
        'room_status', v_status
      );
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'noop',
      'room_status', v_status
    );
  END IF;

  -- finished or cancelled rooms are immutable.
  RETURN jsonb_build_object(
    'outcome', 'noop',
    'room_status', v_status
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "submit_room_attempt"(
  p_user_id bigint,
  p_room_id bigint,
  p_round_scores numeric[]
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status varchar(12);
  v_attempts_limit smallint;
  v_member_status varchar(10);
  v_attempts_used smallint;
  v_best_score numeric;
  v_best_achieved_at timestamptz;
  v_total numeric;
  v_new_used smallint;
  v_new_best numeric;
  v_new_best_at timestamptz;
  v_new_member_status varchar(10);
  v_is_new_best boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_room_id IS NULL THEN
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

  -- Lock order: room first, then the caller's member row.
  SELECT "status", "attempts_limit"
    INTO v_status, v_attempts_limit
    FROM "rooms"
   WHERE "room_id" = p_room_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'CM000';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'ROOM_NOT_IN_PROGRESS' USING ERRCODE = 'CM000';
  END IF;

  SELECT "status", "attempts_used", "best_score", "best_achieved_at"
    INTO v_member_status, v_attempts_used, v_best_score, v_best_achieved_at
    FROM "room_players"
   WHERE "room_id" = p_room_id
     AND "user_id" = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_ROOM_MEMBER' USING ERRCODE = 'CM000';
  END IF;

  IF v_member_status <> 'active' THEN
    RAISE EXCEPTION 'MEMBER_NOT_ACTIVE' USING ERRCODE = 'CM000';
  END IF;

  IF v_attempts_used >= v_attempts_limit THEN
    RAISE EXCEPTION 'ATTEMPTS_EXHAUSTED' USING ERRCODE = 'CM000';
  END IF;

  v_total := (
    SELECT sum(s."value")
      FROM unnest(p_round_scores) AS s("value")
  );

  v_new_used := v_attempts_used + 1;
  v_new_best := v_best_score;
  v_new_best_at := v_best_achieved_at;
  v_new_member_status := 'active';

  IF v_best_score IS NULL OR v_total > v_best_score THEN
    v_new_best := v_total;
    v_new_best_at := now();
    v_is_new_best := true;
  END IF;

  IF v_new_used >= v_attempts_limit THEN
    v_new_member_status := 'finished';
  END IF;

  UPDATE "room_players"
     SET "attempts_used" = v_new_used,
         "best_score" = v_new_best,
         "best_achieved_at" = v_new_best_at,
         "status" = v_new_member_status
   WHERE "room_id" = p_room_id
     AND "user_id" = p_user_id;

  PERFORM "check_room_over"(p_room_id);

  SELECT "status"
    INTO v_status
    FROM "rooms"
   WHERE "room_id" = p_room_id;

  RETURN jsonb_build_object(
    'attempt_number', v_new_used,
    'total_score', v_total,
    'best_score', v_new_best,
    'is_new_best', v_is_new_best,
    'attempts_remaining', v_attempts_limit - v_new_used,
    'member_status', v_new_member_status,
    'room_status', v_status
  );
END;
$$;
