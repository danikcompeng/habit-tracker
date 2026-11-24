import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { reseedDemo } from "./seed";

/** Signs in with "Try the demo" and waits for Today. */
export async function signInDemo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
}

/**
 * Puts the demo's sample habits back, so every test starts the same. Uses
 * the shared session from e2e/demo.setup.ts (signing in only if there
 * isn't one), to keep auth calls to the shared demo down.
 */
export async function freshDemo(page: Page) {
  await reseedDemo();
  await page.goto("/");
  if (page.url().endsWith("/login")) await signInDemo(page);
  await expect(habitKey(page, "Read 10 pages")).toHaveAttribute("aria-pressed", "false");
}

/** A habit key on Today, by its exact name. */
export function habitKey(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

/** Presses and holds a key with the mouse for `ms`, at its centre. */
export async function holdKey(page: Page, key: Locator, ms: number, options: { moveBy?: number } = {}) {
  const box = await key.boundingBox();
  if (!box) throw new Error("key not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (options.moveBy) await page.mouse.move(x, y + options.moveBy, { steps: 5 });
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/**
 * Fails on any serious or critical accessibility problem axe can find
 * (contrast, names, labels, roles), in WCAG 2.2 AA terms.
 */
export async function expectNoA11yViolations(page: Page) {
  // Let colour transitions finish (a colour-scheme switch animates for up to
  // 250 ms): measured mid-transition, contrast is neither colour's.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}
