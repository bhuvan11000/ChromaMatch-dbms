import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  verifyDummyPassword: vi.fn(),
  insertUser: vi.fn(),
  findByEmail: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
  verifyDummyPassword: mocks.verifyDummyPassword,
}));

vi.mock("@/lib/db/pg/queries/users", () => ({
  insertUser: mocks.insertUser,
  findByEmail: mocks.findByEmail,
  findById: mocks.findById,
}));

import { AppError } from "@/lib/errors";
import { getMe, login, register } from "@/lib/services/authService";

import { randomPassword, resetAuthEnv, stubAuthEnv } from "../support/auth";

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

const NOW = new Date("2026-10-29T12:00:00.000Z");

const PUBLIC_USER = {
  id: 7,
  username: "alice",
  email: "alice@example.com",
  role: "player" as const,
  isBanned: false,
  createdAt: NOW,
};

const USER_WITH_HASH = {
  ...PUBLIC_USER,
  passwordHash: "stored-hash",
};

describe("register", () => {
  it("hashes the password, inserts the normalized account and returns a public DTO", async () => {
    const password = randomPassword();
    mocks.hashPassword.mockResolvedValue("new-hash");
    mocks.insertUser.mockResolvedValue(PUBLIC_USER);

    await expect(
      register({
        username: "  alice  ",
        email: "  ALICE@Example.com ",
        password,
      }),
    ).resolves.toEqual({
      id: 7,
      username: "alice",
      email: "alice@example.com",
      role: "player",
      createdAt: "2026-10-29T12:00:00.000Z",
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith(password);
    expect(mocks.insertUser).toHaveBeenCalledWith({
      username: "alice",
      email: "alice@example.com",
      passwordHash: "new-hash",
    });
  });

  it("propagates duplicate username and email errors", async () => {
    mocks.hashPassword.mockResolvedValue("new-hash");
    mocks.insertUser.mockRejectedValueOnce(new AppError("USERNAME_TAKEN"));

    await expect(
      register({ username: "alice", email: "a@example.com", password: randomPassword() }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN", status: 409 });

    mocks.insertUser.mockRejectedValueOnce(new AppError("EMAIL_TAKEN"));

    await expect(
      register({ username: "bob", email: "b@example.com", password: randomPassword() }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
  });
});

describe("login", () => {
  it("returns the public user on success and never exposes the hash", async () => {
    mocks.findByEmail.mockResolvedValue(USER_WITH_HASH);
    mocks.verifyPassword.mockResolvedValue(true);

    const user = await login({ email: " ALICE@example.com ", password: randomPassword() });

    expect(user).toEqual({
      id: 7,
      username: "alice",
      email: "alice@example.com",
      role: "player",
      createdAt: "2026-10-29T12:00:00.000Z",
    });
    expect(user).not.toHaveProperty("passwordHash");
    expect(mocks.findByEmail).toHaveBeenCalledWith("alice@example.com");
  });

  it("runs the dummy verify for an unknown email and returns INVALID_CREDENTIALS", async () => {
    const password = randomPassword();
    mocks.findByEmail.mockResolvedValue(null);
    mocks.verifyDummyPassword.mockResolvedValue(false);

    await expect(login({ email: "missing@example.com", password })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
      status: 401,
    });
    expect(mocks.verifyDummyPassword).toHaveBeenCalledWith(password);
  });

  it("returns the same error object for an unknown email and a wrong password", async () => {
    const password = randomPassword();
    mocks.findByEmail.mockResolvedValueOnce(null);
    mocks.verifyDummyPassword.mockResolvedValue(false);

    let unknownEmailError: unknown;
    try {
      await login({ email: "missing@example.com", password });
    } catch (error) {
      unknownEmailError = error;
    }

    mocks.findByEmail.mockResolvedValueOnce(USER_WITH_HASH);
    mocks.verifyPassword.mockResolvedValue(false);

    let wrongPasswordError: unknown;
    try {
      await login({ email: "alice@example.com", password });
    } catch (error) {
      wrongPasswordError = error;
    }

    expect(unknownEmailError).toBeInstanceOf(AppError);
    expect(wrongPasswordError).toBeInstanceOf(AppError);
    expect(unknownEmailError).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
      status: 401,
      details: undefined,
    });
    expect(wrongPasswordError).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
      status: 401,
      details: undefined,
    });
  });

  it("fails closed when the stored hash is malformed", async () => {
    mocks.findByEmail.mockResolvedValue(USER_WITH_HASH);
    mocks.verifyPassword.mockRejectedValue(new Error("invalid hash"));

    await expect(
      login({ email: "alice@example.com", password: randomPassword() }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("allows a banned player to log in under the default BANNED_CAN_PLAY policy", async () => {
    mocks.findByEmail.mockResolvedValue({
      ...USER_WITH_HASH,
      isBanned: true,
    });
    mocks.verifyPassword.mockResolvedValue(true);

    await expect(
      login({ email: "alice@example.com", password: randomPassword() }),
    ).resolves.toMatchObject({ id: 7, username: "alice" });
  });
});

describe("getMe", () => {
  it("returns the fresh row including the ban flag", async () => {
    mocks.findById.mockResolvedValue({ ...PUBLIC_USER, isBanned: true });

    await expect(getMe(7)).resolves.toEqual({
      id: 7,
      username: "alice",
      email: "alice@example.com",
      role: "player",
      createdAt: "2026-10-29T12:00:00.000Z",
      isBanned: true,
    });
  });

  it("treats a deleted account as unauthenticated", async () => {
    mocks.findById.mockResolvedValue(null);

    await expect(getMe(7)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });
});
