// End-to-end tests: a real browser shaped like an iPhone, using the app
// through "Try the demo". Run with `npm run test:e2e` (starts the dev
// server if it isn't running), or against a deployed copy with BASE_URL.
//
// The demo account is real and shared (with Staple too), so the tests run
// one at a time (workers: 1): two demo sign-ins at once would reset each
// other's habits and spend the shared sign-in rate limit.

import { defineConfig } from "@playwright/test";
import { BASE_URL, PHONE } from "./e2e/helpers/phone";

export default defineConfig({
  testDir: "./e2e",
  // *.e2e.ts, so Vitest (which runs *.test.ts) never picks these up.
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    ...PHONE,
    baseURL: BASE_URL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: BASE_URL, reuseExistingServer: true, timeout: 120_000 },
});
