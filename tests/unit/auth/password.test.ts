import { describe, expect, it } from "vitest";

import { hashPassword, verifyDummyPassword, verifyPassword } from "@/lib/auth/password";

import { randomPassword } from "../support/auth";

describe("password hashing", () => {
  it("hashes with argon2id and verifies the correct password", async () => {
    const password = randomPassword();
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword(randomPassword());

    await expect(verifyPassword(hash, randomPassword())).resolves.toBe(false);
  });

  it("uses a fresh salt for every hash", async () => {
    const password = randomPassword();
    const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);

    expect(first).not.toBe(second);
    await expect(verifyPassword(first, password)).resolves.toBe(true);
    await expect(verifyPassword(second, password)).resolves.toBe(true);
  });

  it("never accepts a password against the dummy hash", async () => {
    await expect(verifyDummyPassword(randomPassword())).resolves.toBe(false);
  });
});
