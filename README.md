# ChromaMatch

A color-matching game built with Next.js, PostgreSQL, and MongoDB.

## Prerequisites

- Node.js 22.18 or newer (Node 24 LTS also works)
- npm 10 or newer
- Docker and Docker Compose for local PostgreSQL and MongoDB

## Local setup

Start the local PostgreSQL 16 and MongoDB 7 containers:

```bash
docker compose up -d
```

Create your local environment file from the documented defaults:

```bash
cp .env.example .env.local
```

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Check dependency connectivity at
<http://localhost:3000/api/health>.

Never commit `.env`, `.env.local`, or any other `.env*` file. Only
`.env.example` is tracked.

## Scripts

| Script            | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `dev`             | Start the Next.js development server                          |
| `build` / `start` | Production build / run                                        |
| `lint`            | Run ESLint                                                    |
| `typecheck`       | Run `tsc --noEmit`                                            |
| `format`          | Format the repository with Prettier                           |
| `test`            | Run unit tests (Vitest)                                       |
| `test:unit`       | Run unit tests only                                           |
| `test:int`        | Run integration tests                                         |
| `test:e2e`        | Run Playwright end-to-end tests                               |
| `db:generate`     | Generate a Drizzle migration from the schema                  |
| `db:custom`       | Create an empty custom migration: `npm run db:custom -- name` |
| `db:migrate`      | Apply migrations using `DATABASE_URL_DIRECT`                  |
| `db:seed`         | Seed achievement definitions                                  |
| `db:seed-admin`   | Promote an email to admin                                     |
| `mongo:init`      | Create the Mongo collection, validator, and indexes           |

## End-to-end tests

Playwright covers the two Architecture §5.14 happy paths: registering through
the UI, playing a full Global game and finding the score on the Global board,
plus a room created, joined and played from two isolated browser contexts.
The sweep helpers read the targets from the real `/api/games/start` response
so every guess is deliberate.

Local runs need the Docker databases with migrations, `mongo:init` and seeds
applied. Install Chromium once, then run the suite:

```bash
npx playwright install chromium
npm run test:e2e
```

The suite starts (or reuses) a development server, requires the local `.env.local`
values (including `APP_ORIGIN=http://localhost:3000`), and writes reports to
the system temp directory so Next's file watcher does not reload the page
mid-test. GitHub Actions runs the main CI job without browsers; the manual
**E2E** workflow runs `npm run test:e2e` against fresh Postgres and Mongo
service containers.

## Documentation

- [`docs/ChromaMatch_Game_Design.md`](docs/ChromaMatch_Game_Design.md) — game rules and modes.
- [`docs/ChromaMatch_Database_Design.md`](docs/ChromaMatch_Database_Design.md) — relational and document schemas.
- [`docs/ChromaMatch_Architecture.md`](docs/ChromaMatch_Architecture.md) — implementation contract.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + Supabase + Atlas release steps and smoke tests.
- [`AGENTS.md`](AGENTS.md) — agent rules and fast-path conventions.

## Security

What is protected:

- Passwords are hashed with argon2id; plaintext passwords and password hashes are never returned or logged.
- Session cookies (`cm_session`) and game tokens are HS256 JWTs signed with **different** secrets from the environment. The session cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, and its role claim is only a hint: admin routes re-read the role from PostgreSQL.
- Every mutating API request requires `Content-Type: application/json` and a matching `Origin`/`Referer`; login and registration also use an in-process rate limiter.
- Request bodies and queries are validated with strict Zod schemas. Scoring and game targets are server-authoritative, SQL is parameterized, and Mongo queries are built from typed values.
- Responses send a Content Security Policy plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a minimal `Permissions-Policy` (see `next.config.ts` and `src/lib/config/securityHeaders.ts`).
- Logs are structured JSON with request ids and sensitive-key redaction.

Known limitations (accepted for this project):

- **Targets are visible to the browser.** The colors must be sent to the client to be displayed, so they can be read from the network tab (Architecture §4.6). The server still controls what is scored and cannot be made to accept a client-supplied score or target.
- **Game-token replay is not prevented for Global/Daily** (Architecture §6). Replaying a valid token can inflate `total_games_played`, but personal bests and leaderboard scores are unaffected; room replays are bounded by `attempts_limit`.
- The login/register rate limiter is per serverless instance, not a shared global limit.
- Room `timedOut` flags are client-reported; the server only enforces the lower elapsed-time bound.
- The CSP keeps `'unsafe-inline'` for Next.js compatibility (no nonce-based strict CSP yet).
- Banned players may still log in and play by default; they are excluded from Global/Daily leaderboards.
