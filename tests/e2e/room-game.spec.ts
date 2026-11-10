import { expect, test } from "@playwright/test";

import { makeUser, registerUser } from "./helpers/auth";
import { E2E_BASE_URL } from "./helpers/env";
import { captureStartTargets, playRounds } from "./helpers/game";
import { createRoom, joinRoom } from "./helpers/room";

test("two browser contexts create, join, start, and play a room attempt", async ({ browser }) => {
  const creatorContext = await browser.newContext({ baseURL: E2E_BASE_URL });
  const joinerContext = await browser.newContext({ baseURL: E2E_BASE_URL });

  try {
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    const creator = await registerUser(creatorPage, makeUser("host"));
    const joiner = await registerUser(joinerPage, makeUser("guest"));

    const code = await createRoom(creatorPage);
    await joinRoom(joinerPage, code);

    await expect(creatorPage.getByTestId("lobby-member-count")).toHaveText("2 / 4");
    await expect(joinerPage.getByTestId("lobby-member-count")).toHaveText("2 / 4");
    await expect(
      creatorPage.getByTestId("lobby-member").filter({ hasText: joiner.username }),
    ).toBeVisible();

    await creatorPage.getByRole("button", { name: "Start room" }).click();
    await expect(creatorPage.getByRole("button", { name: "Play attempt" })).toBeVisible();
    await expect(joinerPage.getByRole("button", { name: "Play attempt" })).toBeVisible();

    const creatorCapture = await captureStartTargets(creatorPage);
    const joinerCapture = await captureStartTargets(joinerPage);

    try {
      await Promise.all([
        creatorPage.getByRole("button", { name: "Play attempt" }).click(),
        joinerPage.getByRole("button", { name: "Play attempt" }).click(),
      ]);

      const [creatorTargets, joinerTargets] = await Promise.all([
        creatorCapture.next(),
        joinerCapture.next(),
      ]);

      await Promise.all([
        playRounds(creatorPage, creatorTargets),
        playRounds(joinerPage, joinerTargets),
      ]);
    } finally {
      await Promise.all([creatorCapture.dispose(), joinerCapture.dispose()]);
    }

    await expect(creatorPage.getByRole("heading", { name: "Attempt logged." })).toBeVisible();
    await expect(joinerPage.getByRole("heading", { name: "Attempt logged." })).toBeVisible();

    await Promise.all([
      creatorPage.getByRole("link", { name: "← Room" }).click(),
      joinerPage.getByRole("link", { name: "← Room" }).click(),
    ]);

    for (const page of [creatorPage, joinerPage]) {
      const board = page.getByTestId("room-scoreboard");
      await expect(board).toBeVisible();
      await expect(
        board.getByTestId("room-scoreboard-row").filter({ hasText: creator.username }),
      ).toContainText("30.0");
      await expect(
        board.getByTestId("room-scoreboard-row").filter({ hasText: joiner.username }),
      ).toContainText("30.0");
    }
  } finally {
    await creatorContext.close();
    await joinerContext.close();
  }
});
