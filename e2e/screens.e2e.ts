// Screenshots for the design-critic and the case study, in light and dark,
// at iPhone size (390 x 844 @3x). Saved to docs/screenshots/<feature>/.
// Run against a production build, so no dev tools appear in the shots:
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 npm run screens -- -g "today"

import { expect, test, type Page } from "@playwright/test";
import { freshDemo, habitKey } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

const SCHEMES = ["light", "dark"] as const;

async function settle(page: Page) {
  // Fonts loaded and colour transitions (150-250 ms) finished, or the shot
  // catches buttons halfway between the light and dark colours.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function shoot(page: Page, folder: string, name: string) {
  // Wait until React has taken over the page (hydrated): a screenshot
  // before that would touch the page and confuse it.
  await page.waitForLoadState("networkidle");
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await settle(page);
    await page.screenshot({ path: `docs/screenshots/${folder}/${name}-${scheme}.png` });
  }
}

async function hold(page: Page, name: string) {
  const key = habitKey(page, name);
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
