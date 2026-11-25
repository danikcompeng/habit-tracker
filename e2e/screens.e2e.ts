// Screenshots for the design-critic and the case study, in light and dark,
// at iPhone size (390 x 844 @3x). Saved to docs/screenshots/<feature>/.
// Run against a production build, so no dev tools appear in the shots:
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 npm run screens -- -g "today"

import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/saves";
import { freshDemo, habitKey } from "./helpers/app";
import { localToday, reseedDemo } from "./helpers/seed";
import { addDays } from "../lib/dates";

const SCHEMES = ["light", "dark"] as const;

async function settle(page: Page) {
  // Fonts loaded and colour transitions (150-250 ms) finished, or the shot
  // catches buttons halfway between the light and dark colours.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function shoot(page: Page, folder: string, name: string, options: { fullPage?: boolean } = {}) {
  // Wait until React has taken over the page (hydrated): a screenshot
  // before that would touch the page and confuse it.
  await page.waitForLoadState("networkidle");
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await settle(page);
    await page.screenshot({ path: `docs/screenshots/${folder}/${name}-${scheme}.png`, fullPage: options.fullPage });
  }
}

async function hold(page: Page, name: string) {
  const key = habitKey(page, name);
  await key.scrollIntoViewIfNeeded();
  const box = (await key.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(key).toHaveAttribute("aria-pressed", "true");
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

test("login screens", async ({ page }) => {
  const folder = "feature-2";
  await page.goto("/login");
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await shoot(page, folder, "login-email");

  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(/Enter your email address/)).toBeVisible();
  await shoot(page, folder, "login-email-error");

  await page.getByRole("textbox", { name: "Email" }).fill("you@example.com");
  await page.getByRole("button", { name: "I already have a code" }).click();
  await expect(page.getByRole("textbox", { name: "Code from the email" })).toBeVisible();
  await shoot(page, folder, "login-code");
});
});

test("today screens", async ({ page }) => {
  const folder = "feature-3";
  await freshDemo(page);
  await shoot(page, folder, "today");

  // Mid-hold: the fill about halfway (with full motion, so the circle shows).
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "no-preference" });
    await settle(page);
    const box = (await habitKey(page, "Read 10 pages").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(330);
    await page.screenshot({ path: `docs/screenshots/${folder}/today-mid-hold-${scheme}.png` });
    // Cancel: slide away like a scroll, then let go.
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2 + 40, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await hold(page, "Read 10 pages");
  await shoot(page, folder, "today-one-more-done");

  await hold(page, "Stretch for 5 minutes");
  await hold(page, "No phone in bed");
  await expect(page.getByText("All done for today")).toBeVisible();
  await shoot(page, folder, "today-all-done");
  await page.mouse.wheel(0, 2000);
  await shoot(page, folder, "today-footer");
});

test("habits screens", async ({ page }) => {
  const folder = "feature-4";
  await freshDemo(page);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Habits" })).toBeVisible();
  await shoot(page, folder, "habits");

  await page.getByRole("button", { name: "Edit Read 10 pages" }).click();
  await shoot(page, folder, "habits-editor");
  await page.getByRole("button", { name: "Delete habit" }).click();
  await shoot(page, folder, "habits-delete-confirm");
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Arrange" }).click();
  await shoot(page, folder, "habits-arrange");
  await page.getByRole("button", { name: "Done arranging" }).click();

  // Empty: delete them all, then Today's empty state too.
  for (const name of ["Drink a glass of water", "Read 10 pages", "Stretch for 5 minutes", "Walk outside", "No phone in bed"]) {
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByRole("button", { name: "Delete habit" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("button", { name: `Edit ${name}` })).toHaveCount(0);
  }
  await shoot(page, folder, "habits-empty");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("No habits yet.")).toBeVisible();
  await shoot(page, "feature-3", "today-empty");

  // Put the shared demo back, so the next visitor doesn't find it empty.
  await reseedDemo();
});

