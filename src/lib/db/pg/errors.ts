import { AppError, ERROR_STATUS, isAppError, type ErrorCode } from "@/lib/errors";
import { logger, type Logger } from "@/lib/logger";

/**
 * PostgreSQL error mapping — Architecture §5.8.8.
 *
 * SQL functions and triggers raise SQLSTATE `CM000` with an §8.1 code as the
 * message. Unique/check/connection failures are mapped to the corresponding
 * application errors. Unexpected failures are logged with a sanitized stack and
 * returned as a generic `INTERNAL_ERROR`; database details never reach clients.
 */

interface PostgresErrorLike {
  code?: unknown;
  message?: unknown;
  constraint_name?: unknown;
  constraint?: unknown;
  detail?: unknown;
}

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "57P01",
  "57P02",
  "57P03",
  "53300",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Drizzle wraps driver errors in `DrizzleQueryError`; inspect the original error. */
function rootError(error: unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();

  while (typeof current === "object" && current !== null && "cause" in current) {
    const cause = (current as { cause?: unknown }).cause;
    if (cause === undefined || cause === null || typeof cause !== "object" || seen.has(cause)) {
      break;
    }
    seen.add(current);
    current = cause;
  }

  return current;
}

/** SQLSTATE or Node/libpq error code, if present. */
export function getPgErrorCode(error: unknown): string | null {
  const record = asRecord(rootError(error)) as PostgresErrorLike | null;
  if (!record || record.code === undefined || record.code === null) return null;
  return String(record.code);
}

/** Constraint name exposed by postgres.js on unique/check violations. */
export function getConstraintName(error: unknown): string | null {
  const record = asRecord(rootError(error)) as PostgresErrorLike | null;
  if (!record) return null;

  if (typeof record.constraint_name === "string") return record.constraint_name;
  if (typeof record.constraint === "string") return record.constraint;
  return null;
}

function getErrorMessage(error: unknown): string | null {
  const root = rootError(error);
  if (root instanceof Error) return root.message;
  const record = asRecord(root);
  return record && typeof record.message === "string" ? record.message : null;
}

/**
 * True for `23505` on `rooms_room_code_key`. `createRoom` must catch this and
 * retry with a fresh code before handing the failure to `mapPgError`.
 */
export function isRoomCodeConflict(error: unknown): boolean {
  return getPgErrorCode(error) === "23505" && getConstraintName(error) === "rooms_room_code_key";
}

function isConnectionError(code: string): boolean {
  return CONNECTION_ERROR_CODES.has(code) || code.startsWith("08");
}

function isKnownErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_STATUS, value);
}

function sanitizedErrorFields(error: unknown): Record<string, unknown> {
  const root = rootError(error);
  const record = asRecord(root);
  // DrizzleQueryError stores the full SQL and bound parameters; never log those.
  const isDrizzleQueryError =
    record !== null && typeof record.query === "string" && Array.isArray(record.params);

  return {
    errorName: root instanceof Error ? root.name : typeof root,
    errorMessage: isDrizzleQueryError ? undefined : (getErrorMessage(error) ?? undefined),
    code: getPgErrorCode(error) ?? undefined,
    constraint: getConstraintName(error) ?? undefined,
    stack: isDrizzleQueryError || !(root instanceof Error) ? undefined : root.stack,
  };
}

/**
 * Converts any database error into an `AppError`.
 *
 * The optional logger exists for tests; production callers use the root logger.
 */
export function mapPgError(error: unknown, log: Logger = logger): AppError {
  if (isAppError(error)) return error;

  const root = rootError(error);
  if (isAppError(root)) return root;

  const code = getPgErrorCode(error);
  const message = getErrorMessage(error)?.trim() ?? null;

  if (code === "CM000") {
    if (message !== null && isKnownErrorCode(message)) {
      return new AppError(message);
    }

    log.error("postgres_unknown_domain_error", sanitizedErrorFields(error));
    return new AppError("INTERNAL_ERROR");
  }

  if (code === "23505") {
    const constraint = getConstraintName(error);

    if (constraint === "users_username_key" || constraint === "users_username_lower_key") {
      return new AppError("USERNAME_TAKEN");
    }
    if (constraint === "users_email_key") {
      return new AppError("EMAIL_TAKEN");
    }
    if (constraint === "rooms_room_code_key") {
      // The service is expected to retry; reaching here means retries failed.
      log.error("postgres_room_code_conflict", sanitizedErrorFields(error));
      return new AppError("INTERNAL_ERROR");
    }
  }

  if (code === "23514") {
    return new AppError("VALIDATION_ERROR");
  }

  if (code !== null && isConnectionError(code)) {
    return new AppError("SERVICE_UNAVAILABLE");
  }

  log.error("postgres_unexpected_error", sanitizedErrorFields(error));
  return new AppError("INTERNAL_ERROR");
}
