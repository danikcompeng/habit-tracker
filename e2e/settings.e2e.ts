// Settings, and the hint toward Tap to complete (plans/habit-tracker.md,
// Features 8 and 8b), on the demo account. Each test has a fresh browser
// context, so the "hold-mode" cookie and the hint's "has held" flag in
// localStorage start empty.

import type { Locator, Page } from "@playwright/test";
import { expect, nextSave, test } from "./helpers/saves";
import { expectNoA11yViolations, freshDemo, habitKey, holdKey } from "./helpers/app";

const HINT = "Hold to complete, or turn on Tap to complete in Settings.";

test.beforeEach(async ({ page }) => {
  await freshDemo(page);
});

async function openSettings(page: Page) {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

/**
 * A quick tap on a key: 60 ms, well under the 300 ms that counts as a tap
 * (lib/tap-hint.ts). Waits for "Keep holding…", so the release has landed.
 */
async function quickTap(page: Page, key: Locator) {
  await holdKey(page, key, 60);
  await expect(key.getByText("Keep holding…")).toBeVisible();
}

test("Settings opens from Today's footer, holds the switch, and is accessible; Today no longer has it", async ({ page }) => {
  await expect(page.getByRole("switch", { name: /Tap to complete/ })).toHaveCount(0);
  await openSettings(page);
  await expect(page).toHaveTitle("Settings · Ascend");
  await expect(page.getByRole("switch", { name: /Tap to complete/ })).toHaveAttribute("aria-checked", "false");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("turned on in Settings, a tap completes on Today (back by Done, and by the back button); and off again", async ({ page }) => {
  await openSettings(page);
  const tapSwitch = page.getByRole("switch", { name: /Tap to complete/ });
  await tapSwitch.click();
  // Done straight away: it waits for the save.
  await page.getByRole("link", { name: /Done|Saving/ }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const stretch = habitKey(page, "Stretch for 5 minutes");
  await expect(stretch).toHaveAccessibleDescription(/Tap to complete/);
  await stretch.click();
  await expect(stretch).toHaveAttribute("aria-pressed", "true");
  await expect(stretch).toContainText("1-day streak");

  // Off again, back with the browser's back button this time.
  await openSettings(page);
  await expect(tapSwitch).toHaveAttribute("aria-checked", "true");
  await tapSwitch.click();
  await expect(tapSwitch).toHaveAttribute("aria-checked", "false");
  await page.waitForLoadState("networkidle");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(habitKey(page, "Read 10 pages")).toHaveAccessibleDescription(/Press and hold to complete/);
});

test("Done that waited for a save is a normal Done on the next visit", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("switch", { name: /Tap to complete/ }).click();
  await page.getByRole("link", { name: /Done|Saving/ }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await openSettings(page);
  const done = page.getByRole("link", { name: "Done" });
  await expect(done).not.toHaveAttribute("aria-disabled");
  await done.click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("the back button after turning it on: Today is in tap mode", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("switch", { name: /Tap to complete/ }).click();
  await expect(page.getByRole("switch", { name: /Tap to complete/ })).toHaveAttribute("aria-checked", "true");
  await page.waitForLoadState("networkidle");
  await page.goBack();
  await expect(habitKey(page, "Read 10 pages")).toHaveAccessibleDescription(/Tap to complete/);
});

test("two quick taps bring a hint under the key, announced, with a link to Settings", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  const stretch = habitKey(page, "Stretch for 5 minutes");
  await quickTap(page, read);
  await expect(page.getByText(HINT)).toHaveCount(0);
  // Taps on different keys count together; the hint goes under the second.
  await quickTap(page, stretch);
  const hint = page.getByRole("listitem").filter({ has: stretch }).getByText(HINT);
  await expect(hint).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "or turn on Tap to complete in Settings" })).toHaveCount(1);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
  // A completion doesn't remove it (keys would move under the finger).
  await holdKey(page, read, 800);
  await expect(read).toHaveAttribute("aria-pressed", "true");
  await expect(hint).toBeVisible();
  await page.getByRole("link", { name: "Tap to complete in Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("slower releases (learning to hold) don't count", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  // 450 ms: well over the 300 ms tap limit, 200 ms short of completing.
  await holdKey(page, read, 450);
  await holdKey(page, read, 450);
  await expect(read).toHaveAttribute("aria-pressed", "false");
  await expect(read.getByText("Keep holding…")).toBeVisible();
  await expect(page.getByText(HINT)).toHaveCount(0);
});

test("leaving Today clears the hint, and two quick taps bring it back on the next visit", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(page.getByText(HINT)).toBeVisible();
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText(HINT)).toHaveCount(0);
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(page.getByText(HINT)).toBeVisible();
  // And after a reload: no daily cap (Feature 8b).
  await page.reload();
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(page.getByText(HINT)).toBeVisible();
});

test("once this device has completed a real hold, quick taps only say Keep holding (this visit, and after a reload)", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  const stretch = habitKey(page, "Stretch for 5 minutes");
  const saved = nextSave(page);
  await holdKey(page, stretch, 800);
  await expect(stretch).toHaveAttribute("aria-pressed", "true");
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(page.getByText(HINT)).toHaveCount(0);
  await saved;
  await page.reload();
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(read.getByText("Keep holding…")).toBeVisible();
  await expect(page.getByText(HINT)).toHaveCount(0);
});

