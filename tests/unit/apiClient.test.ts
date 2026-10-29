import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiClient } from "@/lib/api-client";
import { meResponseSchema } from "@/lib/schemas/auth";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function lastFetchCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return call as [string, RequestInit];
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiClient", () => {
  it("sends credentialed JSON requests and returns parsed data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ user: { id: 7 } }));

    await expect(apiClient.get<{ user: { id: number } }>("/me")).resolves.toEqual({
      user: { id: 7 },
    });

    const [url, init] = lastFetchCall();
    expect(url).toBe("/api/me");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
    expect(new Headers(init.headers).get("content-type")).toBeNull();
  });

  it("serialises bodies and query parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiClient.post(
      "/auth/login",
      { email: "alice@example.com" },
      { query: { next: "/home", limit: 5, skip: null } },
    );

    const [url, init] = lastFetchCall();
    expect(url).toBe("/api/auth/login?next=%2Fhome&limit=5");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "alice@example.com" });
  });

  it("sets Content-Type on bodyless mutations (logout)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiClient.post<void>("/auth/logout")).resolves.toBeUndefined();

    const [, init] = lastFetchCall();
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBeUndefined();
  });

  it("does not double-prefix paths that already start with /api", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiClient.get("/api/health");

    expect(lastFetchCall()[0]).toBe("/api/health");
  });

  it("parses the standard error envelope into ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "ROOM_FULL",
            message: "This room is full.",
            details: { roomSize: 10 },
          },
        },
        { status: 409 },
      ),
    );

    await expect(apiClient.get("/rooms/ABCD2345")).rejects.toMatchObject({
      name: "ApiError",
      code: "ROOM_FULL",
      status: 409,
      message: "This room is full.",
      details: { roomSize: 10 },
    });
  });

  it("falls back to the catalog message when the error body is malformed", async () => {
    fetchMock.mockResolvedValue(new Response("upstream exploded", { status: 500 }));

    const error = await apiClient.get("/health").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "Something went wrong.",
    });
  });

  it("maps network failures to SERVICE_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(apiClient.get("/me")).rejects.toMatchObject({
      name: "ApiError",
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      message: "Could not reach the server. Please check your connection and try again.",
    });
  });

  it("rethrows abort errors unchanged", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);

    await expect(apiClient.get("/me")).rejects.toBe(abort);
  });

  it("validates successful responses with a Zod schema", async () => {
    const user = {
      id: 7,
      username: "alice",
      email: "alice@example.com",
      role: "player",
      isBanned: false,
      createdAt: "2026-10-29T12:00:00.000Z",
    };
    fetchMock.mockResolvedValue(jsonResponse({ user }));

    await expect(
      apiClient.get<{ user: typeof user }>("/me", { schema: meResponseSchema }),
    ).resolves.toEqual({ user });
  });

  it("rejects unexpected successful responses when a schema is supplied", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ user: { id: 7 } }));

    await expect(apiClient.get("/me", { schema: meResponseSchema })).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "The server returned an unexpected response.",
    });
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiClient.delete<void>("/sessions/current")).resolves.toBeUndefined();
  });
});
