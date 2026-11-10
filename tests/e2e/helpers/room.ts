import { expect, type Page } from "@playwright/test";

/** Creates a room with the form defaults (4 players, no timer, 3 attempts). */
export async function createRoom(page: Page): Promise<string> {
  await page.goto("/rooms");
  await page.getByRole("button", { name: "Create room" }).click();

  await expect(page).toHaveURL(/\/rooms\/[A-Z2-9]{8}$/);
  const code = (await page.getByTestId("room-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  return code;
}

/** Joins an existing room by code and waits for its panel to load. */
export async function joinRoom(page: Page, code: string): Promise<void> {
  await page.goto("/rooms");
  await page.getByLabel("Room code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Join room" }).click();

  await expect(page).toHaveURL(new RegExp(`/rooms/${code}$`));
  await expect(page.getByTestId("room-code")).toHaveText(code);
}
