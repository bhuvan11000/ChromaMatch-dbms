import { describe, expect, it } from "vitest";

import { mapPgError, isRoomCodeConflict } from "@/lib/db/pg/errors";
import { AppError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const silentLogger = createLogger({ level: "error", sink: () => {} });

function pgError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error("database error"), fields);
}

describe("mapPgError", () => {
  it("returns existing AppErrors unchanged", () => {
    const original = new AppError("FORBIDDEN");

    expect(mapPgError(original, silentLogger)).toBe(original);
  });

  it("maps CM000 messages that are known error codes", () => {
    const error = mapPgError(pgError({ code: "CM000", message: "ROOM_FULL" }), silentLogger);

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("ROOM_FULL");
    expect(error.status).toBe(409);
  });

  it("maps unknown CM000 messages to INTERNAL_ERROR", () => {
    const error = mapPgError(pgError({ code: "CM000", message: "NOT_A_REAL_CODE" }), silentLogger);

    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
  });

  it("unwraps DrizzleQueryError causes", () => {
    const cause = pgError({ code: "CM000", message: "USER_NOT_FOUND" });
    const wrapped = Object.assign(new Error("Failed query"), { cause });

    const error = mapPgError(wrapped, silentLogger);

    expect(error.code).toBe("USER_NOT_FOUND");
    expect(error.status).toBe(404);
  });

  it("maps username unique violations, including the lower-case index", () => {
    const username = mapPgError(
      pgError({ code: "23505", constraint_name: "users_username_key" }),
      silentLogger,
    );
    const usernameLower = mapPgError(
      pgError({ code: "23505", constraint_name: "users_username_lower_key" }),
      silentLogger,
    );

    expect(username.code).toBe("USERNAME_TAKEN");
    expect(usernameLower.code).toBe("USERNAME_TAKEN");
  });

  it("maps email unique violations", () => {
    const error = mapPgError(
      pgError({ code: "23505", constraint_name: "users_email_key" }),
      silentLogger,
    );

    expect(error.code).toBe("EMAIL_TAKEN");
  });

  it("flags room-code conflicts for the createRoom retry", () => {
    const error = pgError({ code: "23505", constraint_name: "rooms_room_code_key" });

    expect(isRoomCodeConflict(error)).toBe(true);
    expect(mapPgError(error, silentLogger).code).toBe("INTERNAL_ERROR");
  });

  it("maps check violations to VALIDATION_ERROR", () => {
    const error = mapPgError(pgError({ code: "23514" }), silentLogger);

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.status).toBe(400);
  });

  it("maps connection failures to SERVICE_UNAVAILABLE", () => {
    for (const code of ["ECONNREFUSED", "CONNECT_TIMEOUT", "08006", "57P03", "53300"]) {
      expect(mapPgError(pgError({ code }), silentLogger).code).toBe("SERVICE_UNAVAILABLE");
    }
  });

  it("maps unexpected failures to INTERNAL_ERROR", () => {
    expect(mapPgError(pgError({ code: "XX000" }), silentLogger).code).toBe("INTERNAL_ERROR");
    expect(mapPgError("not an error object", silentLogger).code).toBe("INTERNAL_ERROR");
    expect(
      mapPgError(pgError({ code: "23505", constraint_name: "some_other_key" }), silentLogger).code,
    ).toBe("INTERNAL_ERROR");
  });
});
