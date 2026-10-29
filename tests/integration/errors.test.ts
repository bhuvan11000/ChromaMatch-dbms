import { afterAll, describe, expect, it } from "vitest";

import { getSqlClient } from "@/lib/db/pg/client";
import { mapPgError } from "@/lib/db/pg/errors";
import { createLogger } from "@/lib/logger";

import { cleanupFixtures, createFixtures, createUser, uniqueSuffix } from "./support/fixtures";

const sql = getSqlClient();
const fixtures = createFixtures();
const silentLogger = createLogger({ level: "error", sink: () => {} });

async function captureError(query: PromiseLike<unknown>): Promise<unknown> {
  try {
    await query;
  } catch (error) {
    return error;
  }
  throw new Error("Expected query to fail");
}

afterAll(async () => {
  try {
    await cleanupFixtures(sql, fixtures);
  } finally {
    await sql.end();
  }
});

describe("PostgreSQL error mapping against the real database", () => {
  it("recognises the username unique constraint/index", async () => {
    const userId = await createUser(sql, fixtures);
    const rows = await sql<{ username: string }[]>`
      select username from users where user_id = ${userId}
    `;
    const username = rows[0]?.username;
    if (!username) throw new Error("Missing test username");
    const suffix = uniqueSuffix();

    const usernameError = await captureError(sql`
      insert into users (username, email, password_hash)
      values (${username}, ${`duplicate_username_${suffix}@example.test`}, 'test-hash')
    `);

    expect(mapPgError(usernameError, silentLogger).code).toBe("USERNAME_TAKEN");
  });

  it("recognises the email unique constraint", async () => {
    const userId = await createUser(sql, fixtures);
    const rows = await sql<{ email: string }[]>`
      select email from users where user_id = ${userId}
    `;
    const email = rows[0]?.email;
    if (!email) throw new Error("Missing test email");
    const suffix = uniqueSuffix();

    const emailError = await captureError(sql`
      insert into users (username, email, password_hash)
      values (${`duplicate_email_${suffix}`}, ${email}, 'test-hash')
    `);

    expect(mapPgError(emailError, silentLogger).code).toBe("EMAIL_TAKEN");
  });

  it("maps check violations to VALIDATION_ERROR", async () => {
    const userId = await createUser(sql, fixtures);

    const checkError = await captureError(sql`
      update users set role = 'invalid' where user_id = ${userId}
    `);

    expect(mapPgError(checkError, silentLogger).code).toBe("VALIDATION_ERROR");
  });
});
