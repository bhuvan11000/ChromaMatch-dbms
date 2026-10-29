# ChromaMatch — AGENTS.md

Repo-specific rules for AI coding agents. The design docs are the contract; this file is the fast path.

## Source of truth
- Read `docs/ChromaMatch_Architecture.md` before writing code. It is normative. Then `docs/ChromaMatch_Game_Design.md` (rules) and `docs/ChromaMatch_Database_Design.md` (schema), plus any other doc relevant to the task.
- If a request conflicts with the docs, stop and ask. Never silently deviate or "improve" the design.
- If something is unspecified, use the Architecture §6 default and say which one you used.
- Useful anchors: §5.2 layering, §5.3 constants/env, §5.4 scoring, §5.6 game tokens, §5.8–5.9 DB layers, §5.10 API, §5.11 frontend, §5.14 testing, §6 defaults, §8.1 error codes.

## Current status
- The repository is scaffolded, not docs-only. Next.js 16 App Router, TypeScript strict, Tailwind 4, the TanStack Query provider, ESLint, Prettier, Vitest, Docker Compose, `.env.example`, and GitHub Actions CI are in place.
- Implemented: the app shell (`src/app`), root configuration, exact-pinned dependencies, the §5.1 folder skeleton, CI (`lint → typecheck → test → build`), §5.3 constants and validated env (`src/lib/config`), `AppError` + the full §8.1 catalog (`src/lib/errors.ts`), structured JSON logging (`src/lib/logger.ts`), the Origin/Content-Type check (`src/lib/auth/origin.ts`), the API wrapper (`withHandler`, `json`, `apiError`, `parseBody`, rate-limit hook in `src/lib/api`), Docker Compose for PostgreSQL 16 + MongoDB 7, the postgres.js/Drizzle client (`src/lib/db/pg/client.ts`), the PostgreSQL schema + migration 1 (`src/lib/db/pg/schema.ts`, `drizzle/0000_chemical_zaran.sql`: 9 tables with PKs/FKs/UNIQUEs/simple CHECKs) plus custom migrations 2–9 (`0001_cross_column_checks.sql`, `0002_indexes.sql`, `0003_triggers.sql`, `0004_game_functions.sql`, `0005_daily_function.sql`, `0006_room_functions.sql`, `0007_admin_procedures.sql`, `0008_views.sql`: cross-column checks, §9 indexes, room triggers, `evaluate_achievements`/`submit_game_result`, `ensure_daily_challenge`, the six room functions, the two admin procedures, and the three leaderboard/scoreboard views), numeric mappers (`src/lib/db/pg/mappers.ts`), typed function/procedure wrappers (`src/lib/db/pg/functions.ts`), leaderboard/scoreboard view readers (`src/lib/db/pg/queries/leaderboards.ts`, `src/lib/db/pg/queries/rooms.ts`), the Postgres error mapper (`src/lib/db/pg/errors.ts`), idempotent achievement/admin seeds (`scripts/seed-achievements.ts`, `scripts/seed-admin.ts`), the MongoClient singleton (`src/lib/db/mongo/client.ts`), idempotent Mongo collection/validator/index setup (`scripts/init-mongo.ts`: §7.6 JSON Schema and the four §7.4 indexes), the Mongo history builder/repository (`src/lib/db/mongo/historyRepo.ts`), the §5.9.5 aggregation catalog (`src/lib/db/mongo/aggregations.ts`), and `GET /api/health` returning `{ postgres: "ok" | "down", mongo: "ok" | "down" }` via `healthService` with 1.5 s pings, and the §5.4 pure domain modules (`src/lib/domain/{hsv,scoring,colors,shuffle,time,streak}.ts`): HSV validation/normalization/tenths/CSS conversion, server-authoritative round/game scoring, crypto random colours, xmur3 + mulberry32 Daily colours, Fisher–Yates permutations, UTC date helpers, and the display streak. Auth/session code is implemented too: argon2id hashing with a dummy verify for unknown emails (`src/lib/auth/password.ts`), HS256 `cm_session` sign/verify plus cookie helpers (`src/lib/auth/session.ts`), `getSession`/`requireUser`/`requireAdmin` with a fresh Postgres role lookup (`src/lib/auth/guards.ts`), auth Zod schemas (`src/lib/schemas/auth.ts`), parameterized user queries (`src/lib/db/pg/queries/users.ts`), `authService` (`register`, `login`, `getMe`), `POST /api/auth/{register,login,logout}` and `GET /api/me`, and an in-memory login/register limiter (10 per 15 min per IP+email) behind the `withHandler` hook. Unit tests cover constants, env parsing, the error catalog, Origin checks, API helpers/wrapper, logging, both DB clients, numeric mappers, the health service, the health route, Postgres error mapping, the domain modules, auth password/session/guard behavior, auth schemas, auth service behavior, the auth rate limiter, and auth route responses (`npm test`: 26 files, 197 tests). The integration runner (`vitest.integration.config.ts`) runs schema, constraint, index, trigger, game/daily/room function, admin procedure, view/reader, real error-mapping, seed, Mongo validator/index, history repository, aggregation, and auth user-query/registration tests against the local Docker Postgres and Mongo (`npm run test:int`: 15 files, 121 tests).
- Not implemented yet: game-token code, feature services (`gameService`, `dailyChallengeService`, `roomService`, `leaderboardService`, `statsService`, `adminService`), Zod request/response schemas for those features, their API route handlers, gameplay/auth/admin pages, and Playwright.
- Stub script: `test:e2e` prints `not implemented yet` and exits 0. `db:seed` and `db:seed-admin` run real standalone scripts using `DATABASE_URL_DIRECT`; both load `.env.local` when needed. `mongo:init` runs the real idempotent validator/index setup. `db:generate`, `db:custom`, and `db:migrate` are wired to drizzle-kit; migrations 1–9 exist and `test:int` runs Vitest against the local Docker Postgres and Mongo. Use `npm run db:custom -- --name=<name>` (the script passes the name through).
- Tooling pin: exact versions are used. TypeScript 5.9.3 and ESLint 9.39.5 are intentional; the current latest majors conflict with `eslint-config-next@16.4.3`.
- Known warnings: Next 16 deprecates `src/middleware.ts` in favour of `src/proxy.ts` (kept per §5.1); ESLint 9.39.5 reports its own end-of-support notice.
- Do not scaffold again. Start from the next unimplemented layer and write tests with the code.

