// A short check of a deployed copy (plans/habit-tracker.md, Feature 6):
//   BASE_URL=https://ascend-dk.vercel.app npx playwright test
// With a non-local BASE_URL, playwright.config.ts runs ONLY this file and
// install.e2e.ts. Each demo sign-in from the server spends the
// per-address limit that Staple's live demo shares, and the full suite
// (about 20 sign-ins, Reset demo, screenshots) is for local runs.

import { expect, nextSave, test } from "./helpers/saves";
import { holdKey, signInDemo } from "./helpers/app";

test("logged out goes to login; the demo opens Today; a hold is SAVED and an undo puts it back", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await signInDemo(page);
  const keys = page.getByRole("list", { name: "Habits" }).getByRole("button");
  await expect(keys.first()).toBeVisible();

  // The first habit not done yet, by position (names can repeat on a busy
  // shared demo). All done means someone else is mid-demo: fail loudly
  // rather than skip, so a broken save can't hide behind it.
  const pressed = await keys.evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")));
  const index = pressed.indexOf("false");
  expect(index, "every demo habit is already done; reset the demo and run again").toBeGreaterThanOrEqual(0);
  const key = () => page.getByRole("list", { name: "Habits" }).getByRole("button").nth(index);

  // Complete it, and wait for the SERVER's answer: the key turns done the
  // moment the hold ends (optimistic), whether or not the save works.
  const saved = nextSave(page);
  await holdKey(page, key(), 800);
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(key()).toHaveAttribute("aria-pressed", "true");

  // Leave the demo as we found it, and make sure the undo reached the server too.
  const undone = nextSave(page);
  await key().click();
  expect((await undone).ok()).toBe(true);
  await page.reload();
  await expect(key()).toHaveAttribute("aria-pressed", "false");
});
