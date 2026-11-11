# Deployment

Production topology and release procedure for ChromaMatch, following
Architecture §4.3, §5.3.2, §5.15.2 and §5.15.3.

The application is a single Next.js deployment on Vercel using the Node.js
runtime. PostgreSQL is a Supabase project, MongoDB is an Atlas M0 cluster, and
all secrets live in Vercel environment variables. The browser never connects to
either database.

## 1. Prerequisites

- Node.js 22.18 or newer and npm 10 or newer.
- A Vercel account and project connected to this repository.
- A Supabase project on PostgreSQL 16.
- An Atlas M0 cluster (MongoDB 7).
- Optional: the Vercel CLI (`npm i -g vercel`) if you deploy from a terminal.

Never commit `.env`, `.env.local`, `.env.production`, or any other `.env*` file.
Only `.env.example` is tracked.

## 2. Choose one region and stay in it

Latency is dominated by the distance between the Vercel function and Supabase.
Pick one region and put Vercel, Supabase and Atlas as close together as the
free tiers allow.

| If your data is in | Vercel function region | Supabase region | Atlas region |
| --- | --- | --- | --- |
| US East (default) | `iad1` | `us-east-1` | AWS `US_EAST_1` |
| India | `bom1` | `ap-south-1` | AWS `AP_SOUTH_1` (check M0 availability) |
| Europe | `fra1` | `eu-central-1` | AWS `EU_CENTRAL_1` |

Vercel Functions default to `iad1` (Washington, D.C.). The Hobby plan allows
one function region; Pro allows multiple. Set it in **Project → Settings →
Functions → Function Regions** or with `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"]
}
```

Do not commit a region you have not chosen for the actual databases. Static
pages and assets are still served from Vercel's CDN; only API and dynamic page
execution happens in the chosen function region. Atlas M0 is limited to a
subset of regions, so pick the nearest available one rather than forcing an
exact match.

Free-tier caveats:

- Supabase free projects can be paused after inactivity. Wake the project
  before a demo or smoke test.
- Atlas M0 has a small storage limit and can also be paused.

## 3. Supabase: pooler versus direct connection

Open the Supabase project, then **Connect**. Use the strings exactly as shown;
the pooler host index (`aws-0-…`, `aws-1-…`) is not the region name and cannot
be derived safely.

| Purpose | Supabase mode | Port | Username | Variable |
| --- | --- | --- | --- | --- |
| App requests | Shared pooler, transaction mode | `6543` | `postgres.<project-ref>` | `DATABASE_URL` |
| Migrations/seeds | Direct connection, or shared pooler session mode | `5432` | `postgres` or `postgres.<project-ref>` | `DATABASE_URL_DIRECT` |

Example transaction-pooler string:

```text
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require
```

Example session-pooler string (IPv4-compatible):

```text
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

Example direct string (IPv6 unless the project has the IPv4 add-on):

```text
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

Rules:

- `DATABASE_URL` must be the **transaction pooler** string. `src/lib/db/pg/client.ts`
  already sets `prepare: false`, which the transaction pooler requires.
- `DATABASE_URL_DIRECT` must not be the transaction pooler. `drizzle-kit` and
  the seed scripts need a direct/session connection for migrations and
  session-level behaviour.
- If your machine or CI has no IPv6 route, use the **session pooler** string for
  `DATABASE_URL_DIRECT`. The direct endpoint is IPv6-only on the free plan.
- Percent-encode reserved characters in the password (`@`, `:`, `/`, `?`, `#`,
  `&`, spaces).
- Append `sslmode=require` if it is not already present. The app also forces
  `ssl: "require"` when `NODE_ENV=production`.
- Never run migrations through the transaction pooler.

## 4. Atlas: cluster, user and network access

1. Create an M0 cluster in the region chosen above.
2. Create a database user with `readWrite` on the `chromamatch` database. Use a
   generated password and store it in a password manager.
