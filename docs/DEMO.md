# ChromaMatch — One-Page Demo Script

A 10-minute sequence for transactions, triggers, views, MongoDB aggregation and
role-based access. Run from the repo root.

## 0. Prepare

```bash
cp .env.example .env.local
docker compose up -d && npm install
npm run db:migrate && npm run mongo:init && npm run db:seed
npm run dev
set -a; . ./.env.local; set +a          # gives psql $DATABASE_URL_DIRECT
```

Register `player1@example.com`, `player2@example.com`, `admin@example.com`
(password ≥ 8 characters) at `http://localhost:3000`, then promote the admin:

```bash
npm run db:seed-admin -- admin@example.com
psql "$DATABASE_URL_DIRECT" -c "select user_id, username, role from users order by user_id;"
```

## 1. Transactions (Postgres is authoritative)

Play one Global game as player1 and one as player2, plus one Daily game as
player1. Then show a rolled-back transaction:

```sql
BEGIN;
SELECT submit_game_result(
  (SELECT user_id FROM users WHERE email='player1@example.com'),
  'global', NULL, ARRAY[9.7,9.9,5.7]::numeric[], now());
SELECT total_games_played, global_best_score FROM users
 WHERE email='player1@example.com';        -- changed
ROLLBACK;
-- run the SELECT again: unchanged (atomic rollback)
```

Start a room: status and 3 colours are written together (use a fresh code on rerun):

```sql
SELECT create_room((SELECT user_id FROM users WHERE email='player1@example.com'),
                   'DEMO01', 2::smallint, NULL::smallint, 3::smallint);
SELECT join_room((SELECT user_id FROM users WHERE email='player2@example.com'), 'DEMO01');
SELECT start_room((SELECT user_id FROM users WHERE email='player1@example.com'), 'DEMO01',
  '[{"h":200,"s":50,"v":80},{"h":10,"s":90,"v":40},{"h":300,"s":20,"v":60}]'::jsonb);
SELECT status, started_at FROM rooms WHERE room_code='DEMO01';
SELECT count(*) AS colours FROM room_colors
 WHERE room_id=(SELECT room_id FROM rooms WHERE room_code='DEMO01');  -- 3
```

## 2. Triggers (bypassing the API still fails)

```sql
-- ROOM_FULL: a fresh lobby room of size 2 with creator + player2.
SELECT create_room((SELECT user_id FROM users WHERE email='player1@example.com'),
                   'DEMO02', 2::smallint, NULL::smallint, 3::smallint);
SELECT join_room((SELECT user_id FROM users WHERE email='player2@example.com'), 'DEMO02');
INSERT INTO room_players (room_id, user_id)
VALUES ((SELECT room_id FROM rooms WHERE room_code='DEMO02'),
        (SELECT user_id FROM users WHERE email='admin@example.com'));

-- ROOM_NOT_LOBBY: DEMO01 was started in step 1.
INSERT INTO room_players (room_id, user_id)
VALUES ((SELECT room_id FROM rooms WHERE room_code='DEMO01'),
        (SELECT user_id FROM users WHERE email='admin@example.com'));

-- ATTEMPTS_EXHAUSTED: DEMO01's attempts_limit is 3.
UPDATE room_players SET attempts_used=4
 WHERE room_id=(SELECT room_id FROM rooms WHERE room_code='DEMO01')
   AND user_id=(SELECT user_id FROM users WHERE email='player1@example.com');

-- VALIDATION_ERROR: in_progress -> lobby is not allowed.
UPDATE rooms SET status='lobby' WHERE room_code='DEMO01';
```

Each raises SQLSTATE `CM000`; psql shows `ERROR: <§8.1 code>` (`\errverbose`
shows the SQLSTATE).

## 3. Views (the API reads these, not base tables)

```sql
SELECT rank, username, score FROM global_leaderboard ORDER BY rank LIMIT 10;
SELECT rank, username, score FROM daily_leaderboard
 WHERE challenge_date=CURRENT_DATE ORDER BY rank LIMIT 10;
SELECT rank, username, member_status, attempts_used, best_score
  FROM room_scoreboard
 WHERE room_id=(SELECT room_id FROM rooms WHERE room_code='DEMO01')
 ORDER BY rank NULLS LAST;
-- "My rank" is the same view filtered by user_id, so list and rank agree.
SELECT * FROM global_leaderboard
 WHERE user_id=(SELECT user_id FROM users WHERE email='player1@example.com');
```

## 4. MongoDB aggregation (history, not leaderboards)

After the UI games, this excludes room attempts and groups by UTC day:

```bash
docker compose exec -T mongo mongosh chromamatch --quiet --eval '
db.game_history.aggregate([
  { $match: { mode: { $in: ["global", "daily"] } } },
  { $group: { _id: { mode: "$mode",
      day: { $dateToString: { format: "%Y-%m-%d", date: "$played_at", timezone: "UTC" } } },
      games: { $sum: 1 }, avgScore: { $avg: "$total_score" } } },
  { $sort: { "_id.day": 1, "_id.mode": 1 } }
]).forEach(printjson)
'
```

Swap `$match` to `{ mode: "room" }` to show room attempts separately; `$unwind:
"$rounds"` gives per-colour stats like `dailyChallengeSummary` / `roomSummary`.

## 5. Role-based access

```sql
-- Player1 is not an admin.
CALL admin_set_ban(
  (SELECT user_id FROM users WHERE email='player1@example.com'),
  (SELECT user_id FROM users WHERE email='player2@example.com'), true);
-- ERROR: FORBIDDEN (CM000)

-- The admin succeeds.
CALL admin_set_ban(
  (SELECT user_id FROM users WHERE email='admin@example.com'),
  (SELECT user_id FROM users WHERE email='player2@example.com'), true);

-- Banned players leave Global/Daily but remain on room scoreboards.
SELECT count(*) FROM global_leaderboard
 WHERE user_id=(SELECT user_id FROM users WHERE email='player2@example.com');  -- 0
SELECT count(*) FROM room_scoreboard
 WHERE user_id=(SELECT user_id FROM users WHERE email='player2@example.com');  -- >0
```

API proof: a player session gets `403 FORBIDDEN` from `GET /api/admin/users`;
an admin session gets `200` with `{ "users": [...], "total": n }`.

## 6. DDL demonstration

```bash
psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f scripts/ddl-demo.sql
```

It runs `CREATE`, `ALTER` (add column / add constraint / rename), `CREATE INDEX`,
`DROP INDEX`, `DROP COLUMN`, and `DROP TABLE` in scratch schema `cm_ddl_demo`,
then `ROLLBACK`s. Verify: `public.users` exists and
`to_regclass('cm_ddl_demo.demo_players')` is `NULL`.
