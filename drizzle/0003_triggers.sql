-- Room rules that span rows/tables. Architecture §5.8.4.
-- Domain errors use SQLSTATE CM000; the message is an §8.1 error code.
--
-- WHAT THIS FILE DOES
-- A TRIGGER runs automatically whenever a row is inserted or updated, and can
-- reject the change by raising an error. Each trigger needs a trigger FUNCTION
-- (the logic) and a CREATE TRIGGER statement (which attaches the function to a table).
-- This file creates 3 functions, then attaches them with 3 triggers.
-- They protect room data even if some code writes to the tables directly.

-- FUNCTION 1: room_players_before_insert
-- Runs BEFORE a player is added to a room. It:
--   1. Locks the room row (FOR UPDATE) so two people can't join at the exact same moment.
--   2. Rejects the insert if the room is not in the 'lobby' state -> ROOM_NOT_LOBBY.
--   3. Rejects the insert if the room already has room_size members -> ROOM_FULL.
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

-- FUNCTION 2: room_players_before_update
-- Runs BEFORE a room_players row is changed. It enforces four rules:
--   1. attempts_used may never exceed the room's attempts_limit -> ATTEMPTS_EXHAUSTED.
--   2. Only an 'active' member may use another attempt -> MEMBER_NOT_ACTIVE.
--   3. Status can only stay the same or move forward: active -> finished or active -> left.
--      'finished' and 'left' are final -> MEMBER_NOT_ACTIVE.
--   4. best_score can never go down or be cleared once set -> VALIDATION_ERROR.
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

-- FUNCTION 3: rooms_before_update
-- Runs BEFORE a room row is changed. It enforces the room life cycle:
--   1. Status changes are limited to lobby -> in_progress, lobby -> cancelled,
--      and in_progress -> finished. Anything else -> VALIDATION_ERROR.
--   2. started_at / ended_at must match the new status:
--        lobby = neither set | in_progress = started only
--        finished = both set | cancelled = ended only
--      (Same rule as the rooms_status_timestamps_check constraint in 0001.)
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

-- TRIGGER 1: attaches room_players_before_insert to the room_players table.
-- Fires once for every row inserted, before the row is saved.
CREATE TRIGGER "trg_room_players_before_insert"
  BEFORE INSERT ON "room_players"
  FOR EACH ROW
  EXECUTE FUNCTION "room_players_before_insert"();--> statement-breakpoint

-- TRIGGER 2: attaches room_players_before_update to the room_players table.
-- Fires once for every row updated, before the change is saved.
CREATE TRIGGER "trg_room_players_before_update"
  BEFORE UPDATE ON "room_players"
  FOR EACH ROW
  EXECUTE FUNCTION "room_players_before_update"();--> statement-breakpoint

-- TRIGGER 3: attaches rooms_before_update to the rooms table.
-- Fires once for every room row updated, before the change is saved.
CREATE TRIGGER "trg_rooms_before_update"
  BEFORE UPDATE ON "rooms"
  FOR EACH ROW
  EXECUTE FUNCTION "rooms_before_update"();
