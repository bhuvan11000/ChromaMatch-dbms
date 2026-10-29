import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
}));

vi.mock("@/lib/db/pg/queries/users", () => ({
  findById: mocks.findById,
}));

import { getSession, requireAdmin, requireUser } from "@/lib/auth/guards";
import { signSession } from "@/lib/auth/session";

import { resetAuthEnv, sessionCookieHeader, stubAuthEnv, tamperToken } from "../support/auth";

beforeAll(() => {
  stubAuthEnv();
});

afterAll(() => {
  resetAuthEnv();
});

beforeEach(() => {
  mocks.findById.mockReset();
});

function requestWithToken(token: string): Request {
  return new Request("http://localhost:3000/api/me", {
    headers: sessionCookieHeader(token),
  });
}

const PLAYER_ROW = {
  id: 7,
  username: "alice",
  email: "alice@example.com",
  role: "player" as const,
  isBanned: false,
  createdAt: new Date("2026-10-29T12:00:00.000Z"),
};

const ADMIN_ROW = {
  ...PLAYER_ROW,
  id: 8,
  username: "admin",
  email: "admin@example.com",
  role: "admin" as const,
};

describe("session guards", () => {
  it("returns null without a cookie", async () => {
    await expect(getSession(new Request("http://localhost:3000/api/me"))).resolves.toBeNull();
  });

  it("returns null for a tampered cookie", async () => {
    const token = await signSession({ userId: 7, role: "player" });
    const tampered = tamperToken(token);

    await expect(getSession(requestWithToken(tampered))).resolves.toBeNull();
  });

  it("requireUser throws UNAUTHENTICATED without a session", async () => {
    await expect(requireUser(new Request("http://localhost:3000/api/me"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("requireUser returns the verified session", async () => {
    const token = await signSession({ userId: 7, role: "player" });

    await expect(requireUser(requestWithToken(token))).resolves.toEqual({
      userId: 7,
      roleHint: "player",
    });
  });

  it("requireAdmin allows an admin row from PostgreSQL", async () => {
    mocks.findById.mockResolvedValue(ADMIN_ROW);
    const token = await signSession({ userId: 8, role: "admin" });

    await expect(requireAdmin(requestWithToken(token))).resolves.toEqual({
      userId: 8,
      roleHint: "admin",
    });
    expect(mocks.findById).toHaveBeenCalledWith(8);
  });

  it("requireAdmin rejects a player even with an admin role hint", async () => {
    mocks.findById.mockResolvedValue(PLAYER_ROW);
    const token = await signSession({ userId: 7, role: "admin" });

    await expect(requireAdmin(requestWithToken(token))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("requireAdmin accepts a database admin even if the hint is stale", async () => {
    mocks.findById.mockResolvedValue(ADMIN_ROW);
    const token = await signSession({ userId: 8, role: "player" });

    await expect(requireAdmin(requestWithToken(token))).resolves.toEqual({
      userId: 8,
      roleHint: "player",
    });
  });

  it("requireAdmin treats a deleted user as unauthenticated", async () => {
    mocks.findById.mockResolvedValue(null);
    const token = await signSession({ userId: 7, role: "player" });

    await expect(requireAdmin(requestWithToken(token))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
});
