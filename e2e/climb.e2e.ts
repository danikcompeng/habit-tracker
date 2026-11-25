// The Climb (plans/habit-tracker.md, Feature 10) on the demo account: the
// strip on Today, the Climb screen, the lift, the one-time zone moment.
// The expected heights come from lib/altitude.ts and the demo's own sample
// data, the same rule the database's habit_altitude() follows.

import type { Page } from "@playwright/test";
import { altitudeOf, dailyClimbCm, metres, nextZone, zoneAt } from "../lib/altitude";
import { addDays, todayIn } from "../lib/dates";
import { demoSeedPayload } from "../lib/demo-seed";
import { expectNoA11yViolations, freshDemo, habitKey, holdKey } from "./helpers/app";
import { expect, nextSave, test } from "./helpers/saves";
import { localToday, reseedDemo } from "./helpers/seed";

/** The demo's altitude as the sample data says, in centimetres. */
function demoAltitude() {
  const { timeZone, today } = localToday();
  const habits = demoSeedPayload(today, timeZone).map((h) => ({ createdDay: todayIn(timeZone, new Date(h.created_at)), days: h.days }));
  return { ...altitudeOf(habits, today), habits: habits.length };
}

const strip = (page: Page) => page.getByRole("link", { name: /^Altitude/ });

/**
 * Forget the zones celebrated on this device: any earlier visit to the demo
 * (~7,100 m) remembered "Above the clouds" and would hide a lower zone's
 * moment. Needs the app's origin, so it visits a page without the climb.
 */
async function forgetZones(page: Page) {
  await page.goto("/settings");
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("climb-zone:")) localStorage.removeItem(key);
  });
}

/** Any two of these overlap (by more than a pixel)? Returns the pairs that do. */
async function overlaps(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((els) => {
    const boxes = els.map((el) => ({ text: el.textContent?.trim() ?? "", r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0);
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) out.push(`"${boxes[i].text}" × "${boxes[j].text}"`);
      }
    }
    return out;
  });
}

test("Today's strip shows the demo's altitude and zone, is named by its own words, and opens Climb", async ({ page }) => {
  await freshDemo(page);
  const { altitudeCm } = demoAltitude();
  const zone = zoneAt(altitudeCm).name;
  await expect(strip(page)).toHaveAccessibleName(`Altitude ${metres(altitudeCm)} ${zone} Climb`);
  await expect(strip(page)).toHaveAttribute("href", "/climb");

  // The keys stay the hero: the first four fully above the fold at 390 × 844.
  const fourth = await page.getByRole("list", { name: "Habits" }).getByRole("listitem").nth(3).boundingBox();
  expect(fourth!.y + fourth!.height).toBeLessThanOrEqual(844);

  await strip(page).click();
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("Climb · Ascend");
  await expect(page.getByText(metres(altitudeCm), { exact: true }).first()).toBeVisible();
  const next = nextZone(altitudeCm)!;
  await expect(page.getByText(`${zone} · ${next.metres.toLocaleString("en-US")} m to ${next.zone.name}`)).toBeVisible();
  // The zones, for everyone; the ruler's own chip shows where you are.
  await expect(page.getByRole("list", { name: "Zones" }).getByRole("listitem")).toHaveCount(8);
  await expect(page.getByTestId("ruler-you")).toHaveText(metres(altitudeCm));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
});

