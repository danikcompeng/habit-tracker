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

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the login page fits at 200% text", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expectFitsAtDoubleText(page);
  });
});
