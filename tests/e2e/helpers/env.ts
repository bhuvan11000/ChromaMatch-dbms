/** Base URL for the Playwright suite; matches the local Docker defaults. */
export const E2E_BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