test("the Climb screen opens on your marker, inside its own scrolling window", async ({ page }) => {
  await freshDemo(page);
  await strip(page).click();
  const window = page.getByRole("region", { name: /^The climb/ });
  await expect(page.getByTestId("ruler-you")).toBeVisible();
  const box = (await window.boundingBox())!;
  const you = (await page.getByTestId("ruler-you").boundingBox())!;
  expect(you.y).toBeGreaterThan(box.y);
  expect(you.y + you.height).toBeLessThan(box.y + box.height);
  expect(await window.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // The heading and Done stay on screen.
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeInViewport();
});

test("completing a habit lifts the altitude by its share of the day; undo brings it back", async ({ page }) => {
  await freshDemo(page);
  const { altitudeCm, beforeTodayCm, habits } = demoAltitude();
  // The demo starts with 2 of 5 done today.
  const after = beforeTodayCm + dailyClimbCm(3, habits);
  const read = habitKey(page, "Read 10 pages");
  const saved = nextSave(page);
  await holdKey(page, read, 800);
  await expect(strip(page)).toHaveAccessibleName(new RegExp(`^Altitude ${metres(after)} `));
  await saved;
  const undone = nextSave(page);
  await read.click();
  await expect(strip(page)).toHaveAccessibleName(new RegExp(`^Altitude ${metres(altitudeCm)} `));
  await undone;
});

test("the zone moment: once, after the save, with the right words, and never again", async ({ page }) => {
  // One habit, perfect for the last nine days: 1,350 m. Today's hold adds
  // 150 m, to exactly 1,500 m: Treeline.
  const { today } = localToday();
  await reseedDemo([
    {
      name: "Climb a little",
      created_at: new Date(`${addDays(today, -9)}T12:00:00Z`).toISOString(),
      days: Array.from({ length: 9 }, (_, i) => addDays(today, -9 + i)),
    },
  ]);
  try {
    await forgetZones(page);
    await page.goto("/");
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,350 m Forest/);
    const key = habitKey(page, "Climb a little");
    const saved = nextSave(page);
    await holdKey(page, key, 800);
    await saved;
    const card = page.getByRole("button", { name: /New zone Treeline/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText("+150 m · up to 1,500 m");
    await expect(page.getByRole("status").filter({ hasText: "New zone: Treeline." })).toBeAttached();
    await card.click();
    await expect(card).toHaveCount(0);

    // Undo below Treeline and complete again: no second card.
    const undone = nextSave(page);
    await key.click();
    await undone;
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,350 m Forest/);
    const again = nextSave(page);
    await holdKey(page, key, 800);
    await again;
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,500 m Treeline/);
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);

    // Nor after a reload: undo below Treeline and climb back again.
    await page.reload();
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,500 m Treeline/);
    const undoneAgain = nextSave(page);
    await key.click();
    await undoneAgain;
    const redone = nextSave(page);
    await holdKey(page, key, 800);
    await redone;
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,500 m Treeline/);
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);
  } finally {
    await reseedDemo();
  }
});

test("the chips on the strip and on Climb never overlap: 320 px, and 200% text", async ({ page }) => {
  await freshDemo(page);
  for (const [width, textSize] of [
    [320, 100],
    [390, 200],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(strip(page)).toBeVisible();
    if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    expect(await overlaps(page, 'a[href="/climb"] .bg-surface'), `${width} px, ${textSize}%: the strip`).toEqual([]);
    await page.goto("/climb");
    await expect(page.getByTestId("ruler-you")).toBeVisible();
    if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    const chips = '[role="region"] .bg-surface:not([aria-hidden="true"].w-px), [role="region"] li:not(.sr-only), [data-testid="ruler-you"]';
    expect(await overlaps(page, chips), `${width} px, ${textSize}%: Climb's chips`).toEqual([]);
  }
});

/** Colours on a scene canvas that aren't one of the --scene-* tokens (as the browser resolves them). */
async function strayColours(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluate((el) => {
    const probe = document.createElement("canvas").getContext("2d")!;
    const style = getComputedStyle(document.documentElement);
    const tokens = new Set<string>();
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (!name.startsWith("--scene-")) continue;
      probe.fillStyle = style.getPropertyValue(name).trim();
      tokens.add(String(probe.fillStyle).toLowerCase());
    }
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const stray = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      const hex = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      if (!tokens.has(hex)) stray.add(hex);
    }
    return [...stray];
  });
}

test("every pixel of the scene is one of its colour tokens, in light and dark (none unread, none invented)", async ({ page }) => {
  await freshDemo(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.waitForTimeout(400);
    expect(await strayColours(page, 'canvas[data-scene="close"]'), `the strip, ${colorScheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await strip(page).click();
  await expect(page.getByTestId("ruler-you")).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.waitForTimeout(400);
    expect(await strayColours(page, 'canvas[data-scene="world"]'), `Climb, ${colorScheme}`).toEqual([]);
  }
});

test("Reduce Motion: the scene stands still; with motion, its clouds drift", async ({ page }) => {
  await freshDemo(page);
  const canvas = page.locator('canvas[data-scene="close"]');
  await expect(canvas).toBeVisible();
  const frame = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  const still = await frame();
  await page.waitForTimeout(1_500);
  expect(await frame()).toBe(still);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const start = await frame();
  await expect.poll(frame, { timeout: 5_000 }).not.toBe(start);
});