## Repo state and commands
- The repository is scaffolded; see Current status. Do not re-scaffold or pretend unimplemented scripts work.
- These script names are normative (Architecture §5.15.1): `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm run format`, `npm test`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e`, `npm run db:generate`, `npm run db:custom`, `npm run db:migrate`, `npm run db:seed`, `npm run db:seed-admin`, `npm run mongo:init`.
- Local Postgres + Mongo come from `docker-compose.yml`; integration tests need real DBs with migrations/validator applied.
- After every step: `npm run lint`, `npm run typecheck`, `npm test` must pass. Target CI order: lint → typecheck → unit → integration → build; the current workflow still runs lint → typecheck → unit → build, so run `npm run test:int` locally with Docker.
- Copy `.env.example` to `.env.local`; never commit `.env*` except `.env.example`.

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
- Postgres: `prepare: false` for the Supabase transaction pooler; use `DATABASE_URL` for the app and `DATABASE_URL_DIRECT` for drizzle-kit/seeds. Route handlers run on the Node runtime, not Edge. `drizzle.config.ts` loads `.env.local` when `DATABASE_URL_DIRECT` is unset.
- Type mapping belongs in `src/lib/db/pg/*` mappers, not services: `NUMERIC` arrives as a string; `BIGINT` as a number (`bigint({ mode: 'number' })`); `TIMESTAMPTZ` as `Date`; `DATE` as `'YYYY-MM-DD'`. SQL functions return parsed `jsonb`.
- SQL functions and triggers raise `RAISE EXCEPTION '<CODE>' USING ERRCODE = 'CM000'`; `src/lib/db/pg/errors.ts` maps `CM000` to `AppError`, plus unique/check/connection mappings. It must unwrap Drizzle's `DrizzleQueryError.cause` before reading `code`/`message`. Trigger codes: `ROOM_NOT_LOBBY`, `ROOM_FULL`, `ATTEMPTS_EXHAUSTED`, `MEMBER_NOT_ACTIVE`, and `VALIDATION_ERROR` for invalid transitions, decreasing best scores and timestamp/status mismatches (Architecture §8.1.1).
- Usernames are case-insensitively unique via `users_username_lower_key`; the error mapper maps a `23505` on that index and on `users_username_key` to `USERNAME_TAKEN`, and `users_email_key` to `EMAIL_TAKEN`.
- `src/lib/db/pg/functions.ts` is the only app-code place SQL function names/argument order appear; wrappers return the SQL jsonb shape (snake_case, e.g. `beat_existing`). Drizzle's `sql` template expands JS arrays into separate parameters, so numeric[] parameters are written as `array[${...}]`; with `db.execute` + postgres.js, bind timestamps as ISO strings with `::timestamptz` (Date objects can fail in this path). Raw postgres.js arrays need `sql.array(values, 1231)` or an explicit `array[...]`. Raw postgres.js may return `DATE`/`TIMESTAMPTZ` as strings or `Date`; normalize at the data-access boundary.
- Room functions follow the §5.8.3 lock order: the `rooms` row is locked first, then the caller's `room_players` row. Admin operations are `CREATE PROCEDURE` and invoked with `CALL`; they re-check the admin role inside. Leaderboard views return `BIGINT` ranks/ids and `NUMERIC` scores as strings through postgres.js, so the query readers normalize them with `Number()`.
- Seed scripts are standalone Node TS files (no `@/` alias), load `.env.local` when needed, use `DATABASE_URL_DIRECT`, and are idempotent (achievements upsert by `name`, admin promotion by lower-cased email).
- Migrations are ordered per §5.8.2 and **must be contiguous**: `0000`, `0001`, … with no gaps. Drizzle-kit derives the next prefix from the last journal `idx`, so skipping a number causes the next generated migration to collide. Create them with `npm run db:custom -- --name=<name>`; do not rename or hand-edit the journal. drizzle-kit handles tables; custom SQL handles cross-column checks, indexes, triggers, functions, and views. Never edit an applied migration; add a new one with `CREATE OR REPLACE`. `scripts/ddl-demo.sql` is a course demo, not an app migration.
- Mongo: one `game_history` collection, official driver, JSON Schema validator + indexes via `scripts/init-mongo.ts` (idempotent). Mongo `$jsonSchema` does **not** support `if/then`; the mode-specific requirements use a `oneOf` of global/daily/room branches. Wrap Postgres ids in BSON `Long` and round/color/attempt numbers in `Int32` on write. Indexes 3/4 are partial on `mode`. `historyRepo` writes snake_case docs and reads camelCase, with cursors encoding `(played_at, _id)`. Stats aggregations exclude `mode: "room"`; history is insert-only.
- All SQL is parameterized; no string-built SQL. Never build Mongo queries from raw request objects.

## Security and config
- Passwords: argon2id, never plaintext in code/logs/tests. Never log passwords, tokens, cookies, or full request bodies. Login uses a fixed dummy argon2id hash for unknown emails so both failure paths pay a verify cost; the result is discarded and both return `INVALID_CREDENTIALS`.
- `SESSION_JWT_SECRET` and `GAME_TOKEN_SECRET` must differ; all env access goes through `src/lib/config/env.ts` (Zod, fail fast).
- Session cookie `cm_session`: HS256 JWT, `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, 7 days. The JWT role is a hint only; `requireAdmin` and `authService.getMe` re-read role/ban from Postgres. `getSession` verifies the cookie signature only.
- Every mutating request needs `Content-Type: application/json` plus `Origin`/`Referer` matching `APP_ORIGIN`, enforced in `lib/auth/origin.ts` via `withHandler`.
- The auth limiter (`src/lib/api/rateLimit.ts`) is an in-process fixed-window map keyed by IP + normalized email (10 per 15 min). It reads a **cloned** request body so the route still receives the original; malformed bodies fall back to IP-only. It is best-effort per serverless instance, not a global limit.
- `middleware.ts` only verifies the cookie signature, no DB. Room membership/creator checks live in services/SQL, not handlers.
- API responses use `Cache-Control: no-store`; ids are numbers, timestamps ISO-8601 UTC, dates `YYYY-MM-DD`, scores one decimal.

## Time, numbers, scoring
- All times are UTC; a "day" is the UTC date. Domain functions take time as an argument and must never call `Date.now()`.
- HSV: H 0–360, S 0–100, V 0–100, one decimal. Scores: round 0–10, game 0–30, one decimal.
- Do score arithmetic in integer tenths, rounding half up at the end. Hue is circular (`360 ≡ 0`, shortest path). Use the §5.4.1 test vectors (e.g. `9.7 + 9.9 + 5.7 = 25.3`), not the DB doc's illustrative `8.9`.
- `src/lib/domain` is pure: `hsv.ts` owns `Hsv`, tenths conversion and CSS display; `scoring.ts` is the only score implementation; `colors.ts` uses `crypto.randomInt` for random colours and xmur3 + mulberry32 for Daily; `shuffle.ts` returns 0-based indices while `isPermutationOf123` validates 1-based colour numbers. Random-colour signatures are RNG-first with the reserved options object second. Invalid domain input throws `RangeError`.

## Testing
- Write tests with the code. Unit tests cover scoring vectors/properties, hue wrap, tenths rounding, daily-seed determinism, permutation validity, token sign/verify/expiry/tamper/user mismatch, and Zod accept/reject cases.
- Integration tests run against real Docker Postgres/Mongo and cover migration-1 schema constraints (all tables, composite PKs, invalid hue/role/duplicate email), PB strictly-greater, streak transitions, counters, achievements awarded once, daily creation race, room capacity/parallel joins, lobby-only join, attempts limit, leave/cancel, simultaneous final submissions, banned filtering, admin rejection, the Mongo validator/indexes (including rejected 2-round, out-of-range hue, and missing mode-specific fields), history document shapes/pagination, and all §5.9.5 aggregations (including circular hue difference and room exclusion).
- Test that Mongo failure does not fail submit, and that `/api/me/stats` degrades. API tests cover 401/403, Origin, start/submit per mode, and token misuse.
- Report the command and result summary, not just "tests pass".

## Working style
- First give a short plan: files to create/change and tests. If the user says "plan only", stop and wait; otherwise implement.
- Keep diffs small and focused; do not reformat unrelated files. Commit regularly.
- Log ambiguous choices and unresolved follow-ups in the local, gitignored `UNCERTAINTIES.md`; never commit that file.
- Before the final commit of every task, update this AGENTS.md (Current status, commands, gotchas, or rules as applicable) so it matches the repository as committed.
- Finish with: files changed, tests added, any Architecture §6 default used, and anything uncertain.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
