import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// drizzle-kit only reads process.env. Mirror Next.js by loading .env.local
// (without overriding values already supplied by the shell/CI).
if (!process.env.DATABASE_URL_DIRECT && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/pg/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? "",
  },
  strict: true,
  verbose: true,
});