3. Open **Network Access**:
   - Vercel Functions use dynamic egress IP addresses. On the free plan, add
     `0.0.0.0/0` (allow from anywhere) and rely on a strong database password.
     This is the accepted course-project trade-off.
   - If you have Vercel Secure Compute static IPs, allow only those instead.
   - Add your own IP while running `mongo:init` locally, then remove it if you
     do not need it.
4. Copy the driver connection string:

```text
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
```

Percent-encode the password. The database name is set separately with
`MONGODB_DB_NAME`, not in the path of the URI. The driver uses TLS by default
for `mongodb+srv://`.

`npm run mongo:init` is idempotent: it creates the `game_history` collection on
the first run, updates the JSON Schema validator with `collMod` afterwards, and
creates the four indexes. It never drops existing documents.

## 5. Environment variables for Vercel

Add these to **Project → Settings → Environment Variables** for the Production
environment. Mark every secret as sensitive. `NODE_ENV` is supplied by Vercel;
do not add or override it.

| Variable | Required | Used by | Value / notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | Next.js runtime | Supabase transaction pooler, port `6543`, with `?pgbouncer=true&sslmode=require`. |
| `DATABASE_URL_DIRECT` | yes | `drizzle-kit`, seeds, startup validation | Direct or session-pooler string, port `5432`, with `?sslmode=require`. The request path never opens it, but `getEnv()` validates every §5.3.2 variable at Node startup, so it must be present in Vercel too. |
| `MONGODB_URI` | yes | Next.js runtime, `mongo:init` | Atlas SRV string. Percent-encode the password. |
| `MONGODB_DB_NAME` | yes | Next.js runtime, `mongo:init` | `chromamatch`. Defaults to `chromamatch` if omitted, but set it explicitly. |
| `SESSION_JWT_SECRET` | yes | Session cookies | At least 32 characters (48 random bytes recommended). Must differ from `GAME_TOKEN_SECRET`. |
| `GAME_TOKEN_SECRET` | yes | Game tokens | At least 32 characters (48 random bytes recommended). Must differ from `SESSION_JWT_SECRET`. |
| `DAILY_SEED_SECRET` | yes | Daily colour generation | A long random value. Changing it only affects days that have not been created yet. |
| `APP_ORIGIN` | yes | Origin/CSRF check | The exact browser origin, e.g. `https://chromamatch.vercel.app`. No trailing slash, path, query or credentials. |
| `NODE_ENV` | yes | Everywhere | `production`. Vercel sets this automatically; do not add it manually. |
| `LOG_LEVEL` | no | Structured logs | `debug`, `info` (default), `warn` or `error`. |

Generate three independent secrets. Base64 is safe in the Vercel UI; use single
quotes in a shell so `+`, `/` and `=` are not interpreted:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
```

If you prefer URL-safe characters, `openssl rand -hex 32` also satisfies the
32-character minimum. Never reuse the session and game secrets; the environment
schema rejects them when they are equal.

### Preview deployments

`APP_ORIGIN` is exact, so every preview URL needs a matching value. Either:

- deploy only Production from `main`, or
- assign a stable preview alias and set `APP_ORIGIN` to that alias, or
- set a per-deployment `APP_ORIGIN` (more maintenance).

A preview whose origin does not match `APP_ORIGIN` will fail every mutation with
`BAD_ORIGIN`, even though pages render.

### Build-time versus runtime

The production build does not need database credentials or secrets. The
environment is parsed lazily, and `src/instrumentation.ts` skips validation
during `phase-production-build`. Vercel will build successfully even if the
database variables are missing at build time; they are only read when the Node
server starts. Missing or invalid variables fail the first server start with
`EnvValidationError`, which lists every problem.

## 6. Vercel project configuration

- Framework preset: **Next.js** (auto-detected).
- Node.js version: 22.x (the repository requires `>=22.18.0`).
- Install command: `npm ci`.
- Build command: `npm run build`.
- Output: Next.js default (no `output: "standalone"` needed).
- Function region: the region chosen in §2.
- Environment variables: set for Production. Repeat for Preview only if you
  use preview deployments with a matching `APP_ORIGIN`.

Changing an environment variable only affects new deployments; redeploy after
editing one.

## 7. Release order

Architecture §5.15.3 requires migrations to reach the target database **before**
code that depends on them is deployed.

Run these commands from the repository root on a trusted machine. They read
production connection strings from the shell; do not put them in a committed
file.

```bash
export NODE_ENV=production
export DATABASE_URL_DIRECT='postgresql://...:5432/postgres?sslmode=require'
export MONGODB_URI='mongodb+srv://...'
export MONGODB_DB_NAME=chromamatch

npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run db:migrate
npm run mongo:init
npm run db:seed
```

What each step does:

The first five commands are the CI-equivalent preflight. The last three touch
production:

1. `npm run db:migrate` applies every migration in `drizzle/` in order through
   `DATABASE_URL_DIRECT`. Never edit an applied migration; add a new one with
   `npm run db:custom -- --name=<name>`.
2. `npm run mongo:init` creates or updates the `game_history` validator and
   indexes. Re-run it whenever the document shape or indexes change.
3. `npm run db:seed` upserts the achievement definitions by name. It is safe to
   re-run and preserves existing `user_achievements`.
4. Deploy the application:
   - Git-connected project: merge to `main` and let Vercel build, or
   - CLI: `vercel --prod` (requires your Vercel login).

Do not run `db:generate` against production. It generates migration files from
the schema; it does not apply them. Do not run two migrations concurrently.

Quick database checks (optional, if the clients are installed):

```bash
psql "$DATABASE_URL_DIRECT" -c "select count(*) from information_schema.tables where table_schema = 'public';"
mongosh "$MONGODB_URI" --eval 'db.getSiblingDB("chromamatch").game_history.getIndexes()'
```

## 8. First administrator

There is no public endpoint that grants the admin role. Promote an existing
account after it has registered:

```bash
export NODE_ENV=production
export DATABASE_URL_DIRECT='postgresql://...:5432/postgres?sslmode=require'
npm run db:seed-admin -- admin@example.com
```

The account must already exist. The script promotes by case-insensitive email
and prints the promoted username. Sign in again (or refresh) so the UI re-reads
the role; `requireAdmin` always re-checks PostgreSQL, so the session claim alone
never grants access.

## 9. Smoke-test checklist

Run this after the first Production deployment and after any release that
changes the database, auth, game or room flow.

### Infrastructure

- [ ] `curl -i https://<app>/api/health` returns `200` and
      `{"postgres":"ok","mongo":"ok"}`.
- [ ] The page loads over HTTPS and the browser console has no CSP errors.
- [ ] `curl -sI https://<app>/` includes `content-security-policy`,
      `x-content-type-options: nosniff`, `referrer-policy` and
      `x-frame-options: DENY`.
- [ ] Vercel logs show no `EnvValidationError` at startup.

### Auth

- [ ] Register a new account; the `cm_session` cookie is `HttpOnly`, `Secure`
      and `SameSite=Lax`.
- [ ] Log out and sign back in.
- [ ] Visit `/home` while signed out; the middleware redirects to `/login`.
- [ ] `POST /api/auth/login` without an `Origin` header is rejected with
      `BAD_ORIGIN`.

### Global game

- [ ] Start a Global game, complete all three rounds, and use the per-round
      score preview.
- [ ] Submit the game; the result shows the server score and the replay /
      leaderboard actions.
- [ ] The score appears on `/leaderboard/global` and the viewer row is
      highlighted.
- [ ] `/profile` shows the game in history and the counters increase.
- [ ] The first game awards the expected achievement.

### Daily game

- [ ] `/api/daily/today` returns today's colours and the reset countdown.
- [ ] Complete a Daily game; the score appears on `/leaderboard/daily` for
      today's UTC date.
- [ ] The Daily streak updates and survives a reload.

### Rooms

- [ ] Create a room in one browser and join it from a second isolated browser.
- [ ] Start the room, play one attempt in each browser, and confirm both
      players appear on the live room scoreboard.
- [ ] Confirm the room attempt does not change Global/Daily stats or
      achievements.
- [ ] Leave/cancel a lobby room and confirm the state is consistent.

### Leaderboards and admin

