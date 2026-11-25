// Saves on Today are optimistic: a key turns done the moment the hold ends,
// and the save (a server action POST) is still on its way. So a test must
// never treat "the key looks done" as "it's saved" (plans/habit-tracker.md,
// Feature 8c, the flaky undo test):
// - Reloading while a save is in flight cancels it in the browser, but the
//   server still applies it, while the reload reads the habits: the page
//   can come back half old, half new (done, with the undone streak).
// - A save still in flight when a test ends can land after the next test
//   has reset the shared demo.

import { test as base, expect, type Page, type Request } from "@playwright/test";

function isSave(request: Request): boolean {
  return request.method() === "POST" && Boolean(request.headers()["next-action"]);
}

/**
 * The server's answer to the next save. Start waiting BEFORE the tap or hold
 * that saves, then await it before reloading:
 *   const saved = nextSave(page); await key.click(); await saved; await page.reload();
 */
export function nextSave(page: Page) {
  return page.waitForResponse((response) => isSave(response.request()));
}

/** How long no save may be on its way before a test counts as settled. */
const QUIET_MS = 300;

/**
 * Playwright's `test`, plus two guards on every test:
 * - It ends only once no save is on its way, and none has started for
 *   QUIET_MS (saves queue one after another, so a gap between two isn't
 *   the end): nothing it started can land in the next test's fresh demo.
 * - It fails if a navigation (a reload, a goto) cancelled a save before
 *   its answer arrived: the server still applies it, while the new page
 *   reads the habits (the flaky test of Feature 8c). Await `nextSave`
 *   first. (Once the answer has started, the save is done: the server
 *   answers only after the action ran, so a reload that cuts the rest of
 *   the answer short is harmless.) Saves blocked on purpose
 *   (`route.abort()`) fail differently and are allowed.
 */
export const test = base.extend<{ settleSaves: void }>({
  settleSaves: [
    async ({ page }, use) => {
      const inFlight = new Set<Request>();
      const cancelled: string[] = [];
      const answered = new WeakSet<Request>();
      let lastChange = Date.now();
      page.on("request", (request) => {
        if (!isSave(request)) return;
        inFlight.add(request);
        lastChange = Date.now();
      });
      page.on("response", (response) => {
        if (isSave(response.request())) answered.add(response.request());
      });
      page.on("requestfinished", (request) => {
        if (inFlight.delete(request)) lastChange = Date.now();
      });
      page.on("requestfailed", (request) => {
        if (!inFlight.delete(request)) return;
        lastChange = Date.now();
        if (!answered.has(request) && request.failure()?.errorText.includes("ERR_ABORTED")) cancelled.push(request.url());
      });
      await use();
      await expect
        .poll(() => inFlight.size === 0 && Date.now() - lastChange >= QUIET_MS, {
          message: "a save was still on its way when the test ended",
        })
        .toBe(true);
      expect(cancelled, "a save was cancelled by a reload or navigation: await nextSave(page) before it").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
