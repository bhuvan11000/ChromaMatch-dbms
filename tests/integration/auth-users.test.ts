import { randomBytes } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";
import { findByEmail, findById, insertUser } from "@/lib/db/pg/queries/users";
import { register } from "@/lib/services/authService";

import { cleanupFixtures, createFixtures, uniqueSuffix } from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();

function randomPassword(): string {
  return randomBytes(24).toString("base64url");
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("user queries against the real database", () => {
  it("inserts, finds by email and finds by id without exposing the hash", async () => {
    const suffix = uniqueSuffix();
    const inserted = await insertUser({
      username: `query_${suffix}`,
      email: `query_${suffix}@example.test`,
      passwordHash: "test-hash",
    });
    fixtures.userIds.push(inserted.id);

    expect(inserted).not.toHaveProperty("passwordHash");
    expect(inserted.role).toBe("player");
    expect(inserted.isBanned).toBe(false);

    const byEmail = await findByEmail(`QUERY_${suffix}@EXAMPLE.TEST`);
    expect(byEmail?.id).toBe(inserted.id);
    expect(byEmail?.passwordHash).toBe("test-hash");

    const byId = await findById(inserted.id);
    expect(byId).toEqual(inserted);
  });

  it("maps a duplicate username, including a case variant, to USERNAME_TAKEN", async () => {
    const suffix = uniqueSuffix();
    const first = await insertUser({
      username: `Dup_${suffix}`,
      email: `dup_first_${suffix}@example.test`,
      passwordHash: "test-hash",
    });
    fixtures.userIds.push(first.id);

    await expect(
      insertUser({
        username: `dup_${suffix}`,
        email: `dup_second_${suffix}@example.test`,
        passwordHash: "test-hash",
      }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN", status: 409 });
  });

  it("maps a duplicate email to EMAIL_TAKEN", async () => {
    const suffix = uniqueSuffix();
    const email = `dup_email_${suffix}@example.test`;
    const first = await insertUser({
      username: `email_one_${suffix}`,
      email,
      passwordHash: "test-hash",
    });
    fixtures.userIds.push(first.id);

    await expect(
      insertUser({
        username: `email_two_${suffix}`,
        email,
        passwordHash: "test-hash",
      }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
  });
});

describe("authService.register against the real database", () => {
  it("registers a player, normalizes the email and reports duplicates", async () => {
    const suffix = uniqueSuffix();
    const username = `reg_${suffix}`;
    const email = `reg_${suffix}@Example.TEST`;
    const password = randomPassword();

    const user = await register({ username, email, password });
    fixtures.userIds.push(user.id);

    expect(user.email).toBe(email.toLowerCase());
    expect(user.role).toBe("player");
    expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);

    await expect(
      register({
        username: username.toUpperCase(),
        email: `other_username_${suffix}@example.test`,
        password,
      }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN", status: 409 });

    await expect(
      register({
        username: `other_email_${suffix}`,
        email: email.toUpperCase(),
        password,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
  });
});
