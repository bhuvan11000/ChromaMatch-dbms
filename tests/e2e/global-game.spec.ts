import { expect, test } from "@playwright/test";

import { makeUser, registerUser } from "./helpers/auth";
import { captureStartTargets, playRounds } from "./helpers/game";

test("register, play a full Global game, and appear on the leaderboard", async ({ page }) => {
  const user = await registerUser(page, makeUser("global"));

  await page.goto("/play/global");
  const capture = await captureStartTargets(page);

  try {
    await page.getByRole("button", { name: "Play Global" }).click();

    const targets = await capture.next();
    await playRounds(page, targets);

    await expect(page.getByRole("heading", { name: "Palette logged." })).toBeVisible();
    await expect(page.getByTestId("score-count-up")).toHaveText("30.0");

    await page.getByRole("link", { name: "Global board" }).click();
    await expect(page).toHaveURL(/\/leaderboard\/global$/);

    const board = page.getByRole("table", { name: "Global leaderboard" });
    await expect(board).toBeVisible();

    const row = board.getByRole("row").filter({ hasText: user.username });
    await expect(row).toContainText("30.0");
    await expect(row.getByText("You", { exact: true })).toBeVisible();
  } finally {
    await capture.dispose();
  }
});
