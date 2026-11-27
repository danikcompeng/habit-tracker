// Today, with press-and-hold (plans/habit-tracker.md, Feature 3), on the
// real demo account. The sample habits (lib/demo-seed.ts) start as:
//   Drink a glass of water  done today, 12-day streak
//   Read 10 pages           not done, 4-day streak
//   Stretch for 5 minutes   not done, missed yesterday (Start today)
//   Walk outside            done today, 2-day streak
//   No phone in bed         not done, 1-day streak

import type { Locator, Page } from "@playwright/test";
import { expectNoA11yViolations, freshDemo, habitKey, holdKey } from "./helpers/app";
import { expect, nextSave, test } from "./helpers/saves";

test.beforeEach(async ({ page }) => {
  await freshDemo(page);
});

test("shows the sample habits with their streaks, and is accessible in light and dark", async ({ page }) => {
  await expect(habitKey(page, "Drink a glass of water")).toHaveAttribute("aria-pressed", "true");
  await expect(habitKey(page, "Drink a glass of water")).toContainText("12-day streak");
  await expect(habitKey(page, "Read 10 pages")).toContainText("4-day streak");
  await expect(habitKey(page, "Stretch for 5 minutes")).toContainText("Start today");
  await expect(page.getByText("2 of 5 done")).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
});

test("holding a key completes it: streak +1, and it's saved", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  const saved = nextSave(page);
  await holdKey(page, read, 800);
  await expect(read).toHaveAttribute("aria-pressed", "true");
  await expect(read).toContainText("5-day streak");
  await expect(page.getByText("3 of 5 done")).toBeVisible();
  // The key turned done before the save arrived (optimistic): wait for it.
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(habitKey(page, "Read 10 pages")).toHaveAttribute("aria-pressed", "true");
  await expect(habitKey(page, "Read 10 pages")).toContainText("5-day streak");
});

test("the last habit done turns the summary into the day's payoff, and the tab says which app", async ({ page }) => {
  await expect(page).toHaveTitle("Today · Ascend");
  const summary = page.getByText("2 of 5 done");
  await expect(summary).toHaveCSS("font-weight", "500");
  for (const name of ["Read 10 pages", "Stretch for 5 minutes", "No phone in bed"]) {
    const key = habitKey(page, name);
    await holdKey(page, key, 800);
    await expect(key).toHaveAttribute("aria-pressed", "true");
  }
  // Same words, more weight: ink, semibold, with a check before it.
  const allDone = page.getByText("All done for today", { exact: true });
  await expect(allDone).toBeVisible();
  await expect(allDone).toHaveCSS("font-weight", "600");
  await expect(allDone.locator("svg")).toHaveCount(1);
});

test("while a key is held, its streak caption is ink (grey would be too faint on the fill)", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  const caption = read.getByText("4-day streak");
  for (const [scheme, ink, muted] of [
    ["light", "rgb(42, 33, 26)", "rgb(107, 94, 82)"],
    ["dark", "rgb(243, 236, 226)", "rgb(180, 167, 151)"],
  ] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(caption).toHaveCSS("color", muted);
    const box = (await read.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Freeze the fill: the hold completes only when it finishes, so the
    // check can take as long as it likes without completing the habit.
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    await expect(caption).toHaveCSS("color", ink);
    // Slide away (a scroll): the hold is cancelled and the fill shrinks
    // back; the caption stays ink until it's gone, then turns grey.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 3 });
    await page.mouse.up();
    await expect(caption).toHaveCSS("color", ink);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    await expect(caption).toHaveCSS("color", muted);
    await expect(read).toHaveAttribute("aria-pressed", "false");
  }
});

test("a keyboard hold turns the caption ink too, and an early release teaches the gesture", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const read = habitKey(page, "Read 10 pages");
  const caption = read.getByText("4-day streak");
  await read.focus();
  await page.keyboard.down("Space");
  await expect(caption).toHaveCSS("color", "rgb(42, 33, 26)");
  await page.keyboard.up("Space");
  await expect(read.getByText("Keep holding…")).toBeVisible();
  await expect(read).toHaveAttribute("aria-pressed", "false");
});

test("leaving Today just after an early release doesn't leave the key half-way on coming back", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const read = habitKey(page, "Read 10 pages");
  await holdKey(page, read, 200);
  await expect(read.getByText("Keep holding…")).toBeVisible();
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(read.getByText("Keep holding…")).toHaveCount(0);
  await expect(read.getByText("4-day streak")).toHaveCSS("color", "rgb(107, 94, 82)");
  // And it still works.
  await holdKey(page, read, 800);
  await expect(read).toHaveAttribute("aria-pressed", "true");
});

test("letting go early doesn't complete it, and teaches the gesture", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  await holdKey(page, read, 300);
  await expect(read).toContainText("Keep holding");
  await expect(read).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(600); // well past the hold time: still not done
  await expect(read).toHaveAttribute("aria-pressed", "false");
});

test("moving while holding is a scroll, not a press", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  await holdKey(page, read, 800, { moveBy: 30 });
  await expect(read).toHaveAttribute("aria-pressed", "false");
});

