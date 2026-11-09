import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/db/pg/client", () => ({
  getDb: () => ({ execute: mocks.execute }),
}));

import { RoomCodeConflictError, createRoom } from "@/lib/db/pg/functions";
import { isAppError } from "@/lib/errors";

const INPUT = {
  creatorId: 7,
  roomCode: "ABCD2345",
  roomSize: 4,
  timerSeconds: null,
  attemptsLimit: 3,
} as const;

function pgError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error(String(fields.message ?? "pg error")), fields);
}

beforeEach(() => {
  mocks.execute.mockReset();
});

describe("createRoom wrapper", () => {
  it("returns the parsed jsonb result", async () => {
    mocks.execute.mockResolvedValue([{ result: { room_id: 5, room_code: "ABCD2345" } }]);

    await expect(createRoom(INPUT)).resolves.toEqual({ room_id: 5, room_code: "ABCD2345" });
  });

  it("rethrows a detectable RoomCodeConflictError for a duplicate code", async () => {
    mocks.execute.mockRejectedValue(
      pgError({ code: "23505", constraint_name: "rooms_room_code_key" }),
    );

    await expect(createRoom(INPUT)).rejects.toBeInstanceOf(RoomCodeConflictError);
  });

  it("detects the conflict through a Drizzle-style wrapped cause", async () => {
    const wrapped = Object.assign(new Error("Failed query"), {
      cause: pgError({ code: "23505", constraint_name: "rooms_room_code_key" }),
    });
    mocks.execute.mockRejectedValue(wrapped);

    await expect(createRoom(INPUT)).rejects.toBeInstanceOf(RoomCodeConflictError);
  });

  it("still maps domain errors through mapPgError", async () => {
    mocks.execute.mockRejectedValue(pgError({ code: "CM000", message: "VALIDATION_ERROR" }));

    const error = await createRoom(INPUT).catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("does not treat other unique violations as a room-code conflict", async () => {
    mocks.execute.mockRejectedValue(pgError({ code: "23505", constraint_name: "users_email_key" }));

    const error = await createRoom(INPUT).catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(RoomCodeConflictError);
    expect(error).toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("maps connection failures to SERVICE_UNAVAILABLE", async () => {
    mocks.execute.mockRejectedValue(pgError({ code: "ECONNREFUSED" }));

    await expect(createRoom(INPUT)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
