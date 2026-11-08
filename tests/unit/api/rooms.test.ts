import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  getRoomState: vi.fn(),
  startRoom: vi.fn(),
  leaveRoom: vi.fn(),
}));

vi.mock("@/lib/services/roomService", () => ({
  createRoom: mocks.createRoom,
  joinRoom: mocks.joinRoom,
  getRoomState: mocks.getRoomState,
  startRoom: mocks.startRoom,
  leaveRoom: mocks.leaveRoom,
}));

import { POST as createRoute } from "@/app/api/rooms/route";
import { POST as joinRoute } from "@/app/api/rooms/join/route";
import { GET as stateRoute } from "@/app/api/rooms/[code]/route";
import { POST as startRoute } from "@/app/api/rooms/[code]/start/route";
import { POST as leaveRoute } from "@/app/api/rooms/[code]/leave/route";
import { signSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

import {
  makeGetRequest,
  makeJsonRequest,
  resetAuthEnv,
  sessionCookieHeader,
  stubAuthEnv,
} from "../support/auth";

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

const STATE = { code: "ABCD2345", status: "lobby" };
const CREATE_BODY = { roomSize: 4, timerSeconds: 10, attemptsLimit: 3 };

function ctx(code = "ABCD2345") {
  return { params: Promise.resolve({ code }) };
}

async function cookie() {
  return sessionCookieHeader(await signSession({ userId: 7, role: "player" }));
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe("POST /api/rooms", () => {
  it("401 without a session, no service call", async () => {
    const response = await createRoute(
      makeJsonRequest("/api/rooms", "POST", CREATE_BODY),
      undefined,
    );

    expect(response.status).toBe(401);
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });

  it("201 with the state and one service call", async () => {
    mocks.createRoom.mockResolvedValue(STATE);

    const response = await createRoute(
      makeJsonRequest("/api/rooms", "POST", CREATE_BODY, await cookie()),
      undefined,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(STATE);
    expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    expect(mocks.createRoom).toHaveBeenCalledWith(7, CREATE_BODY);
  });

  it("400 for invalid options and unknown keys", async () => {
    for (const body of [
      { ...CREATE_BODY, roomSize: 11 },
      { ...CREATE_BODY, timerSeconds: 7 },
      { ...CREATE_BODY, attemptsLimit: 4 },
      { ...CREATE_BODY, creatorId: 1 },
    ]) {
      const response = await createRoute(
        makeJsonRequest("/api/rooms", "POST", body, await cookie()),
        undefined,
      );
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    }
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });

  it("rejects a bad Origin", async () => {
    const response = await createRoute(
      makeJsonRequest("/api/rooms", "POST", CREATE_BODY, {
        ...(await cookie()),
        origin: "https://evil.example",
      }),
      undefined,
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("BAD_ORIGIN");
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });
});

describe("POST /api/rooms/join", () => {
  it("normalizes the code via the schema and calls the service once", async () => {
    mocks.joinRoom.mockResolvedValue(STATE);

    const response = await joinRoute(
      makeJsonRequest("/api/rooms/join", "POST", { code: " abcd2345 " }, await cookie()),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(mocks.joinRoom).toHaveBeenCalledTimes(1);
    expect(mocks.joinRoom).toHaveBeenCalledWith(7, "ABCD2345");
  });

  it("maps 404/409 domain errors", async () => {
    for (const [code, status] of [
      ["ROOM_NOT_FOUND", 404],
      ["ROOM_NOT_LOBBY", 409],
      ["ROOM_FULL", 409],
    ] as const) {
      mocks.joinRoom.mockRejectedValueOnce(new AppError(code));
      const response = await joinRoute(
        makeJsonRequest("/api/rooms/join", "POST", { code: "ABCD2345" }, await cookie()),
        undefined,
      );
      expect(response.status).toBe(status);
      expect(await errorCode(response)).toBe(code);
    }
  });

  it("400 for malformed codes and 401 without session", async () => {
    const bad = await joinRoute(
      makeJsonRequest("/api/rooms/join", "POST", { code: "nope" }, await cookie()),
      undefined,
    );
    expect(bad.status).toBe(400);

    const anonymous = await joinRoute(
      makeJsonRequest("/api/rooms/join", "POST", { code: "ABCD2345" }),
      undefined,
    );
    expect(anonymous.status).toBe(401);
    expect(mocks.joinRoom).not.toHaveBeenCalled();
  });
});

describe("GET /api/rooms/[code]", () => {
  it("awaits the async params and passes the code to the service", async () => {
    mocks.getRoomState.mockResolvedValue(STATE);

    const response = await stateRoute(
      makeGetRequest("/api/rooms/ABCD2345", await cookie()),
      ctx("abcd2345"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(STATE);
    expect(mocks.getRoomState).toHaveBeenCalledTimes(1);
    expect(mocks.getRoomState).toHaveBeenCalledWith(7, "abcd2345");
  });

  it("401, 403 and 404 mappings", async () => {
    const anonymous = await stateRoute(makeGetRequest("/api/rooms/ABCD2345"), ctx());
    expect(anonymous.status).toBe(401);
    expect(mocks.getRoomState).not.toHaveBeenCalled();

    mocks.getRoomState.mockRejectedValueOnce(new AppError("NOT_ROOM_MEMBER"));
    const forbidden = await stateRoute(
      makeGetRequest("/api/rooms/ABCD2345", await cookie()),
      ctx(),
    );
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe("NOT_ROOM_MEMBER");

    mocks.getRoomState.mockRejectedValueOnce(new AppError("ROOM_NOT_FOUND"));
    const missing = await stateRoute(makeGetRequest("/api/rooms/ZZZZ", await cookie()), ctx("ZZZZ"));
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/rooms/[code]/start and /leave", () => {
  it("start is bodyless, calls the service once and returns 200", async () => {
    mocks.startRoom.mockResolvedValue(STATE);

    const response = await startRoute(
      makeJsonRequest("/api/rooms/ABCD2345/start", "POST", undefined, await cookie()),
      ctx(),
    );

    expect(response.status).toBe(200);
    expect(mocks.startRoom).toHaveBeenCalledTimes(1);
    expect(mocks.startRoom).toHaveBeenCalledWith(7, "ABCD2345");
  });

  it("start maps creator/lobby/player-count errors", async () => {
    for (const [code, status] of [
      ["NOT_ROOM_CREATOR", 403],
      ["ROOM_NOT_LOBBY", 409],
      ["NOT_ENOUGH_PLAYERS", 409],
    ] as const) {
      mocks.startRoom.mockRejectedValueOnce(new AppError(code));
      const response = await startRoute(
        makeJsonRequest("/api/rooms/ABCD2345/start", "POST", undefined, await cookie()),
        ctx(),
      );
      expect(response.status).toBe(status);
      expect(await errorCode(response)).toBe(code);
    }
  });

  it("leave is bodyless and returns the {outcome, room} union", async () => {
    mocks.leaveRoom.mockResolvedValue({ outcome: "left_lobby", room: null });

    const response = await leaveRoute(
      makeJsonRequest("/api/rooms/ABCD2345/leave", "POST", undefined, await cookie()),
      ctx(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "left_lobby", room: null });
    expect(mocks.leaveRoom).toHaveBeenCalledTimes(1);
    expect(mocks.leaveRoom).toHaveBeenCalledWith(7, "ABCD2345");
  });

  it("start/leave return 401 without session and reject a bad Origin", async () => {
    const anonymousStart = await startRoute(
      makeJsonRequest("/api/rooms/ABCD2345/start", "POST"),
      ctx(),
    );
    expect(anonymousStart.status).toBe(401);

    const badOrigin = await leaveRoute(
      makeJsonRequest("/api/rooms/ABCD2345/leave", "POST", undefined, {
        ...(await cookie()),
        origin: "https://evil.example",
      }),
      ctx(),
    );
    expect(badOrigin.status).toBe(403);

    expect(mocks.startRoom).not.toHaveBeenCalled();
    expect(mocks.leaveRoom).not.toHaveBeenCalled();
  });
});
