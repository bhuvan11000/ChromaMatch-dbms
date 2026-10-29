-- Daily challenge creation function. Architecture §5.8.3 (order 6).
-- Domain errors use SQLSTATE CM000; the message is an §8.1 error code.

CREATE OR REPLACE FUNCTION "ensure_daily_challenge"(
  p_date date,
  p_colors jsonb
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
  v_i integer;
  v_color jsonb;
  v_h numeric;
  v_s numeric;
  v_v numeric;
BEGIN
  -- Only today's UTC challenge may be created. Past days are read-only.
  IF p_date IS NULL
     OR p_date IS DISTINCT FROM (now() AT TIME ZONE 'utc')::date THEN
    RAISE EXCEPTION 'INVALID_DATE' USING ERRCODE = 'CM000';
  END IF;

  IF p_colors IS NULL OR jsonb_typeof(p_colors) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  IF jsonb_array_length(p_colors) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  FOR v_i IN 1..3 LOOP
    v_color := p_colors -> (v_i - 1);

    IF jsonb_typeof(v_color) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;

    IF jsonb_typeof(v_color -> 'h') IS DISTINCT FROM 'number'
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

  INSERT INTO "daily_challenges" ("challenge_date")
  VALUES (p_date)
  ON CONFLICT ("challenge_date") DO NOTHING
  RETURNING "daily_challenge_id" INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO "challenge_colors" (
      "daily_challenge_id", "round_number", "hue", "saturation", "value"
    )
    SELECT
      v_id,
      c."ord"::smallint,
      round((c."color" ->> 'h')::numeric, 1),
      round((c."color" ->> 's')::numeric, 1),
      round((c."color" ->> 'v')::numeric, 1)
    FROM jsonb_array_elements(p_colors) WITH ORDINALITY AS c("color", "ord");

    RETURN v_id;
  END IF;

  -- Another transaction created the challenge and its colors atomically.
  SELECT dc."daily_challenge_id"
    INTO v_id
    FROM "daily_challenges" dc
   WHERE dc."challenge_date" = p_date;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'INTERNAL_ERROR' USING ERRCODE = 'CM000';
  END IF;

  RETURN v_id;
END;
$$;
