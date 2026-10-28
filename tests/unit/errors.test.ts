import { describe, expect, it } from "vitest";

import { AppError, ERROR_MESSAGES, ERROR_STATUS, isAppError } from "@/lib/errors";

const EXPECTED_STATUS = {
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
} as const;

describe("error catalog (Architecture §8.1)", () => {
  it("maps every error code to the specified HTTP status", () => {
    expect(ERROR_STATUS).toEqual(EXPECTED_STATUS);
    expect(Object.keys(ERROR_STATUS)).toHaveLength(27);
  });

  it("has a non-empty default message for every code", () => {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      expect(code).toBeTruthy();
      expect(message.length).toBeGreaterThan(0);
    }
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual(Object.keys(ERROR_STATUS).sort());
  });
});

describe("AppError", () => {
  it("uses the catalog status and a default message", () => {
    const error = new AppError("ROOM_FULL");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("ROOM_FULL");
    expect(error.status).toBe(409);
    expect(error.message).toBe("This room is full.");
    expect(error.details).toBeUndefined();
  });

  it("keeps an explicit message and details", () => {
    const details = { issues: [{ path: "email", message: "Invalid email" }] };
    const error = new AppError("VALIDATION_ERROR", "Bad input.", details);

    expect(error.message).toBe("Bad input.");
    expect(error.details).toBe(details);
    expect(error.status).toBe(400);
  });

  it("is detectable with the type guard", () => {
    expect(isAppError(new AppError("FORBIDDEN"))).toBe(true);
    expect(isAppError(new Error("nope"))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});
