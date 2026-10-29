import { describe, expect, it } from "vitest";

import { authUserSchema, loginSchema, meUserSchema, registerSchema } from "@/lib/schemas/auth";

import { randomPassword } from "../support/auth";

describe("registerSchema", () => {
  it("trims the username and normalizes the email", () => {
    const parsed = registerSchema.parse({
      username: "  Alice_01  ",
      email: "  Alice@Example.COM  ",
      password: randomPassword(),
    });

    expect(parsed.username).toBe("Alice_01");
    expect(parsed.email).toBe("alice@example.com");
  });

  it.each(["al", "a".repeat(31), "alice!", "alice smith", "álice"])(
    "rejects an invalid username %s",
    (username) => {
      expect(() =>
        registerSchema.parse({
          username,
          email: "alice@example.com",
          password: randomPassword(),
        }),
      ).toThrow();
    },
  );

  it("accepts underscores and digits", () => {
    expect(() =>
      registerSchema.parse({
        username: "Player_123",
        email: "player@example.com",
        password: randomPassword(),
      }),
    ).not.toThrow();
  });

  it.each(["not-an-email", "alice@", "@example.com", "alice@example"])(
    "rejects an invalid email %s",
    (email) => {
      expect(() =>
        registerSchema.parse({
          username: "alice",
          email,
          password: randomPassword(),
        }),
      ).toThrow();
    },
  );

  it("enforces the password length bounds without trimming", () => {
    expect(() =>
      registerSchema.parse({
        username: "alice",
        email: "alice@example.com",
        password: "x".repeat(7),
      }),
    ).toThrow();

    expect(() =>
      registerSchema.parse({
        username: "alice",
        email: "alice@example.com",
        password: "x".repeat(129),
      }),
    ).toThrow();

    const parsed = registerSchema.parse({
      username: "alice",
      email: "alice@example.com",
      password: ` ${"x".repeat(8)} `,
    });
    expect(parsed.password).toBe(` ${"x".repeat(8)} `);
  });

  it("rejects unknown keys", () => {
    expect(() =>
      registerSchema.parse({
        username: "alice",
        email: "alice@example.com",
        password: randomPassword(),
        role: "admin",
      }),
    ).toThrow();
  });
});

describe("loginSchema", () => {
  it("normalizes the email and rejects unknown keys", () => {
    const parsed = loginSchema.parse({
      email: " ALICE@Example.com ",
      password: randomPassword(),
    });
    expect(parsed.email).toBe("alice@example.com");

    expect(() =>
      loginSchema.parse({
        email: "alice@example.com",
        password: randomPassword(),
        remember: true,
      }),
    ).toThrow();
  });
});

describe("response schemas", () => {
  it("accepts the public and me shapes", () => {
    const user = {
      id: 7,
      username: "alice",
      email: "alice@example.com",
      role: "player",
      createdAt: "2026-10-29T12:00:00.000Z",
    };

    expect(authUserSchema.parse(user)).toEqual(user);
    expect(meUserSchema.parse({ ...user, isBanned: false })).toEqual({
      ...user,
      isBanned: false,
    });
  });

  it("rejects a password hash in a response", () => {
    expect(() =>
      authUserSchema.parse({
        id: 7,
        username: "alice",
        email: "alice@example.com",
        role: "player",
        createdAt: "2026-10-29T12:00:00.000Z",
        passwordHash: "should-not-be-here",
      }),
    ).toThrow();
  });
});
