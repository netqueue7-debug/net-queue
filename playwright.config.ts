import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Every spec seeds/cleans real rows against one shared dev server and
  // one real Postgres (not per-worker isolated) — running multiple spec
  // files as separate parallel workers causes real contention (observed:
  // spurious timeouts under concurrent load that don't reproduce serially,
  // not flaky tests). One worker at a time keeps the suite reliable as
  // more spec files are added.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
