import { expect, type Page, type Route } from "@playwright/test";

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

interface StartResponse {
  rounds?: Array<{ roundNumber: number; target: Hsv }>;
}

interface TargetWaiter {
  resolve: (targets: Hsv[]) => void;
  reject: (error: Error) => void;
}

export interface TargetCapture {
  /** Resolves with the targets in play order for the next start request. */
  next: () => Promise<Hsv[]>;
  dispose: () => Promise<void>;
}

/**
 * Reads the target colours from `POST /api/games/start` without changing the
 * response. The start endpoint returns display targets, so decoding the signed
 * token is unnecessary. Each captured batch is queued for replay/attempt flows.
 */
export async function captureStartTargets(page: Page): Promise<TargetCapture> {
  const queue: Hsv[][] = [];
  const waiters: TargetWaiter[] = [];
  let failure: Error | null = null;

  const settleWaiters = (error: Error) => {
    failure = error;
    for (const waiter of waiters.splice(0)) waiter.reject(error);
  };

  const handler = async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    try {
      const response = await route.fetch();
      const text = await response.text();
      const body = JSON.parse(text) as StartResponse;

      if (!Array.isArray(body.rounds) || body.rounds.length !== 3) {
        throw new Error("The game start response did not contain three rounds.");
      }

      const targets = body.rounds.map((round) => ({ ...round.target }));

      // Strip transport headers that describe the compressed wire body; the
      // fulfilled body below is already decompressed JSON.
      const headers = { ...response.headers() };
      delete headers["content-encoding"];
      delete headers["content-length"];
      delete headers["transfer-encoding"];

      await route.fulfill({
        status: response.status(),
        headers: { ...headers, "content-type": "application/json" },
        body: text,
      });

      const waiter = waiters.shift();
      if (waiter) waiter.resolve(targets);
      else queue.push(targets);
    } catch (error) {
      const mapped = error instanceof Error ? error : new Error(String(error));
      settleWaiters(mapped);
      await route.abort();
    }
  };

  await page.route("**/api/games/start", handler);

  return {
    next: () => {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      if (failure) return Promise.reject(failure);

      return new Promise<Hsv[]>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    dispose: () => page.unroute("**/api/games/start", handler),
  };
}

function formatChannel(value: number): string {
  return value.toFixed(1);
}

async function setSliderValue(page: Page, name: string, value: number): Promise<void> {
  const slider = page.getByRole("slider", { name, exact: true });
  await expect(slider).toBeVisible();

  const formatted = formatChannel(value);
  await slider.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    if (!setter) throw new Error("The HSV range input has no native value setter.");

    setter.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, formatted);

  await expect(slider).toHaveValue(formatted);
}

/** Sets all three sliders and verifies that React accepted the whole mix. */
export async function setHsvGuess(page: Page, target: Hsv): Promise<void> {
  await setSliderValue(page, "Hue", target.h);
  await setSliderValue(page, "Saturation", target.s);
  await setSliderValue(page, "Value", target.v);

  const mix = `H ${formatChannel(target.h)}° · S ${formatChannel(target.s)}% · V ${formatChannel(target.v)}%`;
  await expect(page.getByText(mix, { exact: true })).toBeVisible();
}

/** Plays all three rounds with captured targets, waiting out each reveal. */
export async function playRounds(page: Page, targets: readonly Hsv[]): Promise<void> {
  if (targets.length !== 3) {
    throw new Error(`Expected 3 captured targets, received ${targets.length}.`);
  }

  for (const target of targets) {
    // Sliders only mount after the five-second reveal window ends.
    await expect(page.getByRole("slider", { name: "Hue", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await setHsvGuess(page, target);
    await page.getByRole("button", { name: "Submit guess" }).click();
  }
}
