import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "@/lib/config/env";

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  DATABASE_URL_DIRECT: "postgresql://chromamatch:chromamatch@localhost:5432/chromamatch",
  MONGODB_URI: "mongodb://localhost:27017",
  SESSION_JWT_SECRET: "s".repeat(32),
  GAME_TOKEN_SECRET: "g".repeat(32),
  DAILY_SEED_SECRET: "daily-seed-secret",
  APP_ORIGIN: "http://localhost:3000",
  NODE_ENV: "test",
};

function envError(source: Record<string, string | undefined>): EnvValidationError {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return error as EnvValidationError;
  }
  throw new Error("Expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("accepts a complete environment and applies defaults", () => {
    const env = parseEnv(BASE_ENV);

    expect(env.MONGODB_DB_NAME).toBe("chromamatch");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("test");
  });

  it("normalizes APP_ORIGIN to a bare origin", () => {
    expect(parseEnv({ ...BASE_ENV, APP_ORIGIN: "http://localhost:3000/" }).APP_ORIGIN).toBe(
      "http://localhost:3000",
    );
    expect(parseEnv({ ...BASE_ENV, APP_ORIGIN: "https://Example.COM:443/" }).APP_ORIGIN).toBe(
      "https://example.com",
    );
  });

  it("lists every missing variable in one error", () => {
    const incomplete = { ...BASE_ENV };
    delete incomplete.DATABASE_URL;
    delete incomplete.MONGODB_URI;
    delete incomplete.NODE_ENV;

    const error = envError(incomplete);
    expect(error.issues).toContain("DATABASE_URL is missing");
    expect(error.issues).toContain("MONGODB_URI is missing");
    expect(error.issues).toContain("NODE_ENV is missing");
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("MONGODB_URI");
  });

  it("rejects secrets shorter than 32 characters", () => {
    const error = envError({ ...BASE_ENV, SESSION_JWT_SECRET: "too-short" });
    expect(error.issues.some((issue) => issue.includes("at least 32"))).toBe(true);
  });

  it("rejects identical session and game-token secrets", () => {
    const shared = "x".repeat(32);
    const error = envError({
      ...BASE_ENV,
      SESSION_JWT_SECRET: shared,
      GAME_TOKEN_SECRET: shared,
    });
    expect(error.issues.some((issue) => issue.includes("must differ"))).toBe(true);
  });

  it.each([
    "localhost:3000",
    "ftp://example.com",
    "http://example.com/api",
    "http://example.com?query=1",
    "http://user:pass@example.com",
  ])("rejects APP_ORIGIN %s", (origin) => {
    const error = envError({ ...BASE_ENV, APP_ORIGIN: origin });
    expect(error.issues.some((issue) => issue.includes("APP_ORIGIN"))).toBe(true);
  });

  it("rejects an unknown NODE_ENV or LOG_LEVEL", () => {
    expect(envError({ ...BASE_ENV, NODE_ENV: "staging" }).issues).toHaveLength(1);

    const logLevelError = envError({ ...BASE_ENV, LOG_LEVEL: "verbose" });
    expect(logLevelError.issues.some((issue) => issue.includes("LOG_LEVEL"))).toBe(true);
  });

  it("ignores unrelated environment variables", () => {
    expect(() => parseEnv({ ...BASE_ENV, UNRELATED_VARIABLE: "value" })).not.toThrow();
  });
});
