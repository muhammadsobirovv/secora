import { defineConfig, devices } from "@playwright/test";

/// Browser end-to-end tests at phone width (360 px) against a RUNNING stack: the web
/// app, the API and the dev worker (see docs/operations/local-worker.md and
/// scripts/e2e/README in that document). Uses the Chrome that is installed on the
/// machine, so nothing is downloaded.
///
///   pnpm --filter web e2e
///
/// E2E_WEB_URL (default http://localhost:3001), E2E_API_URL (default http://127.0.0.1:4000).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3001",
    ...devices["Pixel 5"],
    viewport: { width: 360, height: 740 },
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "phone-360" }],
});
