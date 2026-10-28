/**
 * Application error catalog — Architecture §8.1 and §5.13.1.
 *
 * `AppError` is the only error type thrown on purpose. Its HTTP status comes
 * from `ERROR_STATUS`; `withHandler` turns it into the standard error envelope.
 */

/** HTTP status for every error code in Architecture §8.1. */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  INVALID_DATE: 400,
  TOKEN_INVALID: 400,
  TOKEN_EXPIRED: 400,
  TOKEN_USER_MISMATCH: 400,
  SUBMISSION_TOO_FAST: 400,
  INVALID_PATCH: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  BAD_ORIGIN: 403,
  NOT_ROOM_MEMBER: 403,
  NOT_ROOM_CREATOR: 403,
  USER_NOT_FOUND: 404,
  ROOM_NOT_FOUND: 404,
  USERNAME_TAKEN: 409,
  EMAIL_TAKEN: 409,
  ROOM_NOT_LOBBY: 409,
  ROOM_FULL: 409,
  NOT_ENOUGH_PLAYERS: 409,
  ROOM_NOT_IN_PROGRESS: 409,
  MEMBER_NOT_ACTIVE: 409,
  ATTEMPTS_EXHAUSTED: 409,
  CANNOT_BAN_ADMIN: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Default human-readable messages used when an AppError omits a message. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: "The request is invalid.",
  INVALID_DATE: "The date is invalid.",
  TOKEN_INVALID: "The game token is invalid.",
  TOKEN_EXPIRED: "The game token has expired.",
  TOKEN_USER_MISMATCH: "The game token belongs to a different user.",
  SUBMISSION_TOO_FAST: "The game was submitted too quickly.",
  INVALID_PATCH: "The stats patch contains disallowed fields.",
  UNAUTHENTICATED: "Authentication is required.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  FORBIDDEN: "You do not have permission to do that.",
  BAD_ORIGIN: "The request origin is not allowed.",
  NOT_ROOM_MEMBER: "You are not a member of this room.",
  NOT_ROOM_CREATOR: "Only the room creator can do that.",
  USER_NOT_FOUND: "User not found.",
  ROOM_NOT_FOUND: "Room not found.",
  USERNAME_TAKEN: "That username is already taken.",
  EMAIL_TAKEN: "That email is already registered.",
  ROOM_NOT_LOBBY: "This room is not in the lobby.",
  ROOM_FULL: "This room is full.",
  NOT_ENOUGH_PLAYERS: "A room needs at least two players.",
  ROOM_NOT_IN_PROGRESS: "This room is not in progress.",
  MEMBER_NOT_ACTIVE: "You are no longer active in this room.",
  ATTEMPTS_EXHAUSTED: "You have no attempts remaining.",
  CANNOT_BAN_ADMIN: "Administrators cannot be banned.",
  RATE_LIMITED: "Too many requests. Please try again later.",
  INTERNAL_ERROR: "Something went wrong.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
