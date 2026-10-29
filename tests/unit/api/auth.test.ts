import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock("@/lib/services/authService", () => ({
  register: mocks.register,
  login: mocks.login,
  getMe: mocks.getMe,
}));

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { GET as meRoute } from "@/app/api/me/route";
import { AUTH_RATE_LIMIT_MAX, resetAuthRateLimiter } from "@/lib/api/rateLimit";
import { signSession, verifySessionToken } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

import {
  makeGetRequest,
  makeJsonRequest,
  randomPassword,
  resetAuthEnv,
  sessionCookieHeader,
  stubAuthEnv,
  tamperToken,
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
  resetAuthRateLimiter();
});

const USER = {
  id: 7,
  username: "alice",
  email: "alice@example.com",
  role: "player" as const,
  createdAt: "2026-10-29T12:00:00.000Z",
};

const ME_USER = { ...USER, isBanned: false };

function errorBody(body: unknown): { error: { code: string; message: string } } {
  return body as { error: { code: string; message: string } };
}

function sessionTokenFrom(response: Response): string | null {
  const cookie = response.headers.get("set-cookie") ?? "";
  return /cm_session=([^;]+)/.exec(cookie)?.[1] ?? null;
}

describe("POST /api/auth/register", () => {
  it("returns 201, a public user and a session cookie", async () => {
    mocks.register.mockResolvedValue(USER);
    const password = randomPassword();

    const response = await registerRoute(
      makeJsonRequest("/api/auth/register", "POST", {
        username: "  alice  ",
        email: " ALICE@Example.com ",
        password,
      }),
      undefined,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ user: USER });
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.register).toHaveBeenCalledWith({
      username: "alice",
      email: "alice@example.com",
      password,
    });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("cm_session=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=604800");
    expect(setCookie).not.toMatch(/Secure/i);

    const token = sessionTokenFrom(response);
    expect(token).not.toBeNull();
    await expect(verifySessionToken(token as string)).resolves.toEqual({
      userId: 7,
      roleHint: "player",
    });
  });

  it.each([
    ["USERNAME_TAKEN", 409],
    ["EMAIL_TAKEN", 409],
  ])("maps %s to %i", async (code, status) => {
    mocks.register.mockRejectedValue(new AppError(code as "USERNAME_TAKEN" | "EMAIL_TAKEN"));

    const response = await registerRoute(
      makeJsonRequest("/api/auth/register", "POST", {
        username: "alice",
        email: "alice@example.com",
        password: randomPassword(),
      }),
      undefined,
    );

    expect(response.status).toBe(status);
    expect(errorBody(await response.json()).error.code).toBe(code);
  });

  it("rejects validation failures before calling the service", async () => {
    const response = await registerRoute(
      makeJsonRequest("/api/auth/register", "POST", {
        username: "al",
        email: "not-an-email",
        password: randomPassword().slice(0, 7),
        extra: true,
      }),
      undefined,
    );

    const body = errorBody(await response.json());
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin before calling the service", async () => {
    const response = await registerRoute(
      makeJsonRequest(
        "/api/auth/register",
        "POST",
        {
          username: "alice",
          email: "alice@example.com",
          password: randomPassword(),
        },
        { origin: "http://evil.example" },
      ),
      undefined,
    );

    expect(response.status).toBe(403);
    expect(errorBody(await response.json()).error.code).toBe("BAD_ORIGIN");
    expect(mocks.register).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login", () => {
  it("returns 200, the public user and a session cookie", async () => {
    mocks.login.mockResolvedValue(USER);

    const response = await loginRoute(
      makeJsonRequest("/api/auth/login", "POST", {
        email: " ALICE@Example.com ",
        password: randomPassword(),
      }),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: USER });
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(sessionTokenFrom(response)).not.toBeNull();
  });

  it("returns the same INVALID_CREDENTIALS body for both failure kinds", async () => {
    mocks.login.mockRejectedValue(new AppError("INVALID_CREDENTIALS"));

    const unknownEmail = await loginRoute(
      makeJsonRequest("/api/auth/login", "POST", {
        email: "missing@example.com",
        password: randomPassword(),
      }),
      undefined,
    );
    const wrongPassword = await loginRoute(
      makeJsonRequest("/api/auth/login", "POST", {
        email: "alice@example.com",
        password: randomPassword(),
      }),
      undefined,
    );

    const firstBody = await unknownEmail.json();
    const secondBody = await wrongPassword.json();
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(firstBody).toEqual(secondBody);
    expect(errorBody(firstBody).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 429 after 10 attempts for the same IP and email", async () => {
    mocks.login.mockResolvedValue(USER);
    const body = {
      email: "rate-limited@example.com",
      password: randomPassword(),
    };

    for (let attempt = 1; attempt <= AUTH_RATE_LIMIT_MAX; attempt += 1) {
      const response = await loginRoute(
        makeJsonRequest("/api/auth/login", "POST", body),
        undefined,
      );
      expect(response.status).toBe(200);
    }

    const limited = await loginRoute(makeJsonRequest("/api/auth/login", "POST", body), undefined);
    expect(limited.status).toBe(429);
    expect(errorBody(await limited.json()).error.code).toBe("RATE_LIMITED");
    expect(mocks.login).toHaveBeenCalledTimes(AUTH_RATE_LIMIT_MAX);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and returns 204", async () => {
    const token = await signSession({ userId: 7, role: "player" });

    const response = await logoutRoute(
      makeJsonRequest("/api/auth/logout", "POST", undefined, sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("cm_session=;");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("requires a session", async () => {
    const response = await logoutRoute(makeJsonRequest("/api/auth/logout", "POST"), undefined);

    expect(response.status).toBe(401);
    expect(errorBody(await response.json()).error.code).toBe("UNAUTHENTICATED");
  });
});

describe("GET /api/me", () => {
  it("returns 401 without a session", async () => {
    const response = await meRoute(makeGetRequest("/api/me"), undefined);

    expect(response.status).toBe(401);
    expect(errorBody(await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.getMe).not.toHaveBeenCalled();
  });

  it("rejects a tampered session cookie", async () => {
    const token = await signSession({ userId: 7, role: "player" });
    const tampered = tamperToken(token);

    const response = await meRoute(
      makeGetRequest("/api/me", sessionCookieHeader(tampered)),
      undefined,
    );

    expect(response.status).toBe(401);
    expect(errorBody(await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.getMe).not.toHaveBeenCalled();
  });

  it("returns the fresh account including isBanned", async () => {
    mocks.getMe.mockResolvedValue(ME_USER);
    const token = await signSession({ userId: 7, role: "player" });

    const response = await meRoute(
      makeGetRequest("/api/me", sessionCookieHeader(token)),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ user: ME_USER });
    expect(mocks.getMe).toHaveBeenCalledWith(7);
  });
});
