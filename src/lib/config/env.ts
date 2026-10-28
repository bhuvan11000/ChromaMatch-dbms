import { z } from "zod";

/**
 * Validated environment configuration — Architecture §5.3.2.
 *
 * All environment reads in the application go through this module. The
 * configuration is parsed lazily and memoized so that builds and unit tests do
 * not require real secrets; the first `getEnv()` call fails fast when a
 * required variable is missing or invalid.
 */

const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const nodeEnvSchema = z.enum(["development", "test", "production"]);

/** Variables with no default that must be present and non-empty. */
export const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "MONGODB_URI",
  "SESSION_JWT_SECRET",
  "GAME_TOKEN_SECRET",
  "DAILY_SEED_SECRET",
  "APP_ORIGIN",
  "NODE_ENV",
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

function isAppOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL must not be empty"),
    DATABASE_URL_DIRECT: z.string().min(1, "DATABASE_URL_DIRECT must not be empty"),
    MONGODB_URI: z.string().min(1, "MONGODB_URI must not be empty"),
    MONGODB_DB_NAME: z.string().min(1, "MONGODB_DB_NAME must not be empty").default("chromamatch"),
    SESSION_JWT_SECRET: z
      .string()
      .min(32, "SESSION_JWT_SECRET must be at least 32 characters long"),
    GAME_TOKEN_SECRET: z.string().min(32, "GAME_TOKEN_SECRET must be at least 32 characters long"),
    DAILY_SEED_SECRET: z.string().min(1, "DAILY_SEED_SECRET must not be empty"),
    APP_ORIGIN: z
      .string()
      .trim()
      .min(1, "APP_ORIGIN must not be empty")
      .refine(isAppOrigin, "APP_ORIGIN must be a bare http(s) origin, e.g. https://example.com")
      .transform((value) => new URL(value).origin),
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: logLevelSchema.default("info"),
  })
  .superRefine((value, ctx) => {
    if (value.SESSION_JWT_SECRET === value.GAME_TOKEN_SECRET) {
      ctx.addIssue({
        code: "custom",
        message: "SESSION_JWT_SECRET and GAME_TOKEN_SECRET must differ",
        path: ["GAME_TOKEN_SECRET"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
export type LogLevel = Env["LOG_LEVEL"];
export type NodeEnv = Env["NODE_ENV"];

/** Error thrown when the environment is incomplete or invalid. Lists every problem found. */
export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Pure environment parser. Exported for tests; application code should use
 * `getEnv()` so the result is parsed once per process.
 */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const missing = REQUIRED_ENV_KEYS.filter((key) => {
    const value = source[key];
    return value === undefined || value.trim() === "";
  });

  const issues: string[] = missing.map((key) => `${key} is missing`);

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    for (const issue of formatZodIssues(parsed.error)) {
      // Avoid duplicating "required" issues that the pre-check already reported.
      if (missing.some((key) => issue.startsWith(`${key}:`))) continue;
      issues.push(issue);
    }
  }

  if (!parsed.success || issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  return parsed.data;
}

let cachedEnv: Env | undefined;

/** Returns the validated environment, parsing it on first use. */
export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

/** Clears the memoized environment. Test-only helper. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
