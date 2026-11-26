// The demo recording's own config (`npm run record:demo`), so
// `npm run test:e2e` never records a video. On production by default
// (BASE_URL overrides); one take at a time, since the demo is shared.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "record-demo.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  // The browser itself at the phone's 2x: Chrome's screencast (e2e/helpers/film.ts)
  // then delivers 786 x 1704 frames, not CSS-sized ones.
  use: { browserName: "chromium", launchOptions: { args: ["--force-device-scale-factor=2"] } },
});
