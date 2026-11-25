// Text enlarged to 200% (WCAG 1.4.4): Android's font size setting and
// Safari's text zoom do this. Every screen must still fit the phone's
// width, with nothing pushed past its right edge (plans/habit-tracker.md,
// Refinement pass). The layout is in rem, so a 200% root font size is the
// same as the browser's text size setting, except for media queries: their
// rem is the browser's default size, which a page style can't move (Today's
// 40rem date line; the "larger default text size" test sets it through the
// browser instead). Only looks: nothing is saved.

import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/saves";
import { expectManropeLoaded, freshDemo, habitKey, holdKey } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

async function expectFitsAtDoubleText(page: Page) {
  // Measured in the real font, never its fallback (Feature 9).
  await expectManropeLoaded(page);
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

  // The Climb (Feature 10): its readout, zone line, ruler and zone labels.
  await page.goto("/climb");
  await expect(page.getByTestId("ruler-you")).toBeVisible();
  await expectFitsAtDoubleText(page);
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
    await expectManropeLoaded(page);
    await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    expect(await columns(), `${width} px at ${textSize}%`).toBe(expected);
  }
});

test("habit names on Today never break inside a word, at any text size", async ({ page }) => {
  // With large text the key gets narrow for its name; the check then moves
  // above the name instead of words being cut ("Stretc / h", Feature 9).
  // The 200% check above can't see this: a cut word doesn't overflow.
  await freshDemo(page);
  for (const [width, textSize] of [
    [390, 100],
    [320, 100],
    [390, 150],
    [320, 150],
    [390, 175],
    [390, 200],
    [320, 200],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(habitKey(page, "Read 10 pages")).toBeVisible();
    await expectManropeLoaded(page);
    if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    const broken = await page.locator("button[aria-pressed] .text-habit").evaluateAll((names) =>
      names.flatMap((name) => {
        const text = name.firstChild as Text;
        const out: string[] = [];
        for (const match of text.data.matchAll(/\S+/g)) {
          const word = document.createRange();
          word.setStart(text, match.index!);
          word.setEnd(text, match.index! + match[0].length);
          if (new Set([...word.getClientRects()].map((r) => Math.round(r.top))).size > 1) out.push(match[0]);
        }
        return out;
      }),
    );
    expect(broken, `${width} px at ${textSize}%: words cut across lines`).toEqual([]);
  }
});

test("History's range switch keeps its labels inside the segment at 200% text", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/history?range=30");
  await expect(page.getByRole("button", { name: "30 days" })).toBeVisible();
  await expectManropeLoaded(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const tight = await page.locator('[aria-label="Range"] button').evaluateAll((buttons) =>
    buttons
      .map((button) => {
        const box = button.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(button);
        const lines = [...text.getClientRects()];
        const room = Math.min(...lines.map((l) => l.left - box.left), ...lines.map((l) => box.right - l.right));
        return { label: button.textContent, room };
      })
      // At least 6 px between the text and the segment's edge (it was 4).
      .filter((b) => b.room < 6)
      .map((b) => `${b.label}: ${b.room.toFixed(1)} px`),
  );
  expect(tight).toEqual([]);
});

test("History's numbers fit their columns with the widest values, in three columns", async ({ page }) => {
  // Streaks can reach back before the 90-day window, so three digits are
  // possible: "100%", "999 days" must fit three columns at normal text
  // (Feature 9: Manrope is wider). Set in the page, so the demo's numbers
  // don't decide. 340 px is the narrowest three-column phone width; 390 px
  // at 110% is just above the switch to one column.
  await freshDemo(page);
  for (const [width, textSize] of [
    [340, 100],
    [360, 100],
    [375, 100],
    [390, 100],
    [390, 110],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/history?range=30");
    await expect(page.getByRole("definition").first()).toBeVisible();
    await expectManropeLoaded(page);
    if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    const r = await page.getByRole("definition").evaluateAll((dds) => {
      dds.forEach((dd, i) => {
        dd.firstChild!.textContent = i === 0 ? "100%" : "999";
        const unit = dd.querySelector("span");
        if (unit) unit.textContent = "days";
      });
      return {
        columns: new Set(dds.map((dd) => Math.round(dd.getBoundingClientRect().left))).size,
        // The text's own width against its column (the dd grows with its
        // text instead of overflowing, so its scrollWidth can't tell).
        overflowing: dds
          .filter((dd) => {
            const text = document.createRange();
            text.selectNodeContents(dd);
            return text.getBoundingClientRect().width > dd.parentElement!.getBoundingClientRect().width + 0.5;
          })
          .map((dd) => dd.textContent),
      };
    });
    expect(r.columns, `${width} px at ${textSize}%: three columns`).toBe(3);
    expect(r.overflowing, `${width} px at ${textSize}%: every number fits its column`).toEqual([]);
  }
});

/**
 * Sets Today's date labels to `date` (so nothing depends on the day the tests
 * run) and measures the header. Call once Today is on screen.
 */
async function measureDate(page: Page, date: { full: string; short: string }) {
  return page.evaluate(async ({ full, short }) => {
    await document.fonts.ready;
    const fullEl = document.querySelector<HTMLElement>('[data-day-label="full"]')!;
    const shortEl = document.querySelector<HTMLElement>('[data-day-label="short"]')!;
    fullEl.textContent = full;
    shortEl.textContent = short;
    const layer = document.querySelector<HTMLElement>("[data-day-layer]")!;
    const slot = shortEl.parentElement!.getBoundingClientRect();
    const f = fullEl.getBoundingClientRect();
    const sh = shortEl.getBoundingClientRect();
    const spoken = document.querySelector<HTMLElement>('[data-day-label="spoken"]')!.getBoundingClientRect();
    const nav = document.querySelector("header nav")!.getBoundingClientRect();
    const drawn = getComputedStyle(layer).display !== "none";
    // Painted order at the short date's centre: which label is on top?
    const stack = document.elementsFromPoint(sh.left + sh.width / 2, sh.top + sh.height / 2);
    const fullIndex = stack.indexOf(fullEl);
    const fullOnFirstLine = drawn && f.top < slot.bottom - 1;
    return {
      drawn,
      fits: drawn && f.width <= slot.width + 0.5,
      fullOnFirstLine,
      // The label people see: the full date painted over the short one, or the short one.
      shows: fullIndex !== -1 && fullIndex < stack.indexOf(shortEl) ? "full" : stack.includes(shortEl) ? "short" : "none",
      visibleRight: Math.max(sh.right, fullOnFirstLine ? f.right : 0),
      slotRight: slot.right,
      shortFits: sh.width <= slot.width + 0.5,
      // The screen reader's copy covers the whole slot (found by touch).
      spokenCoversSlot: Math.abs(spoken.width - slot.width) < 1 && Math.abs(spoken.height - slot.height) < 1,
      pillsBeside: Math.abs(nav.top + nav.height / 2 - (slot.top + slot.height / 2)) < 2,
      viewport: document.documentElement.clientWidth,
    };
  }, date);
}

const DATES = [
  { full: "Wednesday, September 30", short: "Wed, Sep 30" }, // the longest there is
  { full: "Friday, May 1", short: "Fri, May 1" },
];

async function openToday(page: Page, width: number, textSize = 100) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  // Once streamed in (before that, the labels are in a hidden template).
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
  // Measured in the real font, never its fallback (Feature 9).
  await expectManropeLoaded(page);
}

test("Today's date: always short on phones, full on wider screens, never cut off, one date for screen readers", async ({ page }) => {
  await openToday(page, 390);
  // Screen readers get exactly one date, the full one.
  const real = await page.locator('[data-day-label="spoken"]').textContent();
  expect(real).toMatch(/^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}$/);
  await expect(page.locator("header p")).toMatchAriaSnapshot(`- paragraph: ${real}`);
  // And where the full-date layer is drawn (from 40rem), still one date.
  await openToday(page, 768);
  await expect(page.locator("header p")).toMatchAriaSnapshot(`- paragraph: ${real}`);

  // [width, text size, expected]: "short" and "full" are fixed answers,
  // "fit" is 8b's rule (full exactly when it fits), reached only by
  // text-only zoom on a wide screen. 639 / 640: the edge of 40rem.
  const cases: [number, number, "short" | "full" | "fit"][] = [
    ...[320, 360, 390, 430, 480, 600, 639].flatMap((w) => [[w, 100, "short"], [w, 200, "short"]] as [number, number, "short"][]),
    ...[640, 768, 1024].map((w) => [w, 100, "full"] as [number, number, "full"]),
    [640, 200, "fit"],
    [768, 200, "fit"],
  ];
  const fitSeen = new Set<string>();
  for (const [width, textSize, expected] of cases) {
    for (const date of DATES) {
      await openToday(page, width, textSize);
      const r = await measureDate(page, date);
      const where = `${date.full} at ${width} px, ${textSize}% text`;
      if (expected === "short") {
        expect(r.drawn, `${where}: the full date isn't drawn on a phone`).toBe(false);
        expect(r.shows, `${where}: the short date shows`).toBe("short");
      } else if (expected === "full") {
        expect(r.shows, `${where}: the full date shows`).toBe("full");
        expect(r.fits, `${where}: and fits`).toBe(true);
      } else {
        expect(r.drawn, `${where}: drawn`).toBe(true);
        expect(r.shows, `${where}: full exactly when it fits`).toBe(r.fits ? "full" : "short");
        expect(r.fullOnFirstLine, `${where}: on the visible line exactly when it fits`).toBe(r.fits);
        fitSeen.add(r.shows);
      }
      expect(r.shortFits, `${where}: short date fits`).toBe(true);
      expect(r.spokenCoversSlot, `${where}: the spoken copy is the slot's size`).toBe(true);
      expect(r.visibleRight, `${where}: nothing cut off`).toBeLessThanOrEqual(r.slotRight + 0.5);
      expect(r.slotRight, `${where}: inside the screen`).toBeLessThanOrEqual(r.viewport);
      if (textSize === 100) expect(r.pillsBeside, `${where}: pills beside the date`).toBe(true);
    }
  }
  // Text-only zoom really exercised both sides of 8b's rule.
  expect([...fitSeen].sort()).toEqual(["full", "short"]);
});

test("a larger default text size in the browser counts as a narrower screen: 768 px shows the short date", async ({ page }) => {
  // The browser's own setting (not a page style): it moves the 40rem line,
  // which is in the browser's default size. 32 px: 40rem = 1280 px.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32 } });
  await openToday(page, 768);
  const r = await measureDate(page, DATES[0]);
  expect(r.drawn).toBe(false);
  expect(r.shows).toBe("short");
  expect(r.visibleRight).toBeLessThanOrEqual(r.slotRight + 0.5);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the login page fits at 200% text", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expectFitsAtDoubleText(page);
  });
});
