# ChromaMatch — AGENTS.md

Repo-specific rules for AI coding agents. The design docs are the contract; this file is the fast path.

## Source of truth
- Read `docs/ChromaMatch_Architecture.md` before writing code. It is normative. Then `docs/ChromaMatch_Game_Design.md` (rules) and `docs/ChromaMatch_Database_Design.md` (schema), plus any other doc relevant to the task.
- If a request conflicts with the docs, stop and ask. Never silently deviate or "improve" the design.
- If something is unspecified, use the Architecture §6 default and say which one you used.
- Useful anchors: §5.2 layering, §5.3 constants/env, §5.4 scoring, §5.6 game tokens, §5.8–5.9 DB layers, §5.10 API, §5.11 frontend, §5.14 testing, §6 defaults, §8.1 error codes.

## Repo state and commands
- At the time this file was written the repo is docs-only: no `package.json`, `src/`, tests, or CI yet. Do not pretend scripts exist. Scaffold to Architecture §5.1 before implementing.
- Once scaffolded, these script names are normative (Architecture §5.15.1): `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm run format`, `npm test`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e`, `npm run db:generate`, `npm run db:custom`, `npm run db:migrate`, `npm run db:seed`, `npm run db:seed-admin`, `npm run mongo:init`.
- Local Postgres + Mongo come from `docker-compose.yml`; integration tests need real DBs with migrations/validator applied.
- After every step: `npm run lint`, `npm run typecheck`, `npm test` must pass. CI order: lint → typecheck → unit → integration → build.
- Copy `.env.example`; never commit `.env*` except `.env.example`.

## Stack (no additions without asking)
Next.js App Router + TypeScript strict on the Node runtime; Tailwind; TanStack Query; Zod; Drizzle ORM + postgres.js (PostgreSQL); official `mongodb` driver (no Mongoose); `jose`; `@node-rs/argon2`; Vitest + optional Playwright; Recharts. Supabase is plain Postgres only (no Supabase Auth/Realtime/Storage); rooms use polling, not WebSockets.

## Layering and code placement
- Dependencies point down only: pages/components/hooks → route handlers → services → data access → domain.
- Pages/components/hooks may import schemas, types, constants, and pure display helpers. Never services, `lib/db`, password/auth internals, or scoring for submission.
- Route handlers: `withHandler` (Origin check + error envelope) → Zod validate → guard → exactly ONE service call → map errors. No business logic, SQL, or direct `lib/db` imports.
- Services take plain arguments (including `now: Date`), never `Request`/`Response`/`next/*`. Each game/room state change calls exactly one Postgres function/procedure.
- SQL only in `src/lib/db/pg/**` and `drizzle/*.sql`; SQL function names/argument order only in `src/lib/db/pg/functions.ts`.
- `src/lib/schemas` Zod schemas are the single request/response definition; infer TS types from them. Unknown keys are rejected.
- Throw `AppError` only. `withHandler` produces `{ error: { code, message, details? } }`; never leak stack traces, SQL, or secrets.

## Server-authoritative game rules
- Scoring is server-side only in `src/lib/domain/scoring.ts`. The client never computes or submits scores or targets.
- Submit body is guesses (+ room `timedOut`) and the signed game token only. Targets, color numbers, and play order come only from the verified token — never the request body.
- One completed 3-round game is submitted at once. Incomplete games are never persisted. Guesses and `timedOut` live in React state; no `localStorage`, `sessionStorage`, or cookies.
- Verify token signature/`typ`/`aud`/`exp`, `sub` = session user, exactly 3 rounds, and elapsed ≥ `GAME_MIN_ELAPSED_SECONDS` (13 s). Token TTL is 2 h.
- Daily: the DB row is the source of truth for the day's colors; use the date-seeded generator only when creating a missing day. Room: attempts are consumed at submit, not at start.
- For submissions, Postgres is authoritative and written first in one SQL function call; Mongo history is written after, best-effort (log + one retry + swallow). Mongo failure must never fail the request or roll back Postgres.
- Banned players may log in/play by default (`BANNED_CAN_PLAY`), but are excluded from global/daily leaderboards; room scoreboards show them.
- Use Node `crypto` for colors, shuffles, room codes, and tokens. `Math.random()` is forbidden; the daily seeded PRNG is the only exception.

## Data-layer gotchas
- Postgres: `prepare: false` for the Supabase transaction pooler; use `DATABASE_URL` for the app and `DATABASE_URL_DIRECT` for drizzle-kit/seeds. Route handlers run on the Node runtime, not Edge.
- Type mapping belongs in `src/lib/db/pg/*` mappers, not services: `NUMERIC` arrives as a string; `BIGINT` as a number (`bigint({ mode: 'number' })`); `TIMESTAMPTZ` as `Date`; `DATE` as `'YYYY-MM-DD'`. SQL functions return parsed `jsonb`.
- SQL functions raise `RAISE EXCEPTION '<CODE>' USING ERRCODE = 'CM000'`; `src/lib/db/pg/errors.ts` maps `CM000` to `AppError`, plus unique/check/connection mappings.
- Migrations are ordered per §5.8.2: drizzle-kit for tables; custom SQL for cross-column checks, indexes, triggers, functions, and views. Never edit an applied migration; add a new one with `CREATE OR REPLACE`. `scripts/ddl-demo.sql` is a course demo, not an app migration.
- Mongo: one `game_history` collection, official driver, JSON Schema validator + indexes via `scripts/init-mongo.ts` (idempotent). Wrap Postgres ids in BSON `Long` on write. Stats aggregations exclude `mode: "room"`; history is insert-only.
- All SQL is parameterized; no string-built SQL. Never build Mongo queries from raw request objects.

## Security and config
- Passwords: argon2id, never plaintext in code/logs/tests. Never log passwords, tokens, cookies, or full request bodies.
- `SESSION_JWT_SECRET` and `GAME_TOKEN_SECRET` must differ; all env access goes through `src/lib/config/env.ts` (Zod, fail fast).
- Session cookie `cm_session`: HS256 JWT, `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, 7 days. The JWT role is a hint only; re-read role/ban from Postgres for `/api/admin/*` and `/api/me`.
- Every mutating request needs `Content-Type: application/json` plus `Origin`/`Referer` matching `APP_ORIGIN`, enforced in `lib/auth/origin.ts` via `withHandler`.
- `middleware.ts` only verifies the cookie signature, no DB. Room membership/creator checks live in services/SQL, not handlers.
- API responses use `Cache-Control: no-store`; ids are numbers, timestamps ISO-8601 UTC, dates `YYYY-MM-DD`, scores one decimal.

## Time, numbers, scoring
- All times are UTC; a "day" is the UTC date. Domain functions take time as an argument and must never call `Date.now()`.
- HSV: H 0–360, S 0–100, V 0–100, one decimal. Scores: round 0–10, game 0–30, one decimal.
- Do score arithmetic in integer tenths, rounding half up at the end. Hue is circular (`360 ≡ 0`, shortest path). Use the §5.4.1 test vectors (e.g. `9.7 + 9.9 + 5.7 = 25.3`), not the DB doc's illustrative `8.9`.

## Testing
- Write tests with the code. Unit tests cover scoring vectors/properties, hue wrap, tenths rounding, daily-seed determinism, permutation validity, token sign/verify/expiry/tamper/user mismatch, and Zod accept/reject cases.
- Integration tests run against real Docker Postgres/Mongo and cover PB strictly-greater, streak transitions, counters, achievements awarded once, daily creation race, room capacity/parallel joins, lobby-only join, attempts limit, leave/cancel, simultaneous final submissions, banned filtering, and admin rejection.
- Test that Mongo failure does not fail submit, and that `/api/me/stats` degrades. API tests cover 401/403, Origin, start/submit per mode, and token misuse.
- Report the command and result summary, not just "tests pass".

## Working style
- First give a short plan: files to create/change and tests. If the user says "plan only", stop and wait; otherwise implement.
- Keep diffs small and focused; do not reformat unrelated files. Commit regularly.
- Finish with: files changed, tests added, any Architecture §6 default used, and anything uncertain.
