// Screenshots for the design-critic and the case study, in light and dark,
// at iPhone size (390 x 844 @3x). Saved to docs/screenshots/<feature>/.
// Run against a production build, so no dev tools appear in the shots:
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 npm run screens
//
// SCREENS_FEATURE picks the folder (default: the latest feature).

import { expect, test, type Page } from "@playwright/test";

const FEATURE = process.env.SCREENS_FEATURE ?? "feature-2";
const DIR = `docs/screenshots/${FEATURE}`;
const SCHEMES = ["light", "dark"] as const;

async function shoot(page: Page, name: string) {
  // Wait until React has taken over the page (hydrated): a screenshot
  // before that would touch the page and confuse it.
  await page.waitForLoadState("networkidle");
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    // Let fonts load and colour transitions (150-250 ms) finish, or the
    // shot catches buttons halfway between the light and dark colours.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/${name}-${scheme}.png` });
  }
}

test("login screens", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await shoot(page, "login-email");

  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(/Enter your email address/)).toBeVisible();
  await shoot(page, "login-email-error");

  await page.getByRole("textbox", { name: "Email" }).fill("you@example.com");
  await page.getByRole("button", { name: "I already have a code" }).click();
  await expect(page.getByRole("textbox", { name: "Code from the email" })).toBeVisible();
  await shoot(page, "login-code");
});