- [ ] Paginate both leaderboards and change the Daily date.
- [ ] Sign in as the promoted admin, open `/admin`, search for a user, edit
      stats, then ban and unban the user.
- [ ] Confirm a non-admin is redirected away from `/admin`.

### MongoDB history

- [ ] A submitted Global/Daily game creates a `game_history` document.
- [ ] `/api/me/history` returns newest first and pages with the cursor.
- [ ] If Mongo is temporarily unavailable, Postgres-backed stats still render
      and `historyAvailable` is `false`; a submit must still succeed.

## 10. Runtime guarantees

All API route handlers opt into the Node runtime and dynamic rendering:

```bash
rg --files-without-match 'export const runtime = "nodejs"' src/app/api -g 'route.ts'
rg --files-without-match 'export const dynamic = "force-dynamic"' src/app/api -g 'route.ts'
```

Both commands should print nothing. Next.js 16 already defaults routes to Node
and deprecates the Edge runtime; the explicit exports keep the requirement
visible and guarded by `tests/unit/deployment.test.ts`.

`src/middleware.ts` only verifies the session cookie signature. It imports
`next/server`, `jose`, Zod and local session/env modules; it has no dependency
on `@node-rs/argon2`, `postgres`, `mongodb`, `drizzle-orm` or `node:*`. Next.js
16 runs middleware/proxy on Node by default and does not allow a `runtime`
export in that file. The deprecation warning (`middleware` renamed to `proxy`)
is expected and kept because the Architecture §5.1 tree names `middleware.ts`.

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Server starts, every request 500s, logs show `EnvValidationError` | A required §5.3.2 variable is missing or malformed in Vercel | Add the variable, check `SESSION_JWT_SECRET`/`GAME_TOKEN_SECRET` differ, redeploy. |
| `BAD_ORIGIN` on every mutation | `APP_ORIGIN` does not exactly match the browser origin, or a preview URL is being used | Set the bare origin with no trailing slash; use a stable preview alias or per-preview value. |
| Postgres error mentioning prepared statements | The app is pointed at the transaction pooler with prepared statements enabled, or migrations are using the pooler | Keep `DATABASE_URL` on `:6543` with `prepare: false`; use the direct/session string for `DATABASE_URL_DIRECT`. |
| `ECONNREFUSED` / connection timeout to Supabase | Project paused, wrong host/region, IPv6-only direct endpoint, or a bad password encoding | Wake the project; use the session pooler for IPv4; re-copy the Connect string and percent-encode the password. |
| `db:migrate` fails with an SSL error | `sslmode=require` missing, or `NODE_ENV` is not `production` | Append `?sslmode=require` and run with `NODE_ENV=production`. |
| Atlas `MongoServerSelectionError` | Vercel egress IP not allowlisted, cluster paused, or password not URL-encoded | Allow `0.0.0.0/0` (or the static egress IPs), wake the cluster, re-copy the URI. |
| `mongo:init` works locally but not from CI | CI runner IP not in the Atlas access list | Add the runner IP or run the init from an allowed network. |
| Build succeeds but runtime fails immediately | Variables were added to the wrong Vercel environment (for example Preview instead of Production), or only to the local shell | Add them to the Production environment and redeploy. |
| High API latency | Function region far from Supabase/Atlas | Colocate all three as in §2; redeploy after changing the function region. |
| Cookie is not stored | Testing over plain HTTP in production, or `APP_ORIGIN` mismatch | Use HTTPS; cookies are `Secure` when `NODE_ENV=production`. |
| Admin link missing after promotion | The page cached the old session/role | Sign out and back in; admin routes re-read the role from Postgres. |
| Supabase/Atlas paused before a demo | Free-tier inactivity | Open the Supabase and Atlas dashboards and wake both before the demo. |

## 12. Rollback

- Application: promote the previous Vercel deployment.
- PostgreSQL: migrations are forward-only in this project. If a release must be
  undone, write a new corrective migration; never edit or delete an applied
  migration.
- MongoDB: `mongo:init` only adds/updates the validator and indexes. It does not
  delete history; restore from an Atlas backup only if one is available on the
  plan.
