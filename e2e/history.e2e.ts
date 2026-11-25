// History (plans/habit-tracker.md, Feature 7), on the real demo account.
// The expected numbers come from the same sample data the demo is seeded
// with (lib/demo-seed.ts), counted by lib/history.ts: so this checks that
// what the database returns and the page shows add up to the same thing.

import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/saves";
import { expectNoA11yViolations, freshDemo } from "./helpers/app";
import { localToday, reseedDemo } from "./helpers/seed";
import { demoSeedPayload } from "../lib/demo-seed";
import { buildHistory, dayCount, dayReadout, shortDate, summarySentence, toHistoryHabits, windowStart, type Range } from "../lib/history";
import { currentStreak } from "../lib/streaks";

function expected(range: Range) {
  const { timeZone, today } = localToday();
  const from = windowStart(today);
  const rows = demoSeedPayload(today, timeZone).map((h, i) => ({
    habit_id: String(i),
    name: h.name,
    created_at: h.created_at,
    days: h.days.filter((d) => d >= from),
    lead_in: 0,
    current_streak: currentStreak(h.days, today),
  }));
  return buildHistory(toHistoryHabits(rows, timeZone), today, range);
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

async function expectRange(page: Page, range: Range) {
  const view = expected(range);
  await expect(page.getByRole("button", { name: `${range} days` })).toHaveAttribute("aria-pressed", "true");
  const numbers = page.locator("dl");
  await expect(numbers).toContainText(`Completed${view.percent}%`);
  await expect(numbers).toContainText(`Current streak, best habit${days(view.bestNow)}`);
  await expect(numbers).toContainText(`Longest streak${days(view.longest)}`);
  await expect(page.getByText(summarySentence(view))).toBeVisible();
  // The hidden table: one row per day, today last.
  await expect(page.locator("table tbody tr")).toHaveCount(range);
  await expect(page.locator("table tbody tr").last()).toContainText(`Today`);
  return view;
}

function chart(page: Page) {
  return page.getByRole("region", { name: "Day by day" });
}

test.describe("with the sample habits", () => {
  test.beforeEach(async ({ page }) => {
    await freshDemo(page);
  });

  test("opens from Today on 30 days, switches to 7 and 90, and is accessible in light and dark", async ({ page }) => {
    await page.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
    await expectRange(page, 30);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectNoA11yViolations(page);
    }

    for (const range of [7, 90] as const) {
      await page.getByRole("button", { name: `${range} days` }).click();
      await expect(page).toHaveURL(new RegExp(`/history\\?range=${range}$`));
      const view = await expectRange(page, range);
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expectNoA11yViolations(page);
      }
      if (range === 90) {
        // Stretch was added mid-range: it says when.
        const stretch = view.habits.find((h) => h.name === "Stretch for 5 minutes")!;
        await expect(page.getByText(`Added ${shortDate(stretch.addedOn!)}`, { exact: true })).toBeVisible();
        // The hidden 90-row table must not stretch the page into blank scroll
        // (a table ignores height: 1px).
        const blank = await page.evaluate(() => {
          // History's own list: hidden pages kept alive by <Activity> have lists too.
          const last = document.querySelector('[aria-labelledby="habits-title"] li:last-child')!;
          return document.documentElement.scrollHeight - (last.getBoundingClientRect().bottom + window.scrollY);
        });
        expect(blank).toBeLessThan(80);
        await expect(page.getByText(`Stretch for 5 minutes: ${stretch.done} of ${stretch.counted} days done, ${stretch.percent}%.`)).toBeAttached();
      }
    }

    // A reload keeps the range; switching didn't pile up history, so Back is Today.
    await page.reload();
    await expectRange(page, 90);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("odd ?range values fall back: anything unknown is 30, a repeat takes the first", async ({ page }) => {
    await page.goto("/history?range=abc");
    await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/history?range=7&range=90");
    await expect(page.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  test("bars only grow on a switch, and never with Reduce Motion", async ({ page }) => {
    // The layer of bars (the one element that animates).
    const bars = chart(page).locator(".origin-bottom");
    const animation = () => bars.evaluate((g) => getComputedStyle(g).animationName);
    await page.goto("/history");
    expect(await animation()).toBe("none"); // first load: nothing moves on its own
    await page.getByRole("button", { name: "7 days" }).click();
    expect(await animation()).toBe("bar-grow");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "90 days" }).click();
    expect(await animation()).toBe("none");
  });

  test("leaving and coming back starts on today again", async ({ page }) => {
    await page.goto("/history");
    const readout = chart(page).locator("p").first();
    await page.getByRole("slider", { name: "Choose a day" }).focus();
    await page.keyboard.press("Home");
    await expect(readout).not.toContainText("Today");
    await page.getByRole("link", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("link", { name: "History" }).click();
    await expect(readout).toContainText("Today");
  });

  test("the slider and the pointer pick a day; the readout says its date and count", async ({ page }) => {
    await page.goto("/history");
    const view = expected(30);
    const readout = chart(page).locator("p").first();
    await expect(readout).toHaveText(`Today${dayCount(view.days[29])}`);

    // Keyboard (and VoiceOver: a native slider).
    const slider = page.getByRole("slider", { name: "Choose a day" });
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(readout).toHaveText(`Yesterday${dayCount(view.days[28])}`);
    await expect(slider).toHaveAttribute("aria-valuetext", new RegExp(`: ${dayCount(view.days[28])}$`));
    await page.keyboard.press("Home");
    await expect(readout).toHaveText(`${dayReadout(view.days[0].day, view.today)}${dayCount(view.days[0])}`);

    // Hover over the first bar, then the last.
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
    await expect(readout).toHaveText(`Today${dayCount(view.days[29])}`);
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await expect(readout).toHaveText(`${dayReadout(view.from, view.today)}${dayCount(view.days[0])}`);
  });
});

test.describe("empty states", () => {
  // These empty the SHARED demo. First prove the samples can be put back
  // (before the History migration, they can't: the 90-day seed is refused),
  // so a test never empties a demo it can't restore; then always restore.
  test.beforeEach(async () => {
    await reseedDemo();
  });
  test.afterEach(async () => {
    await reseedDemo();
  });

  test("no habits: says so and links to adding one", async ({ page }) => {
    await reseedDemo([]);
    await page.goto("/history");
    await expect(page.getByText("No habits yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a habit" })).toHaveAttribute("href", "/habits");
    await expect(page.getByRole("button", { name: "30 days" })).toHaveCount(0);
    await expectNoA11yViolations(page);
  });

  test("a habit made today, nothing done: the history starts today", async ({ page }) => {
    await reseedDemo([{ name: "Brand new", created_at: new Date().toISOString(), days: [] }]);
    await page.goto("/history");
    await expect(page.getByText("Your history starts today.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
