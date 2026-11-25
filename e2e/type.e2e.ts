// The typeface (plans/habit-tracker.md, Feature 9): Manrope everywhere,
// nothing heavier than 700, the large headings and the wordmark slightly
// tight, and the right figures (proportional streaks and big numbers, tabular percentages in a column). On every main
// screen; only looks, nothing is saved.

import type { Page } from "@playwright/test";
import { expectManropeLoaded, freshDemo } from "./helpers/app";
import { expect, test } from "./helpers/saves";

/** Every element's computed weight: none may be over 700. */
async function heaviest(page: Page) {
  return page.evaluate(() => {
    let max = 0;
    let where = "";
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (!el.textContent?.trim()) continue;
      const weight = Number(getComputedStyle(el).fontWeight);
      if (weight > max) {
        max = weight;
        where = `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`;
      }
    }
    return { max, where };
  });
}

/** letter-spacing as a share of the font size (computed values are in px). */
async function tracking(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const style = getComputedStyle(el);
    // "normal" is no extra spacing.
    const spacing = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing);
    return spacing / parseFloat(style.fontSize);
  });
}

/**
 * Which figures are really drawn. Tabular: "111" and "000" are the same width
 * in the element's own font; proportional: "111" is narrower. The probe copies family, weight, size and stretch one
 * by one (the computed `font` shorthand is empty when the numbers are
 * tabular). Control: without tabular figures "111" must be narrower, which
 * is true of Manrope and not of its Arial fallback, so it proves which font
 * was measured.
 */
async function expectFigures(page: Page, selector: string, kind: "tabular" | "proportional") {
  const elements = page.locator(selector);
  const count = await elements.count();
  expect(count, `${selector}: found`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const r = await elements.nth(i).evaluate((el) => {
      const style = getComputedStyle(el);
      const width = (text: string, numeric = style.fontVariantNumeric) => {
        const probe = document.createElement("span");
        probe.textContent = text;
        Object.assign(probe.style, {
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "nowrap",
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontSize: style.fontSize,
          fontStretch: style.fontStretch,
          fontVariantNumeric: numeric,
          letterSpacing: style.letterSpacing,
        });
        document.body.append(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return w;
      };
      return {
        numeric: style.fontVariantNumeric,
        ones: width("111"),
        zeros: width("000"),
        proportionalOnes: width("111", "normal"),
        proportionalZeros: width("000", "normal"),
        text: el.textContent,
      };
    });
    expect(r.proportionalZeros - r.proportionalOnes, `"${r.text}": measured in Manrope (proportional 1s are narrower)`).toBeGreaterThan(1);
    if (kind === "tabular") {
      expect(r.numeric, `"${r.text}" is tabular`).toContain("tabular-nums");
      expect(Math.abs(r.ones - r.zeros), `"${r.text}": 111 and 000 draw at the same width`).toBeLessThan(0.5);
    } else {
      expect(r.numeric, `"${r.text}" is proportional`).not.toContain("tabular-nums");
      expect(r.zeros - r.ones, `"${r.text}": 1s drawn narrower than 0s, so "12" reads tight`).toBeGreaterThan(1);
    }
  }
}

test("Today, History, Habits and Settings are set in Manrope, no heavier than 700, with tight titles, and the right figures", async ({ page }) => {
  await freshDemo(page);
  for (const [url, title] of [
    ["/", "Today"],
    ["/history?range=30", "History"],
    ["/habits", "Habits"],
    ["/settings", "Settings"],
    ["/climb", "Climb"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expectManropeLoaded(page);
    const weight = await heaviest(page);
    expect(weight.max, `${url}: the heaviest text (${weight.where})`).toBeLessThanOrEqual(700);
    expect(await tracking(page, "h1"), `${url}: the title's letter-spacing`).toBeCloseTo(-0.03, 3);
  }

  // Proportional figures for Today's streaks and History's three big
  // numbers (so "12" and "71%" read tight); tabular only where numbers line
  // up in a column: History's per-habit percentages (Feature 9, the user's call).
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expectManropeLoaded(page);
  await expectFigures(page, '[id$="-streak"]', "proportional");
  await page.goto("/history?range=30");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expectManropeLoaded(page);
  await expectFigures(page, "dd", "proportional");
  await expectFigures(page, '[aria-labelledby="habits-title"] li span.text-list.shrink-0', "tabular");
  expect(await tracking(page, "dd"), "History's numbers' letter-spacing").toBeCloseTo(-0.025, 3);
  // Their unit ("days", 16 px) doesn't inherit the number's tight spacing.
  expect(await tracking(page, "dd span"), "the unit's letter-spacing").toBeCloseTo(0, 3);
  // Section headings stay a level above the 18 / 600 names under them.
  for (const name of ["Day by day", "Each habit"]) await expect(page.getByRole("heading", { name, level: 2 })).toHaveCSS("font-weight", "700");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Completing habits", level: 2 })).toHaveCSS("font-weight", "700");
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the login page: Manrope, the wordmark at 700 and -0.04em", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Ascend" })).toBeVisible();
    await expectManropeLoaded(page);
    const weight = await heaviest(page);
    expect(weight.max, `the heaviest text (${weight.where})`).toBeLessThanOrEqual(700);
    const wordmark = page.getByRole("heading", { name: "Ascend" });
    await expect(wordmark).toHaveCSS("font-weight", "700");
    expect(await tracking(page, "h1"), "the wordmark's letter-spacing").toBeCloseTo(-0.04, 3);
  });
});