test("tapping a done key undoes it: streak -1, saved", async ({ page }) => {
  const water = habitKey(page, "Drink a glass of water");
  const saved = nextSave(page);
  await water.click();
  await expect(water).toHaveAttribute("aria-pressed", "false");
  await expect(water).toContainText("11-day streak");
  // Reloading before the save answered once came back half old, half new
  // (done, with the undone streak): the flaky test of Feature 8c.
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(habitKey(page, "Drink a glass of water")).toHaveAttribute("aria-pressed", "false");
});

test("a long press on a done key doesn't undo it", async ({ page }) => {
  const water = habitKey(page, "Drink a glass of water");
  await holdKey(page, water, 900);
  await page.waitForTimeout(300);
  await expect(water).toHaveAttribute("aria-pressed", "true");
});

test("holding Space completes once and stays done", async ({ page }) => {
  const read = habitKey(page, "Read 10 pages");
  await read.focus();
  await page.keyboard.down(" ");
  await page.waitForTimeout(800);
  await page.keyboard.up(" ");
  await expect(read).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(400);
  await expect(read).toHaveAttribute("aria-pressed", "true");
});

// Tap to complete lives in Settings since Feature 8: e2e/settings.e2e.ts.

test("the signed-in account is shown, so a forged login link would be noticed", async ({ page }) => {
  await expect(page.getByText("Demo account")).toBeVisible();
});

/**
 * Records each Web Animation started on the page by the element's id
 * (Feature 10i's streak pulse). An init script, so a new document (a reload)
 * records from its very start, before the first render. Read with started().
 */
async function watchAnimate(page: Page) {
  const install = () => {
    const w = window as unknown as { __started: string[]; __watching?: boolean };
    w.__started = [];
    if (w.__watching) return;
    w.__watching = true;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      w.__started.push(this.id || this.tagName.toLowerCase());
      return animate.apply(this, args);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

function started(page: Page) {
  return page.evaluate(() => (window as unknown as { __started: string[] }).__started);
}

/** The key's two check layers (the empty ring, the filled disc): their opacity, filter and transition. */
function checkLayers(key: Locator) {
  return key.locator("[data-check]").evaluate((el) =>
    [...el.children].map((layer) => {
      const s = getComputedStyle(layer);
      return { opacity: Number(s.opacity), filter: s.filter, property: s.transitionProperty, duration: s.transitionDuration };
    }),
  );
}

test("Feature 10i: the check crossfades with a blur, both ways; the streak pulses once when it rises, never on undo or a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  const read = habitKey(page, "Read 10 pages");
  const streakId = (await read.getAttribute("aria-describedby"))!.split(" ")[0];
  await watchAnimate(page);
  // Open: the ring sharp, the disc faded and blurred; both ready to crossfade over 200 ms.
  let [ring, disc] = await checkLayers(read);
  expect(ring.opacity).toBe(1);
  expect(disc.opacity).toBe(0);
  expect(disc.filter).toContain("blur(2px)");
  for (const layer of [ring, disc]) {
    expect(layer.property).toMatch(/opacity/);
    expect(layer.property).toMatch(/filter/);
    expect(layer.property).toMatch(/scale/);
    expect(layer.duration).toBe("0.2s");
  }
  const saved = nextSave(page);
  await holdKey(page, read, 800);
  await saved;
  await expect(read).toContainText("5-day streak");
  await expect(read.locator("[data-check]")).toHaveAttribute("data-check", "done");
  await expect.poll(async () => (await checkLayers(read))[1].opacity).toBe(1);
  [ring, disc] = await checkLayers(read);
  expect(ring.opacity).toBe(0);
  expect(ring.filter).toContain("blur(2px)");
  expect(disc.filter).not.toContain("blur");
  // One pulse on the streak caption.
  expect((await started(page)).filter((id) => id === streakId)).toHaveLength(1);
  // To Climb and back (Today hidden, then shown again): the number didn't change, so no second pulse.
  await page.getByRole("link", { name: /^Altitude/ }).click();
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(read).toContainText("5-day streak");
  await page.waitForTimeout(500);
  expect((await started(page)).filter((id) => id === streakId)).toHaveLength(1);
  // Undo: the swap back, and no pulse (the number went down).
  const undone = nextSave(page);
  await read.click();
  await undone;
  await expect(read.locator("[data-check]")).toHaveAttribute("data-check", "open");
  await expect.poll(async () => (await checkLayers(read))[0].opacity).toBe(1);
  expect((await started(page)).filter((id) => id === streakId)).toHaveLength(1);
  // A reload shows the number as it is: no pulse (recorded from the new page's very start).
  await page.reload();
  await expect(habitKey(page, "Read 10 pages")).toContainText("4-day streak");
  await page.waitForTimeout(500);
  expect((await started(page)).filter((id) => id === streakId)).toHaveLength(0);
});

test("Feature 10i, Reduce Motion: the check swaps at once and the streak doesn't pulse", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const read = habitKey(page, "Read 10 pages");
  const streakId = (await read.getAttribute("aria-describedby"))!.split(" ")[0];
  await watchAnimate(page);
  for (const layer of await checkLayers(read)) expect(layer.duration).toBe("0s");
  const saved = nextSave(page);
  await holdKey(page, read, 800);
  await saved;
  await expect(read).toContainText("5-day streak");
  expect((await started(page)).filter((id) => id === streakId)).toHaveLength(0);
});