test("history screens", async ({ page }) => {
  const folder = "feature-7";
  await freshDemo(page);
  // Today's header, now with History beside Edit.
  await shoot(page, folder, "today-header");

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await shoot(page, folder, "history-30");
  await shoot(page, folder, "history-30-full", { fullPage: true });

  // Pointing at a day about a third of the way in.
  const box = (await page.getByRole("slider", { name: "Choose a day" }).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
  await shoot(page, folder, "history-30-scrub");
  await page.mouse.move(0, 0);

  for (const range of [7, 90] as const) {
    await page.getByRole("button", { name: `${range} days` }).click();
    await expect(page.getByRole("button", { name: `${range} days` })).toHaveAttribute("aria-pressed", "true");
    await shoot(page, folder, `history-${range}`);
    await shoot(page, folder, `history-${range}-full`, { fullPage: true });
  }

  try {
    // Prove the samples can be put back before emptying the shared demo.
    await reseedDemo();
    await reseedDemo([]);
    await page.goto("/history");
    await expect(page.getByText("No habits yet.")).toBeVisible();
    await shoot(page, folder, "history-empty");

    await reseedDemo([{ name: "Brand new", created_at: new Date().toISOString(), days: [] }]);
    await page.goto("/history");
    await expect(page.getByText("Your history starts today.")).toBeVisible();
    await shoot(page, folder, "history-starts-today");
  } finally {
    // Put the shared demo back, even if a step failed.
    await reseedDemo();
  }
});

test("text at 200% screens", async ({ page }) => {
  // The refinement pass (plans/habit-tracker.md): every screen with text
  // enlarged to 200%, full page, light only.
  const folder = "impeccable-after";
  const big = async (name: string) => {
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await settle(page);
    await page.screenshot({ path: `docs/screenshots/${folder}/${name}-text200.png`, fullPage: true });
  };
  await freshDemo(page);
  await big("today");
  await page.goto("/habits");
  await page.getByRole("button", { name: "Edit Read 10 pages" }).click();
  await page.getByRole("button", { name: "Delete habit" }).click();
  await big("habits-delete-confirm");
  await page.goto("/history?range=30");
  await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await big("history-30");
});

test("settings screens", async ({ page }) => {
  // Feature 8: Settings, the hint toward Tap to complete, Today's footer.
  const folder = "feature-8";
  await freshDemo(page);
  // Two quick taps: the hint under "Read 10 pages".
  for (let i = 0; i < 2; i++) {
    const box = (await habitKey(page, "Read 10 pages").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
  }
  await expect(page.getByText("Hold to complete, or turn on")).toBeVisible();
  // After "Keep holding…" has gone (1.5 s), so the shot shows the hint alone.
  await page.waitForTimeout(1600);
  await shoot(page, folder, "today-hint");
  await page.mouse.wheel(0, 2000);
  await shoot(page, folder, "today-footer");

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await shoot(page, folder, "settings");
  await page.getByRole("switch", { name: /Tap to complete/ }).click();
  await expect(page.getByRole("switch", { name: /Tap to complete/ })).toHaveAttribute("aria-checked", "true");
  await page.waitForLoadState("networkidle");
  await shoot(page, folder, "settings-on");
});

test("today's date screens", async ({ page }) => {
  // Feature 8c: the short date on phones, the full one on wider screens.
  // The label is set to the longest date, so the shots don't depend on the
  // day: short at 390 px, full at 768 px. (feature-8b/ keeps 8b's shots.)
  const folder = "feature-8c";
  await freshDemo(page);
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      document.querySelector('[data-day-label="full"]')!.textContent = "Wednesday, September 30";
      document.querySelector('[data-day-label="short"]')!.textContent = "Wed, Sep 30";
    });
    await shoot(page, folder, `today-${width}`);
  }
});

test("climb screens", async ({ page }) => {
  // Feature 10: Today with the scene strip, the Climb screen, the zone moment.
  const folder = "feature-10";
  await freshDemo(page);
  await shoot(page, folder, "today");
  await page.getByRole("link", { name: /^Altitude/ }).click();
  await expect(page.getByTestId("ruler-you")).toBeVisible();
  await shoot(page, folder, "climb");
  // And the top of the climb: the stratosphere and the summit.
  await page.getByRole("region", { name: /^The climb/ }).evaluate((el) => el.scrollTo(0, 0));
  await shoot(page, folder, "climb-top");

  // The zone moment: a demo one completion short of Treeline.
  const { today } = localToday();
  await reseedDemo([
    {
      name: "Climb a little",
      created_at: new Date(`${addDays(today, -9)}T12:00:00Z`).toISOString(),
      days: Array.from({ length: 9 }, (_, i) => addDays(today, -9 + i)),
    },
  ]);
  try {
    // Forget the zones this device celebrated at the demo's ~7,100 m.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("climb-zone:")) localStorage.removeItem(key);
    });
    await page.goto("/");
    await hold(page, "Climb a little");
    await expect(page.getByRole("button", { name: /New zone Treeline/ })).toBeVisible();
    // Shot quickly: the card closes itself after 6 s.
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `docs/screenshots/${folder}/zone-moment-${scheme}.png` });
    }
  } finally {
    await reseedDemo();
  }
});
