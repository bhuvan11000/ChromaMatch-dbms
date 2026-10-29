-- Room rules that span rows/tables. Architecture §5.8.4.
-- Domain errors use SQLSTATE CM000; the message is an §8.1 error code.

CREATE OR REPLACE FUNCTION "room_players_before_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status varchar(12);
  v_room_size smallint;
  v_member_count bigint;
BEGIN
  -- Serialize joins per room; this also protects callers that bypass join_room.
  SELECT "status", "room_size"
    INTO v_status, v_room_size
    FROM "rooms"
   WHERE "room_id" = NEW."room_id"
   FOR UPDATE;

  IF v_status <> 'lobby' THEN
    RAISE EXCEPTION 'ROOM_NOT_LOBBY' USING ERRCODE = 'CM000';
  END IF;

  SELECT count(*)
    INTO v_member_count
    FROM "room_players"
   WHERE "room_id" = NEW."room_id";

  IF v_member_count >= v_room_size THEN
    RAISE EXCEPTION 'ROOM_FULL' USING ERRCODE = 'CM000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "room_players_before_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts_limit smallint;
BEGIN
  SELECT "attempts_limit"
    INTO v_attempts_limit
    FROM "rooms"
   WHERE "room_id" = NEW."room_id";

  IF NEW."attempts_used" > v_attempts_limit THEN
    RAISE EXCEPTION 'ATTEMPTS_EXHAUSTED' USING ERRCODE = 'CM000';
  END IF;

  IF NEW."attempts_used" > OLD."attempts_used" AND OLD."status" <> 'active' THEN
    RAISE EXCEPTION 'MEMBER_NOT_ACTIVE' USING ERRCODE = 'CM000';
  END IF;

  -- Same status and the two forward transitions are allowed.
  IF NOT (
    OLD."status" = NEW."status"
    OR (OLD."status" = 'active' AND NEW."status" IN ('finished', 'left'))
  ) THEN
    RAISE EXCEPTION 'MEMBER_NOT_ACTIVE' USING ERRCODE = 'CM000';
  END IF;

  IF OLD."best_score" IS NOT NULL
     AND (NEW."best_score" IS NULL OR NEW."best_score" < OLD."best_score") THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "rooms_before_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allowed transitions: lobby -> in_progress, lobby -> cancelled,
  -- in_progress -> finished. Same-status updates are allowed.
  IF NEW."status" <> OLD."status" THEN
    IF NOT (
      (OLD."status" = 'lobby' AND NEW."status" IN ('in_progress', 'cancelled'))
      OR (OLD."status" = 'in_progress' AND NEW."status" = 'finished')
    ) THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;
  END IF;

  IF NEW."status" = 'lobby' THEN
    IF NEW."started_at" IS NOT NULL OR NEW."ended_at" IS NOT NULL THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;
  ELSIF NEW."status" = 'in_progress' THEN
    IF NEW."started_at" IS NULL OR NEW."ended_at" IS NOT NULL THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;
  ELSIF NEW."status" = 'finished' THEN
    IF NEW."started_at" IS NULL OR NEW."ended_at" IS NULL THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;
  ELSIF NEW."status" = 'cancelled' THEN
    IF NEW."started_at" IS NOT NULL OR NEW."ended_at" IS NULL THEN
      RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'CM000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "trg_room_players_before_insert"
  BEFORE INSERT ON "room_players"
  FOR EACH ROW
  EXECUTE FUNCTION "room_players_before_insert"();--> statement-breakpoint

CREATE TRIGGER "trg_room_players_before_update"
  BEFORE UPDATE ON "room_players"
  FOR EACH ROW
  EXECUTE FUNCTION "room_players_before_update"();--> statement-breakpoint

CREATE TRIGGER "trg_rooms_before_update"
  BEFORE UPDATE ON "rooms"
  FOR EACH ROW
  EXECUTE FUNCTION "rooms_before_update"();
