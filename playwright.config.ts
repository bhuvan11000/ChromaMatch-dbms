import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL } from "./tests/e2e/helpers/env";

/**
 * Keep Playwright artifacts outside the repository: `next dev` watches the
 * project tree, and streaming traces into it triggers Fast Refresh reloads
 * while a test is running.
 */
const outputRoot = process.env.PLAYWRIGHT_OUTPUT_DIR ?? join(tmpdir(), "chromamatch-playwright");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: join(outputRoot, "test-results"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: join(outputRoot, "playwright-report") }],
  ],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
