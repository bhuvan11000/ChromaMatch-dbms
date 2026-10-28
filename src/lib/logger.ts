import { getEnv, type LogLevel } from "@/lib/config/env";

export type { LogLevel } from "@/lib/config/env";

/**
 * Minimal structured logger — Architecture §5.13.5.
 *
 * Every entry is one JSON line with `ts`, `level`, `msg` and optional fields.
 * Sensitive keys (passwords, tokens, cookies, request bodies, secrets, hashes)
 * are redacted recursively. Callers must still never pass full request bodies
 * or credentials explicitly.
 */

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|cookie|authorization|body|hash)/i;

export type LogFields = Record<string, unknown>;

/** Receives a complete JSON line without the trailing newline. */
export type LogSink = (line: string) => void;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: LogSink;
  base?: LogFields;
  now?: () => Date;
}

function serialize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => serialize(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : serialize(item, seen);
  }
  return result;
}

function defaultSink(line: string): void {
  process.stdout.write(`${line}\n`);
}

function resolveDefaultLevel(): LogLevel {
  try {
    return getEnv().LOG_LEVEL;
  } catch {
    // Logging must never crash the application because configuration is absent.
    return "info";
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());
  const configuredLevel = options.level;

  const build = (baseFields: LogFields): Logger => {
    const write = (level: LogLevel, msg: string, fields?: LogFields): void => {
      const threshold = LEVEL_RANK[configuredLevel ?? resolveDefaultLevel()];
      if (LEVEL_RANK[level] < threshold) return;

      const serialized = serialize({ ...baseFields, ...fields }) as Record<string, unknown>;
      const entry = {
        ...serialized,
        ts: now().toISOString(),
        level,
        msg,
      };
      sink(JSON.stringify(entry));
    };

    return {
      debug: (msg, fields) => write("debug", msg, fields),
      info: (msg, fields) => write("info", msg, fields),
      warn: (msg, fields) => write("warn", msg, fields),
      error: (msg, fields) => write("error", msg, fields),
      child: (fields) => build({ ...baseFields, ...fields }),
    };
  };

  return build(options.base ?? {});
}

/** Root logger; reads LOG_LEVEL lazily on first write. */
export const logger: Logger = createLogger();
