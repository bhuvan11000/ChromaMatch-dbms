# ChromaMatch — Application Architecture (High-Level and Mid-Level)

> This document specifies **how ChromaMatch is built**: the technology stack, the high-level system architecture, and the mid-level design of every module, flow and interface.
> It is the bridge between the two design documents and the code:
> - `ChromaMatch_Game_Design.md` — **what** the game is (rules, modes, roles).
> - `ChromaMatch_Database_Design.md` — **the data layer** (ER diagram, relational schema, MongoDB model, integrity rules).
> - **This document** — **how the application is structured** (layers, modules, contracts, flows, conventions).
>
> Status: **tentative**, like the other two documents. Where the design documents leave an item undecided, Section 6 records the **default adopted for implementation** so that nothing blocks development. Each default can be changed later in one place.
>
> Reading guide for humans and coding tools: Sections 1–4 give the big picture. Section 5 is the detailed specification and is the one to follow while writing code. Section 6 lists adopted defaults. Section 7 maps course requirements to design elements. Section 8 holds catalogs (error codes, constants, proposed achievements).

---

## Table of contents

1. [Purpose, scope and conventions](#1-purpose-scope-and-conventions)
2. [Architectural drivers](#2-architectural-drivers)
3. [Technology stack](#3-technology-stack)
4. [High-level architecture](#4-high-level-architecture)
5. [Mid-level architecture](#5-mid-level-architecture)
   - 5.1 [Repository structure](#51-repository-structure)
   - 5.2 [Layering and dependency rules](#52-layering-and-dependency-rules)
   - 5.3 [Shared constants and configuration](#53-shared-constants-and-configuration)
   - 5.4 [Domain modules (pure logic)](#54-domain-modules-pure-logic)
   - 5.5 [Authentication and sessions](#55-authentication-and-sessions)
   - 5.6 [Game tokens](#56-game-tokens)
   - 5.7 [Service layer](#57-service-layer)
   - 5.8 [PostgreSQL layer](#58-postgresql-layer)
   - 5.9 [MongoDB layer](#59-mongodb-layer)
   - 5.10 [HTTP API contract](#510-http-api-contract)
   - 5.11 [Frontend architecture](#511-frontend-architecture)
   - 5.12 [Sequence diagrams and state machines](#512-sequence-diagrams-and-state-machines)
   - 5.13 [Cross-cutting concerns](#513-cross-cutting-concerns)
   - 5.14 [Testing strategy](#514-testing-strategy)
   - 5.15 [Development environment, CI and deployment](#515-development-environment-ci-and-deployment)
6. [Defaults adopted for open items](#6-defaults-adopted-for-open-items)
7. [Traceability to course requirements](#7-traceability-to-course-requirements)
8. [Appendices](#8-appendices)

---

## 1. Purpose, scope and conventions

### 1.1 Purpose
Everything needed to implement ChromaMatch without guessing: module boundaries, responsibilities, data flows, API shapes, algorithms, error handling, concurrency rules and operational setup.

### 1.2 In scope
- All three game modes: **Global**, **Daily**, **Custom Room**.
- Accounts, roles (player/admin), bans, statistics, streaks, achievements, leaderboards, admin tooling.
- Both databases (PostgreSQL and MongoDB) and how the application talks to them.

### 1.3 Out of scope
- Column-level DDL and the ER diagram (see the database document; this document only adds *behavioural* specifications such as procedure signatures, and a small number of explicitly flagged refinements).
- Visual design (colors, typography, layout details) beyond functional UI requirements.
- Real-time infrastructure (WebSockets). Rooms use polling.

### 1.4 Conventions used in this document
- **MUST / MUST NOT / SHOULD / MAY** are used in their RFC 2119 sense. A coding tool should treat MUST/MUST NOT as hard constraints.
- Names in `monospace` are identifiers (tables, columns, functions, files, endpoints, env vars).
- Table and column names refer to the database document (`users`, `room_players`, ...).
- "Server" means Next.js route handlers and the service layer. "Client" means code running in the browser.
- "Play order" means the order in which a given player sees the 3 colors of a game (may be shuffled). "Color number" (1–3) is the identity of a shared color (`challenge_colors.round_number` / `room_colors.round_number`).
- All times are **UTC**. A "day" is a UTC calendar date.
- HSV ranges: **H 0–360, S 0–100, V 0–100**, one decimal place.
- Scores: round 0.0–10.0, game/attempt 0.0–30.0, one decimal place.

### 1.5 Corrections and refinements this document makes to earlier documents
These are small and deliberate; they are repeated where relevant.

| # | Where | Refinement |
|---|---|---|
| R1 | Database doc §7.2 example | The example round score `8.9` for target (214.6, 62.0, 80.5) vs guess (209.0, 58.5, 77.0) is **illustrative only**. With the scoring formula and equal weights the correct score is **9.7**. Do not use the example numbers as test data; use the test vectors in §5.4.1. |
| R2 | Database doc §6.1 | Optional: make username uniqueness **case-insensitive** (unique index on `lower(username)`) so `Alice` and `alice` cannot both exist. The existing `UNIQUE(username)` can stay as well. |
| R3 | Database doc §8.4 | Use `ROW_NUMBER()` (not `RANK()`) with a deterministic tie-break (earliest achieved time, then lowest `user_id`). This satisfies "ties are ranked arbitrarily" and makes pagination stable. |
| R4 | Game doc §2 step 5 vs §3 | Because the whole game is scored by the server in **one request after round 3**, round scores and per-channel breakdowns are shown **together on the game result screen**, not after each individual round (this matches the screen-flow diagram in the game document). |

---

## 2. Architectural drivers

### 2.1 Functional drivers
- Three modes with different color sources (random / date-seeded shared / room-shared) but identical round and scoring mechanics.
- Whole games are submitted at once; incomplete games leave no trace.
- Personal-best logic (strictly greater replaces), daily streaks, achievements, leaderboards computed on demand.
- Private asynchronous rooms with lobby, capacity, forfeiting, automatic end.
- Admin moderation (view, edit stats, ban/unban).

### 2.2 Quality drivers (in priority order)
1. **Correctness and integrity of scores/PBs/room results.** Leaderboard-feeding data is authoritative in PostgreSQL and changes only through transactional functions.
2. **Server-authoritative scoring.** The browser MUST NOT be able to submit a score or choose the target colors it is scored against.
3. **Simplicity.** Two-person student team; free-tier infrastructure; a monolithic Next.js app is enough.
4. **Satisfying the course rubric:** two database paradigms, SQL features (transactions, procedures/functions, triggers, views, indexes), NoSQL aggregation, validation at the DB level, security basics.
5. **Graceful degradation.** If MongoDB is unavailable, play and leaderboards still work.
6. **Testability.** Pure logic is separated from I/O so it can be unit-tested.

### 2.3 Constraints
- Browser game; Next.js frontend and backend (design decision).
- PostgreSQL + MongoDB (design decision). No vector database.
- Authentication is self-managed (email + password hash) in Postgres; no third-party auth providers not even Supabase's own auth service.
- All secrets in environment variables.
- Free-tier hosting (Supabase Postgres, MongoDB Atlas M0, Vercel Hobby or equivalent).

---

## 3. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Language | **TypeScript** (`strict: true`) everywhere | Shared types between client and server. |
| Runtime | **Node.js LTS** (20 or 22) | Route handlers MUST run on the **Node.js runtime** (not Edge) because the app uses native/TCP database drivers and argon2. |
| Framework | **Next.js (App Router)** | Pages + Route Handlers (`app/api/**/route.ts`) in one repository. |
| UI | **React**, **Tailwind CSS** | Custom HSV sliders and color swatches; a component kit (shadcn/ui) is optional. |
| Client data layer | **TanStack Query** | Fetching, caching and polling (lobby, room scoreboard, leaderboards). |
| Validation | **Zod** | Request/response schemas; shared by client and server. |
| PostgreSQL host | **Supabase (as plain Postgres)** | Supabase Auth/Realtime/Storage are NOT used. |
| Postgres driver / ORM | **postgres.js** + **Drizzle ORM** + **drizzle-kit** | Drizzle for typed table access and generated migrations; raw SQL (`sql` template) for functions, procedures, views, triggers, partial indexes. |
| MongoDB host | **MongoDB Atlas (M0 free tier)** | |
| Mongo driver | **Official `mongodb` Node driver** | No Mongoose: the JSON Schema validator and aggregation pipelines are used directly. |
| Password hashing | **argon2id** (`@node-rs/argon2`) | bcrypt is an acceptable fallback; passwords are never stored or logged in plain text. |
| Sessions | **Signed JWT in an httpOnly cookie** via **`jose`** | Stateless; no sessions table. |
| Game tokens | **Signed JWT (separate secret)** via **`jose`** | See §5.6. |
| Charts | **Recharts** | Profile statistics. |
| Testing | **Vitest** (unit + integration), **Playwright** (optional end-to-end) | |
| Lint/format | ESLint, Prettier, `tsc --noEmit` | Run in CI. |
| Version control / CI | Git + GitHub, GitHub Actions | |
| Hosting | **Vercel** (app), **Supabase** (Postgres), **MongoDB Atlas** (Mongo) | |
| Local development | **Docker Compose** with `postgres` and `mongo` containers | See §5.15. |

Version policy: use the latest stable releases at scaffolding time and **pin exact versions** via the lockfile. Do not add libraries not listed here without a written reason.

---

## 4. High-level architecture

### 4.1 System context

```
                     ┌──────────────────────┐
   Player / Admin ──►│  Web browser (SPA-ish │
                     │  Next.js client)      │
                     └──────────┬───────────┘
                                │ HTTPS (JSON, cookie session)
                     ┌──────────▼───────────┐
                     │  ChromaMatch server  │
                     │  (Next.js on Vercel) │
                     └───────┬────────┬─────┘
                             │        │
                  SQL over   │        │  MongoDB wire protocol (TLS)
                  TLS        │        │
                  ┌──────────▼──┐  ┌──▼────────────┐
                  │ PostgreSQL  │  │ MongoDB Atlas │
                  │ (Supabase)  │  │ game_history  │
                  └─────────────┘  └───────────────┘
```

There are no other external systems: no email service, no OAuth provider, no queue, no cache server, no WebSocket server.

### 4.2 Container view

```
┌──────────────────────────────── Browser ─────────────────────────────────┐
│  Next.js pages (React client components)                                 │
│   • Auth screens         • Mode select / home                            │
│   • Game screen (state machine: reveal → hide → guess → submit)          │
│   • Result screen        • Leaderboards                                  │
│   • Room lobby / play / scoreboard (polling)                             │
│   • Profile (stats, streak, achievements)  • Admin panel                 │
│  TanStack Query cache · Zod schemas · HSV→CSS color util                 │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ fetch('/api/...') — JSON
┌───────────────────────────────────▼──────────────────────────────────────┐
│                       Next.js server (Node runtime)                      │
│                                                                          │
│  Route handlers (thin) ──► parse/validate (Zod) ──► auth/guards          │
│            │                                                             │
│            ▼                                                             │
│  Service layer: authService · gameService · dailyChallengeService ·      │
│                 roomService · leaderboardService · statsService ·        │
│                 adminService                                             │
│            │                         │                                   │
│            ▼                         ▼                                   │
│  Domain modules (pure):        Data access:                              │
│   scoring · colors · shuffle    pg/ (Drizzle + raw SQL calls)            │
│   time · gameToken · hsv        mongo/ (history repo + aggregations)     │
└──────────────┬──────────────────────────────┬────────────────────────────┘
               │                              │
   ┌───────────▼───────────┐       ┌──────────▼─────────┐
   │ PostgreSQL            │       │ MongoDB            │
   │ tables · constraints  │       │ game_history       │
   │ functions/procedures  │       │ JSON Schema        │
   │ triggers · views      │       │ indexes            │
   │ indexes               │       │ (insert-only)      │
   └───────────────────────┘       └────────────────────┘
```

### 4.3 Deployment view

| Component | Where it runs | Connection |
|---|---|---|
| Next.js app (pages + route handlers) | Vercel (serverless functions, Node runtime). Choose the function region closest to the Supabase region. | — |
| PostgreSQL | Supabase project (managed Postgres) | App uses the **pooler** connection string (`DATABASE_URL`); migrations and seeds use the **direct/session** connection string (`DATABASE_URL_DIRECT`). |
| MongoDB | Atlas M0 cluster; IP access list set to allow Vercel (Atlas "allow from anywhere" is acceptable for a course project if credentials are strong) | `MONGODB_URI` |
| Secrets | Vercel environment variables (production/preview), `.env.local` (developer machines) | Never committed. |

Free-tier caveats to be aware of (verify current limits): Supabase free projects can be **paused after a period of inactivity**; Atlas M0 has a small storage cap. Neither affects the design, but wake the project before demos.

### 4.4 Architectural principles

1. **Browser never talks to a database.** All access goes through route handlers.
2. **Server-authoritative scoring.** Scores are computed on the server against targets the server itself issued (via signed game tokens, §5.6). The client sends only **guesses**.
3. **Postgres is the system of record; MongoDB is the history log.** Postgres is written first, inside one transaction (one function call). MongoDB is written second, best-effort.
4. **Rules that span rows/tables live in the database** (functions, procedures, triggers, constraints). Rules that need computation or randomness live in TypeScript domain modules.
5. **Derived data is never stored.** Ranks, RGB/hex, leaderboards are computed on request.
6. **Thin route handlers, fat services, pure domain.** Business logic is not in route handlers, React components or SQL string literals scattered around the code.
7. **One way to do things.** All data reaches the UI through the HTTP API and TanStack Query (no mixing of server-component data fetching with API calls for the same data).
8. **Fail closed.** Any missing/invalid session, token, role or membership results in a rejection, never a silent default.
9. **Incomplete games are never persisted.** The client holds in-progress guesses in memory; the server only learns about a game when it is complete.

### 4.5 Data ownership matrix

| Data | Authoritative store | Notes |
|---|---|---|
| Accounts, roles, bans, password hashes | Postgres `users` | |
| Global PB, counters, streaks, last daily date | Postgres `users` | Changed only by `submit_game_result` and admin procedures. |
| Daily challenges and their 3 colors | Postgres `daily_challenges`, `challenge_colors` | Created lazily; immutable after creation. |
| Daily PBs | Postgres `daily_personal_bests` | |
| Achievements (definitions) / earned | Postgres `achievements` / `user_achievements` | Definitions seeded by developers. |
| Rooms, room colors, members, room best scores | Postgres `rooms`, `room_colors`, `room_players` | Changed only by room functions. |
| Leaderboards, scoreboards, ranks | **Not stored** — Postgres views | |
| Every completed game / room attempt (round by round) | MongoDB `game_history` | Insert-only; never read for leaderboards, PBs or achievements. |
| Session | Browser cookie (signed JWT) | No server-side session store. |
| In-progress game targets | **Game token** held by the browser | Signed, not stored server-side (§5.6). |
| In-progress guesses | Browser memory only | Lost if the tab closes (by design). |

### 4.5.1 Cross-database links
`game_history.user_id`, `.daily_challenge_id`, `.room_id` are logical references to Postgres rows; they are enforced by application code only. A transaction cannot span both databases (Database doc §8.3). Admin stat edits change Postgres only.

### 4.6 Trust boundaries

| Boundary | Trusted side | Untrusted side | Controls |
|---|---|---|---|
| Browser ↔ Server | Server | Everything from the browser (body, headers, cookies, tokens) | Zod validation, JWT signature checks, role/membership checks, server-side scoring, Origin check for mutating requests. |
| Server ↔ Databases | Server and DBs | — | Credentials in env vars; parameterized queries only; DB constraints as a second line of defense. |
| Game token | Server-signed | Browser-held | HMAC signature + expiry + user binding. The browser can read but not alter it. |

Known inherent limitation: targets must be sent to the browser to be displayed, so a determined cheater can read them from the network tab. The design limits what they gain (they cannot change what they are scored against or claim a score), but cannot prevent perfect guesses. Accepted for this project.

### 4.7 Request lifecycle (all API calls)

```
Request
  → (middleware: for page routes only — verify session cookie signature, redirect to /login if absent/invalid)
  → route handler
      1. Origin/CSRF check (mutating methods)
      2. Parse JSON body / query with Zod → 400 on failure
      3. Resolve session (verify JWT) → 401 if required and missing
      4. Role / membership guard → 403
      5. Call exactly one service function
      6. Map result → JSON response; map domain errors → HTTP status + error body
  → response (Cache-Control: no-store)
```

### 4.8 Key flows at a glance

| Flow | Summary |
|---|---|
| Register / login | Validate → hash/verify (argon2) → set session cookie. |
| Start a game (any mode) | Server builds the targets (random / today's challenge / room colors), shuffles play order, signs a **game token**, returns the colors to display plus the token. |
| Submit a game (any mode) | Verify token → score server-side → call Postgres function (PB / counters / streak / achievements / room best) → insert MongoDB history → respond with scores and notices. |
| Leaderboards | Read from Postgres views (banned users excluded for Global/Daily). |
| Room lifecycle | Create → join (lobby only) → creator starts (colors generated) → members play attempts independently → members finish/leave → room finishes automatically. |
| Stats | Postgres counters + MongoDB aggregations (Global/Daily only). |
| Admin | Guarded routes; stat edits and ban/unban via Postgres procedures. |

### 4.9 Failure modes and handling

| Failure | Effect | Handling |
|---|---|---|
| Postgres unavailable | Game cannot start/submit; leaderboards fail | Return 503 with `SERVICE_UNAVAILABLE`; client shows retry. No partial writes (transactions). |
| MongoDB unavailable at submit | History not recorded | Log error with context (user, mode, token `jti`); retry insert once; still return success to the player. |
| MongoDB unavailable at stats read | Aggregation stats missing | `/api/me/stats` returns Postgres counters and `history: null`, `historyAvailable: false`. |
| Game token invalid/expired/tampered | Submission rejected | 400 `TOKEN_INVALID` / `TOKEN_EXPIRED`; the game is lost (client may start a new one). |
| Same token submitted twice | Second submission would be counted again | Accepted limitation for Global/Daily (PB unaffected; only `total_games_played` inflates). Room replays are blocked by `attempts_limit`. Optional hardening in §6. |
| Two players join the last room slot simultaneously | Capacity race | `join_room` locks the room row; trigger re-checks capacity. One succeeds, the other gets `ROOM_FULL`. |
| Two members submit their final attempts simultaneously | Room-over race (nobody sees the other's finish) | All room functions lock the **room row first** (serialization per room). |
| Two first-players of the day request today's challenge simultaneously | Duplicate challenge | `UNIQUE(challenge_date)` + `INSERT ... ON CONFLICT DO NOTHING`; loser reads the winner's row. |
| Player's tab closes mid-game | Game lost | By design; nothing was saved. |
| Clock skew | Timer/daily boundary issues | The server is the only authority on "today (UTC)"; the client displays a countdown from a server-provided `resetsAt`. |

---

## 5. Mid-level architecture

### 5.1 Repository structure

A single Next.js repository (monolith). Paths are relative to the repo root. Every file listed has one clear responsibility; do not create parallel structures.

```
chromamatch/
├─ AGENTS.md                      # rules for AI coding tools (points to docs/)
├─ README.md                      # setup, scripts, how to run
├─ docs/
│  ├─ ChromaMatch_Game_Design.md
│  ├─ ChromaMatch_Database_Design.md
│  ├─ ChromaMatch_Architecture.md   # this file
│  └─ chromamatch_er_diagram.png
├─ docker-compose.yml             # local postgres + mongo
├─ .env.example                   # every env var, with dummy values
├─ drizzle.config.ts
├─ drizzle/                       # generated + custom SQL migrations (ordered)
├─ scripts/
│  ├─ seed-achievements.ts        # idempotent upsert of achievement definitions
│  ├─ seed-admin.ts               # promote an existing email to admin (or create)
│  ├─ init-mongo.ts               # create collection, JSON Schema validator, indexes
│  └─ ddl-demo.sql                # course deliverable: ALTER/DROP demonstrations (not run by the app)
├─ src/
│  ├─ middleware.ts               # page-route session gate (cookie signature only)
│  ├─ app/
│  │  ├─ layout.tsx · globals.css · providers.tsx (TanStack Query provider)
│  │  ├─ page.tsx                 # landing / redirect
│  │  ├─ (auth)/login/page.tsx · (auth)/register/page.tsx
│  │  ├─ (app)/home/page.tsx      # mode select
│  │  ├─ (app)/play/global/page.tsx
│  │  ├─ (app)/play/daily/page.tsx
│  │  ├─ (app)/rooms/page.tsx     # create / join-by-code
│  │  ├─ (app)/rooms/[code]/page.tsx        # lobby / play / scoreboard (one route, status-driven)
│  │  ├─ (app)/leaderboard/global/page.tsx
│  │  ├─ (app)/leaderboard/daily/page.tsx   # ?date=YYYY-MM-DD
│  │  ├─ (app)/profile/page.tsx
│  │  ├─ (app)/admin/page.tsx · admin/users/[id]/page.tsx
│  │  └─ api/
│  │     ├─ auth/{register,login,logout}/route.ts
│  │     ├─ me/route.ts · me/stats/route.ts · me/history/route.ts · me/achievements/route.ts
│  │     ├─ daily/today/route.ts
│  │     ├─ games/{start,submit}/route.ts
│  │     ├─ leaderboards/{global,daily}/route.ts
│  │     ├─ rooms/route.ts · rooms/join/route.ts
│  │     ├─ rooms/[code]/route.ts · rooms/[code]/{start,leave}/route.ts
│  │     └─ admin/users/route.ts · admin/users/[id]/route.ts
│  │        · admin/users/[id]/{ban,unban,stats}/route.ts
│  ├─ components/
│  │  ├─ game/ (ColorSwatch, RevealCountdown, HsvSliders, RoundProgress, GameResult, ChannelDiffBars)
│  │  ├─ leaderboard/ (LeaderboardTable, RankBadge)
│  │  ├─ rooms/ (RoomCreateForm, JoinForm, LobbyMemberList, RoomScoreboard, RoomSettingsSummary)
│  │  ├─ profile/ (StatsCards, AchievementGrid, TrendChart, AccuracyChart)
│  │  ├─ admin/ (UserTable, UserStatsEditor, BanButton)
│  │  └─ ui/ (Button, Input, Card, Modal, Toast, Spinner, ...)
│  ├─ hooks/                      # useGameMachine, useRoomPolling, useSession, useLeaderboard, ...
│  ├─ lib/
│  │  ├─ config/ constants.ts · env.ts   # constants (§5.3) and validated env
│  │  ├─ domain/                  # PURE logic, no I/O (§5.4)
│  │  │  hsv.ts · scoring.ts · colors.ts · shuffle.ts · time.ts · streak.ts
│  │  ├─ auth/                    # password.ts · session.ts · guards.ts · origin.ts
│  │  ├─ tokens/ gameToken.ts     # sign/verify game tokens (§5.6)
│  │  ├─ db/
│  │  │  ├─ pg/ client.ts · schema.ts · errors.ts · queries/ (users.ts, leaderboards.ts, rooms.ts, daily.ts, achievements.ts, admin.ts) · functions.ts (typed wrappers around SQL functions)
│  │  │  └─ mongo/ client.ts · historyRepo.ts · aggregations.ts
│  │  ├─ services/                # authService, gameService, dailyChallengeService, roomService,
│  │  │                           # leaderboardService, statsService, adminService (§5.7)
│  │  ├─ api/                     # handler helpers: withHandler(), apiError(), json(), parseBody()
│  │  ├─ schemas/                 # Zod schemas for every request/response (shared with client)
│  │  └─ errors.ts                # AppError class + error code catalog (§8.1)
│  └─ types/                      # shared TypeScript types (Hsv, GameMode, ApiError, ...)
├─ tests/
│  ├─ unit/                       # domain, tokens, schemas
│  ├─ integration/                # Postgres functions/triggers/views, Mongo repo, services (real DBs)
│  └─ e2e/                        # Playwright (optional)
└─ .github/workflows/ci.yml
```

### 5.2 Layering and dependency rules

Dependencies point **downwards only**. A lower layer MUST NOT import from a higher layer.

| Layer | Folder | May import | MUST NOT |
|---|---|---|---|
| Pages / components / hooks | `app/**/page.tsx`, `components`, `hooks` | `lib/schemas`, `types`, `lib/config/constants`, `lib/domain/hsv` (pure helpers for display) | Import services, `lib/db`, `lib/auth/password`, secrets, or call the scoring function for submission purposes. |
| Route handlers | `app/api/**/route.ts` | `lib/api`, `lib/schemas`, `lib/auth/{session,guards,origin}`, `lib/services`, `lib/errors` | Contain business logic or SQL; import `lib/db` directly. |
| Services | `lib/services` | `lib/domain`, `lib/tokens`, `lib/db`, `lib/config`, `lib/errors` | Import anything from `app/` or `next/*` request objects (services receive plain arguments). |
| Data access | `lib/db/pg`, `lib/db/mongo` | `lib/config`, `lib/errors`, driver libraries | Contain business rules beyond mapping rows/documents; import services. |
| Domain | `lib/domain` | `lib/config/constants` only | Perform I/O, read env, use `Date.now()` implicitly (time is passed in), or import anything framework-related. |

Additional rules:
- Each route handler calls **exactly one** service function.
- Each service function that changes Postgres state calls **exactly one** SQL function/procedure for that change (so the change is atomic).
- `lib/db/pg/functions.ts` is the only place SQL function names and argument orders appear.
- Raw SQL appears only in `lib/db/pg/**` and in `drizzle/*.sql`.
- Zod schemas in `lib/schemas` are the single definition of every request and response body; TypeScript types are inferred from them.
- All randomness for game purposes uses Node's `crypto` module (except the date-seeded PRNG for Daily, §5.4.3). Never use `Math.random()` for game colors, shuffles, room codes or tokens.

### 5.3 Shared constants and configuration

#### 5.3.1 Constants (`lib/config/constants.ts`) — single source of truth

| Constant | Value | Source |
|---|---|---|
| `ROUNDS_PER_GAME` | 3 | Game doc §3 |
| `REVEAL_MS` | 5000 | Game doc §2 |
| `MAX_ROUND_SCORE` | 10 | |
| `MAX_GAME_SCORE` | 30 | |
| `HUE_MIN` / `HUE_MAX` | 0 / 360 | |
| `SAT_MIN` / `SAT_MAX`, `VAL_MIN` / `VAL_MAX` | 0 / 100 | |
| `HSV_DECIMALS` | 1 | |
| `SCORE_WEIGHTS` | `{ h: 1/3, s: 1/3, v: 1/3 }` (must sum to 1) | Game doc §4 |
| `ROOM_MIN_SIZE` | 2 | Game doc §7.1 |
| `ROOM_MAX_SIZE` | **10** (adopted default; open item) | §6 |
| `ROOM_TIMER_OPTIONS` | `[null, 5, 10, 15]` seconds | |
| `ROOM_ATTEMPT_OPTIONS` | `[3, 5]` | |
| `ROOM_CODE_LENGTH` | 8 | DB doc §6.7 |
| `ROOM_CODE_ALPHABET` | `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no look-alike characters) | |
| `GAME_TOKEN_TTL_SECONDS` | 7200 (2 h) | §5.6 |
| `GAME_MIN_ELAPSED_SECONDS` | 13 | anti-cheat lower bound (3 × 5 s reveal, minus slack) |
| `SESSION_TTL_SECONDS` | 604800 (7 days) | §5.5 |
| `LEADERBOARD_DEFAULT_LIMIT` / `LEADERBOARD_MAX_LIMIT` | 50 / 100 | |
| `LOBBY_POLL_MS` / `ROOM_POLL_MS` | 2000 / 3000 | §5.11 |
| `SLIDER_DEFAULTS` | `{ h: 180, s: 50, v: 50 }` (adopted default; open item) | §6 |
| `SHOW_LIVE_STANDINGS` | `true` (adopted default; open item) | §6 |
| `BANNED_CAN_PLAY` | `true` (adopted default; open item) | §6 |

#### 5.3.2 Environment variables (`lib/config/env.ts` validates them with Zod at startup; the app MUST fail fast if any required one is missing)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres **pooler** connection string used by the app. |
| `DATABASE_URL_DIRECT` | yes (migrations/seeds) | Direct or session-mode connection used by `drizzle-kit` and scripts. |
| `MONGODB_URI` | yes | Atlas/local Mongo connection string. |
| `MONGODB_DB_NAME` | yes (default `chromamatch`) | Mongo database name. |
| `SESSION_JWT_SECRET` | yes (≥ 32 random bytes) | Signs session cookies. |
| `GAME_TOKEN_SECRET` | yes (≥ 32 random bytes, **different** from the session secret) | Signs game tokens. |
| `DAILY_SEED_SECRET` | yes | Mixed into the daily-seed string so future days' colors cannot be precomputed from public source code. |
| `APP_ORIGIN` | yes | Canonical origin (e.g. `https://chromamatch.vercel.app`) used for the Origin check. |
| `NODE_ENV` | yes | |
| `LOG_LEVEL` | no (default `info`) | |

### 5.4 Domain modules (pure logic)

All modules in `lib/domain` are pure functions: no database, no network, no `Date.now()` (callers pass time in), no environment access. They are exhaustively unit-tested.

#### 5.4.1 `hsv.ts` and `scoring.ts`

**Types.** `Hsv = { h: number; s: number; v: number }` with one-decimal values.

**`hsv.ts` responsibilities**
- `isValidHsv(x)`: all three finite numbers; `0 ≤ h ≤ 360`, `0 ≤ s ≤ 100`, `0 ≤ v ≤ 100`.
- `normalizeHsv(x)`: round each channel to one decimal (half away from zero) after validation.
- `toTenths(x)` / `fromTenths(n)`: convert between decimal values and **integer tenths** (e.g. 214.6 ↔ 2146). All scoring arithmetic uses integer tenths to avoid floating-point drift.
- `hsvToCssColor(hsv)`: converts HSV to an `rgb()`/`hsl()` CSS string for display only. RGB/hex is **never stored** and never used for scoring.

**`scoring.ts` — `scoreRound(target: Hsv, guess: Hsv): { score: number; diff: { h: number; s: number; v: number } }`**

Algorithm (this is normative):
1. Convert all six values to integer tenths.
2. **Hue difference (circular):** `d = |hT − hG|`; if `d > 1800` then `d = 3600 − d`. (So 359.0 vs 1.0 differ by 2.0°, and 360.0 vs 0.0 differ by 0.) `dh = d / 1800` (a value in 0–1).
3. **Saturation difference:** `ds = |sT − sG| / 1000`.
4. **Value difference:** `dv = |vT − vG| / 1000`.
5. **Combined distance:** `dist = sqrt( Wh·dh² + Ws·ds² + Wv·dv² )` where the weights come from `SCORE_WEIGHTS` (sum = 1). `dist` is in 0–1.
6. **Points:** `raw = 10 × (1 − dist)`, clamped to `[0, 10]`.
7. **Rounding:** `score = round(raw × 10) / 10` (round half up). Round scores are therefore multiples of 0.1.
8. **Returned `diff`:** the absolute per-channel differences in display units: `h` = shortest-way hue distance in degrees, `s` and `v` in percentage points, each with one decimal.

**`scoreGame(targets: Hsv[3], guesses: Hsv[3]): { rounds: RoundResult[3]; total: number }`**
- Applies `scoreRound` to each pair **in play order**.
- `total` = sum of the three **already rounded** round scores, computed in integer tenths and divided by 10 (so `9.7 + 9.9 + 5.7 = 25.3` exactly, never `25.299999…`).

**Test vectors (use these in unit tests; equal weights):**

| # | Target (h, s, v) | Guess (h, s, v) | Expected round score | Notes |
|---|---|---|---|---|
| 1 | (214.6, 62.0, 80.5) | (209.0, 58.5, 77.0) | **9.7** | raw ≈ 9.6625 |
| 2 | (120.0, 40.0, 40.0) | (120.0, 40.0, 40.0) | **10.0** | perfect match |
| 3 | (0.0, 0.0, 0.0) | (180.0, 100.0, 100.0) | **0.0** | worst case, all three differences = 1 |
| 4 | (359.0, 50.0, 50.0) | (1.0, 50.0, 50.0) | **9.9** | hue wraps: difference 2.0°, raw ≈ 9.936 |
| 5 | (100.0, 50.0, 50.0) | (190.0, 100.0, 75.0) | **5.7** | dh = 0.5, ds = 0.5, dv = 0.25, raw ≈ 5.670 |
| 6 | (0.0, 70.0, 70.0) | (360.0, 70.0, 70.0) | **10.0** | 360° ≡ 0° |

Game-total check: rounds 9.7 + 9.9 + 5.7 → **25.3**.

Property tests: score is within 0–10; scoring is symmetric (`scoreRound(a,b) = scoreRound(b,a)`); identical colors give 10; weights sum to 1.

#### 5.4.2 `colors.ts` — random colors

- `generateRandomColor(rng)`: `h` uniform over 0.0–359.9 (3600 possible values in tenths), `s` and `v` uniform over 0.0–100.0 (1001 values in tenths each). Fully random per the game design (Game doc §14 item 16: no exclusion of near-black/white/gray). The function takes an options argument (currently unused) so that a constraint can be added later without changing callers.
- `generateRandomColors(n, rng)`: n independent colors.
- Uses `crypto.randomInt` for Global and Room colors.

#### 5.4.3 `colors.ts` — date-seeded daily colors

`generateDailyColors(dateUtc: 'YYYY-MM-DD', secret: string): [Hsv, Hsv, Hsv]`
1. Seed string: `` `chromamatch-daily|${secret}|${dateUtc}` `` (the `secret` is `DAILY_SEED_SECRET`; including it prevents anyone from precomputing future days' colors from the public algorithm while keeping the colors a pure function of the date as far as the system is concerned).
2. Hash the seed string to a 32-bit integer with the **xmur3** string-hash.
3. Create a **mulberry32** PRNG from that integer.
4. Draw 9 values in fixed order: `h1,s1,v1,h2,s2,v2,h3,s3,v3`. Map each uniform `r ∈ [0,1)` to tenths: `h = floor(r × 3600) / 10`; `s`/`v` = `floor(r × 1001) / 10`.
5. Return the three colors as color numbers 1, 2, 3.

Determinism test: same date + secret → identical output across runs; different dates → different outputs (with overwhelming probability).

Important: the **database is the source of truth** for a day's colors. The seeded generator is only used when the day's challenge row does not exist yet. If the secret ever changes, previously created days are unaffected.

#### 5.4.4 `shuffle.ts`
- `randomPermutation(n)`: Fisher–Yates using `crypto.randomInt`; returns an array of indices.
- Used for Daily and Room at **every game start** (adopted default: re-shuffled each game/attempt; the actual order is recorded in the token and in Mongo's `color_number`).
- `isPermutationOf123(arr)` helper for validation/tests.

#### 5.4.5 `time.ts`
- `utcDateString(date: Date): 'YYYY-MM-DD'` — the UTC calendar date.
- `nextUtcMidnight(date: Date): Date` — the next 00:00 UTC (used for `resetsAt`).
- `addDays(dateString, n)`.
- Every function takes the current time as an argument. Only the outermost caller (a service or handler) calls `new Date()`.

#### 5.4.6 `streak.ts`
- `displayStreak(current: number, lastDailyPlayedDate: string | null, todayUtc: string): number` — returns `0` if `lastDailyPlayedDate` is earlier than yesterday (UTC), otherwise `current` (Database doc §6.1 display nuance).
- The **write-side** streak rule lives in the Postgres function `submit_game_result` (§5.8.3), not here.

### 5.5 Authentication and sessions

#### 5.5.1 Registration (`POST /api/auth/register`)
- Input validation: `username` 3–30 characters matching `^[A-Za-z0-9_]+$` (trimmed); `email` valid, trimmed, **lower-cased before storing**; `password` 8–128 characters.
- Hash with argon2id (library defaults are acceptable; tune only if needed).
- Insert into `users` (defaults: role `player`, not banned, counters 0).
- Unique violations (username or email) → 409 `USERNAME_TAKEN` / `EMAIL_TAKEN`. To limit account enumeration, the login endpoint never reveals which part was wrong, but registration necessarily reports conflicts.
- On success: create session cookie, return the public user object (never the hash).

#### 5.5.2 Login (`POST /api/auth/login`)
- Look up by lower-cased email. If not found, still run a dummy argon2 verify (equalize timing) and return 401 `INVALID_CREDENTIALS`.
- Wrong password → the same 401 `INVALID_CREDENTIALS`.
- Banned users: governed by `BANNED_CAN_PLAY` (default `true`: they can log in and play; their scores are hidden from Global/Daily leaderboards). This is a single guard function so the policy can be flipped in one place (open item).
- On success: set the session cookie.

#### 5.5.3 Session cookie
- Name `cm_session`; value = JWT (HS256, `SESSION_JWT_SECRET`) with claims `{ sub: userId, role, iat, exp }`; `exp` = `SESSION_TTL_SECONDS`.
- Cookie flags: `HttpOnly`, `Secure` (in production), `SameSite=Lax`, `Path=/`, `Max-Age` equal to the TTL.
- Logout: clear the cookie (set `Max-Age=0`).
- The role in the JWT is a **hint only**. For anything privileged (all `/api/admin/*` routes, and `GET /api/me`), the server re-reads `role` and `is_banned` from Postgres so a demotion/ban takes effect immediately rather than at token expiry.

#### 5.5.4 Guards (`lib/auth/guards.ts`)
- `getSession(req)`: verifies the cookie and returns `{ userId, roleHint } | null`.
- `requireUser(req)`: 401 `UNAUTHENTICATED` if no valid session.
- `requireAdmin(req)`: `requireUser` + loads the user row; 403 `FORBIDDEN` unless `role = 'admin'`.
- Room membership and creator checks are done inside the room service/SQL functions (not in the handler).

#### 5.5.5 CSRF / Origin protection
- Cookie is `SameSite=Lax`; additionally every **mutating** request (`POST`, `PATCH`, `PUT`, `DELETE`) MUST have `Content-Type: application/json` and an `Origin` (or `Referer`) header whose origin equals `APP_ORIGIN`; otherwise 403 `BAD_ORIGIN`. Implemented once in `lib/auth/origin.ts` and invoked by the shared handler wrapper.

#### 5.5.6 Admin bootstrap
There is no endpoint to become an admin. The first admin is created by running `scripts/seed-admin.ts` (promotes an existing registered email to `admin`).

#### 5.5.7 Rate limiting
Minimum: a simple in-process limiter on `POST /api/auth/login` and `/register` (e.g. 10 attempts per 15 minutes per IP + email). On serverless this is best-effort (per instance); document that a shared store would be needed for strict limits. MAY be skipped in the first iteration but the handler wrapper MUST have a hook for it.

### 5.6 Game tokens

A **game token** is a signed, short-lived JWT that carries the **targets** for one game. It lets the server verify and score a submitted game without storing in-progress state (the ER model has no in-progress table by design).

#### 5.6.1 Claims

| Claim | Type | Meaning |
|---|---|---|
| `typ` | `"game"` | Distinguishes from session tokens. |
| `aud` | `"chromamatch-game"` | Audience. |
| `sub` | string | `user_id` the game was issued to. |
| `mode` | `"global" \| "daily" \| "room"` | |
| `cid` | number | Daily only: `daily_challenge_id`. |
| `cdate` | string | Daily only: challenge date (UTC) — informational. |
| `rid` | number | Room only: `room_id`. |
| `tmr` | number \| null | Room only: timer seconds (`null` = no timer). |
| `rounds` | array of 3 | In **play order**: `{ n, h, s, v }`. `n` = color number 1–3 for Daily/Room; omitted for Global. |
| `jti` | string (UUID) | Unique id for logging/optional replay defence. |
| `iat` / `exp` | numbers | Issued-at; expiry = `iat + GAME_TOKEN_TTL_SECONDS`. |

Signed with HS256 using `GAME_TOKEN_SECRET` (a different secret from the session secret).

#### 5.6.2 Issuing (start of a game) — by mode
- **Global:** generate 3 random colors (`generateRandomColors`). No shuffle needed.
- **Daily:** `dailyChallengeService.getOrCreateToday(now)` returns the challenge id and its 3 colors; apply `randomPermutation(3)` to produce the play order; `n` records each color's number.
- **Room:** verify the caller is an **active** member of an **`in_progress`** room with `attempts_used < attempts_limit`; load the room's 3 colors; shuffle; set `rid` and `tmr`. (Attempts are consumed at **submit**, not at start, because abandoned games are discarded.)

#### 5.6.3 Verifying (submission)
1. Verify signature, `typ`, `aud`, `exp`.
2. `sub` MUST equal the session's `userId` → else 400 `TOKEN_USER_MISMATCH`.
3. Validate the `rounds` array has exactly 3 entries.
4. Elapsed-time sanity check: `now − iat ≥ GAME_MIN_ELAPSED_SECONDS` else 400 `SUBMISSION_TOO_FAST` (a game cannot be completed faster than three 5-second reveals). An upper bound for timed rooms is an optional hardening (default off, §6).
5. Everything about the targets comes **only** from the token. The request body supplies guesses only. `color_number` stored in MongoDB comes from the token, never from the client.

#### 5.6.4 What the client receives at start
`rounds` in play order **without** `n` (not needed by the UI), the opaque `gameToken`, `revealMs`, `timerSeconds`, and mode context (`challengeDate`, `roomCode`). The client MAY decode the token (it is not encrypted) but cannot modify it.