test("a real hold with Space counts, even if it's undone straight away", async ({ page }) => {
  const stretch = habitKey(page, "Stretch for 5 minutes");
  await stretch.focus();
  const saved = nextSave(page);
  await page.keyboard.down(" ");
  await expect(stretch).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up(" ");
  await saved;
  const undone = nextSave(page);
  await stretch.click(); // undo
  await expect(stretch).toHaveAttribute("aria-pressed", "false");
  await undone;
  await page.reload();
  const read = habitKey(page, "Read 10 pages");
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(read.getByText("Keep holding…")).toBeVisible();
  await expect(page.getByText(HINT)).toHaveCount(0);
});

test("a lone click (VoiceOver, Switch Control) completes but isn't a real hold", async ({ page }) => {
  const stretch = habitKey(page, "Stretch for 5 minutes");
  // A click with no press before it, as assistive tech sends.
  const saved = nextSave(page);
  await stretch.dispatchEvent("click");
  await expect(stretch).toHaveAttribute("aria-pressed", "true");
  await saved;
  await page.reload();
  const read = habitKey(page, "Read 10 pages");
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(page.getByText(HINT)).toBeVisible();
});

test("a completion in Tap to complete mode isn't a real hold: the hint still comes back in hold mode", async ({ page }) => {
  await openSettings(page);
  const tapSwitch = page.getByRole("switch", { name: /Tap to complete/ });
  await tapSwitch.click();
  await page.getByRole("link", { name: /Done|Saving/ }).click();
  const stretch = habitKey(page, "Stretch for 5 minutes");
  await expect(stretch).toHaveAccessibleDescription(/Tap to complete/);
  await stretch.click();
  await expect(stretch).toHaveAttribute("aria-pressed", "true");
  await openSettings(page);
  await tapSwitch.click();
  await expect(tapSwitch).toHaveAttribute("aria-checked", "false");
  await page.getByRole("link", { name: /Done|Saving/ }).click();
  const read = habitKey(page, "Read 10 pages");
  await expect(read).toHaveAccessibleDescription(/Press and hold to complete/);
  await quickTap(page, read);
  await quickTap(page, read);
  await expect(page.getByText(HINT)).toBeVisible();
});

test("never with Tap to complete on: a tap just completes", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("switch", { name: /Tap to complete/ }).click();
  await page.getByRole("link", { name: /Done|Saving/ }).click();
  const read = habitKey(page, "Read 10 pages");
  await expect(read).toHaveAccessibleDescription(/Tap to complete/);
  await read.click();
  await expect(read).toHaveAttribute("aria-pressed", "true");
  await read.click(); // undo
  await expect(read).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(HINT)).toHaveCount(0);
});
