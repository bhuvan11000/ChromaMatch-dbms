import { existsSync } from "node:fs";

// Next.js loads .env.local automatically; Vitest does not. Load it only when
// the integration environment has not already been provided by the shell/CI.
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
