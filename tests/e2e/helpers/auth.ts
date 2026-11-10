import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

export interface E2eUser {
  username: string;
  email: string;
  password: string;
}

export const E2E_PASSWORD = "E2ePassword!123";

/** Unique identity per run so repeated local runs never collide on users. */
export function makeUser(prefix: string): E2eUser {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const username = `e2e_${prefix}_${suffix}`;

  return {
    username,
    email: `${username}@example.com`,
    password: E2E_PASSWORD,
  };
}

/** Registers through the real UI and waits until the session lands on /home. */
export async function registerUser(page: Page, user: E2eUser = makeUser("user")): Promise<E2eUser> {
  await page.goto("/register");
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Count me in" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(user.username, { exact: true })).toBeVisible();

  return user;
}
