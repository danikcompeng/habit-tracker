// Text enlarged to 200% (WCAG 1.4.4): Android's font size setting and
// Safari's text zoom do this. Every screen must still fit the phone's
// width, with nothing pushed past its right edge (plans/habit-tracker.md,
// Refinement pass). The layout is in rem, so a 200% root font size is the
// same as the browser's text size setting. Only looks: nothing is saved.

import { expect, test, type Page } from "@playwright/test";
import { freshDemo, habitKey, holdKey } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

async function expectFitsAtDoubleText(page: Page) {
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > width) out.push(`page scrolls sideways by ${document.documentElement.scrollWidth - width}px`);
    for (const el of document.querySelectorAll<HTMLElement>("h1, h2, p, a, button, label, dt, dd, input, li > span")) {
      if (el.closest(".sr-only")) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > width + 1) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ends at ${Math.round(box.right)}px`);
      // Text wider than its own box: clipped, or spilling over a neighbour
      // (History's numbers once overlapped like this), whatever the overflow.
      // (Text boxes scroll their own text by design, so they're left out.)
      if (el.tagName !== "INPUT" && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" is wider than its box`);
    }
    return out;
  });
  expect(problems).toEqual([]);
}

test("Today (with the Tap to complete hint), Settings, Habits (with the editor and its question) and History fit at 200% text", async ({ page }) => {
  await freshDemo(page);
  // With the Tap to complete hint showing (two quick taps).
  for (let i = 0; i < 2; i++) await holdKey(page, habitKey(page, "Read 10 pages"), 60);
  await expect(page.getByText("Hold to complete, or turn on")).toBeVisible();
  await expectFitsAtDoubleText(page);

  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: /Tap to complete/ })).toBeVisible();
  await expectFitsAtDoubleText(page);

  await page.goto("/habits");
  await page.getByRole("button", { name: "Edit Read 10 pages" }).click();
  await page.getByRole("button", { name: "Delete habit" }).click();
  await expectFitsAtDoubleText(page);

  for (const range of [30, 90]) {
    await page.goto(`/history?range=${range}`);
    await expect(page.getByRole("button", { name: `${range} days` })).toHaveAttribute("aria-pressed", "true");
    await expectFitsAtDoubleText(page);
  }
});

test("the empty states fit at 200% text", async ({ page }) => {
  await freshDemo(page);
  try {
    // Prove the samples can be put back before emptying the shared demo.
    await reseedDemo();
    await reseedDemo([]);
    for (const url of ["/", "/habits", "/history"]) {
      await page.goto(url);
      await expect(page.getByText("No habits yet.")).toBeVisible();
      await expectFitsAtDoubleText(page);
    }
  } finally {
    await reseedDemo();
  }
});

test("History's numbers are three columns or one, never 2 + 1", async ({ page }) => {
  await freshDemo(page);
  const columns = async () =>
    page.getByRole("definition").evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size);
  for (const [width, textSize, expected] of [
    [390, 100, 3],
    [375, 100, 3],
    [360, 100, 3],
    [320, 100, 1],
    [390, 125, 1],
    [390, 150, 1],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/history?range=30");
    await expect(page.getByRole("definition").first()).toBeVisible();
    await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    expect(await columns(), `${width} px at ${textSize}%`).toBe(expected);
  }
});

test("Today's date: the full one when it fits beside the pills, the short one otherwise, never cut off", async ({ page }) => {
  // By geometry, and independent of the day the tests run: the labels are
  // set in the page to the longest date there is and a short one. (The date
  // layer clips by design, so the generic check above doesn't look at it.)
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  // Screen readers get exactly one date, the full one.
  const real = await page.locator('[data-day-label="spoken"]').textContent();
  expect(real).toMatch(/^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}$/);
  await expect(page.locator("header p")).toMatchAriaSnapshot(`- paragraph: ${real}`);
  const dates = [
    { full: "Wednesday, September 30", short: "Wed, Sep 30" },
    { full: "Friday, May 1", short: "Fri, May 1" },
  ];
  const seen = new Set<string>();
  for (const width of [320, 360, 390, 430]) {
    for (const textSize of [100, 200]) {
      for (const date of dates) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
        await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
        const r = await page.evaluate(async ({ full, short }) => {
          await document.fonts.ready;
          const fullEl = document.querySelector<HTMLElement>('[data-day-label="full"]')!;
          const shortEl = document.querySelector<HTMLElement>('[data-day-label="short"]')!;
          fullEl.textContent = full;
          shortEl.textContent = short;
          const slot = shortEl.parentElement!.getBoundingClientRect();
          const f = fullEl.getBoundingClientRect();
          const sh = shortEl.getBoundingClientRect();
          const nav = document.querySelector("header nav")!.getBoundingClientRect();
          const spoken = document.querySelector<HTMLElement>('[data-day-label="spoken"]')!.getBoundingClientRect();
          // Painted order at the short date's centre: is the full date over it?
          const stack = document.elementsFromPoint(sh.left + sh.width / 2, sh.top + sh.height / 2);
          const fullIndex = stack.indexOf(fullEl);
          return {
            fits: f.width <= slot.width + 0.5,
            fullOnFirstLine: f.top < slot.bottom - 1,
            fullOnTop: fullIndex !== -1 && fullIndex < stack.indexOf(shortEl),
            // The screen reader's copy covers the whole slot (found by touch).
            spokenCoversSlot: Math.abs(spoken.width - slot.width) < 1 && Math.abs(spoken.height - slot.height) < 1,
            visibleRight: Math.max(sh.right, f.top < slot.bottom - 1 ? f.right : 0),
            slotRight: slot.right,
            shortFits: sh.width <= slot.width + 0.5,
            pillsBeside: Math.abs(nav.top + nav.height / 2 - (slot.top + slot.height / 2)) < 2,
            viewport: document.documentElement.clientWidth,
          };
        }, date);
        const where = `${date.full} at ${width} px, ${textSize}% text`;
        expect(r.fullOnFirstLine, `${where}: full date shown exactly when it fits`).toBe(r.fits);
        expect(r.fullOnTop, `${where}: the copy on top`).toBe(r.fits);
        expect(r.shortFits, `${where}: short date fits`).toBe(true);
        expect(r.spokenCoversSlot, `${where}: the spoken copy is the slot's size`).toBe(true);
        expect(r.visibleRight, `${where}: nothing cut off`).toBeLessThanOrEqual(r.slotRight + 0.5);
        expect(r.slotRight, `${where}: inside the screen`).toBeLessThanOrEqual(r.viewport);
        if (textSize === 100) expect(r.pillsBeside, `${where}: pills beside the date`).toBe(true);
        seen.add(r.fits ? "full" : "short");
      }
    }
  }
  // Both forms were really exercised.
  expect([...seen].sort()).toEqual(["full", "short"]);
});

test("at 390 px the longest date is short, a short one is full", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // Once streamed in (before that, the label is in a hidden template).
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const fits = async (full: string) =>
    page.evaluate(async (text) => {
      await document.fonts.ready;
      const fullEl = document.querySelector<HTMLElement>('[data-day-label="full"]')!;
      fullEl.textContent = text;
      return fullEl.getBoundingClientRect().top < fullEl.parentElement!.parentElement!.getBoundingClientRect().bottom - 1;
    }, full);
  expect(await fits("Wednesday, September 30")).toBe(false);
  expect(await fits("Friday, May 1")).toBe(true);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the login page fits at 200% text", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expectFitsAtDoubleText(page);
  });
});
