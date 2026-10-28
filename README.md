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

## Documentation

- [`docs/ChromaMatch_Game_Design.md`](docs/ChromaMatch_Game_Design.md) — game rules and modes.
- [`docs/ChromaMatch_Database_Design.md`](docs/ChromaMatch_Database_Design.md) — relational and document schemas.
- [`docs/ChromaMatch_Architecture.md`](docs/ChromaMatch_Architecture.md) — implementation contract.
- [`AGENTS.md`](AGENTS.md) — agent rules and fast-path conventions.
