// Managing habits (plans/habit-tracker.md, Feature 4) on the demo account.

import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations, freshDemo } from "./helpers/app";

const SAMPLE = ["Drink a glass of water", "Read 10 pages", "Stretch for 5 minutes", "Walk outside", "No phone in bed"];

async function names(page: Page) {
  // Wait for the list itself (it streams in after a reload).
  const list = page.getByRole("list", { name: "Your habits" });
  await expect(list).toBeVisible();
  return list.getByRole("listitem").locator("span.text-list").allTextContents();
}

/** The habits on Today, in order (waits for the list to stream in). */
async function todayOrder(page: Page) {
  const list = page.getByRole("list", { name: "Habits", exact: true });
  await expect(list.getByRole("button").first()).toBeVisible();
  return list.getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
}

/** Server action POSTs (each save is one). */
function countActions(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) seen.push(r.url());
  });
  return seen;
}
function nextAction(page: Page) {
  return page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
}

test.beforeEach(async ({ page }) => {
  await freshDemo(page);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Habits" })).toBeVisible();
});

test("lists the habits in Today's order, accessibly in light and dark", async ({ page }) => {
  expect(await names(page)).toEqual(SAMPLE);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
});

test("adds habits at the bottom, keeping focus in the box, and they're saved", async ({ page }) => {
  const box = page.getByRole("textbox", { name: "New habit" });
  await box.fill("  Meditate  ");
  await box.press("Enter");
  await expect(box).toHaveValue("");
  await expect(box).toBeFocused();
  await box.fill("Floss");
  await page.getByRole("button", { name: "Add habit" }).click();
  await expect(box).toHaveValue("");
  await expect.poll(() => names(page)).toEqual([...SAMPLE, "Meditate", "Floss"]);
  await page.reload();
  await expect.poll(() => names(page)).toEqual([...SAMPLE, "Meditate", "Floss"]);
});

test("an empty name is explained and nothing is added", async ({ page }) => {
  await page.getByRole("button", { name: "Add habit" }).click();
  await expect(page.getByText("Give your habit a name.")).toBeVisible();
  expect(await names(page)).toHaveLength(5);
});

test("a failed add keeps what you typed and says why", async ({ page }) => {
  await page.route("**/habits", (route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback(),
  );
  const box = page.getByRole("textbox", { name: "New habit" });
  await box.fill("Journal");
  await box.press("Enter");
  await expect(page.getByText(/Couldn't add it|Couldn't save/)).toBeVisible();
  await expect(box).toHaveValue("Journal");
});

test("renames a habit; focus returns to its Edit button; Escape and Cancel do too", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Walk outside" }).click();
  const nameBox = page.getByRole("textbox", { name: "Name" });
  await expect(nameBox).toBeFocused();
  await nameBox.press("Escape");
  await expect(page.getByRole("button", { name: "Edit Walk outside" })).toBeFocused();

  await page.getByRole("button", { name: "Edit Walk outside" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Walk 20 minutes");
  await page.getByRole("textbox", { name: "Name" }).press("Enter");
  await expect(page.getByRole("button", { name: "Edit Walk 20 minutes" })).toBeFocused();
  await page.reload();
  expect(await names(page)).toContain("Walk 20 minutes");
});

test("Move to bottom and Move to top keep focus on that habit, and are saved", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Read 10 pages" }).click();
  const saved = nextAction(page);
  await page.getByRole("button", { name: "Move to bottom" }).click();
  await expect(page.getByRole("button", { name: "Already last" })).toBeFocused();
  expect((await names(page)).at(-1)).toBe("Read 10 pages");
  await saved;

  const savedAgain = nextAction(page);
  await page.getByRole("button", { name: "Move to top" }).click();
  await expect(page.getByRole("button", { name: "Already first" })).toBeFocused();
  await savedAgain;
  await page.reload();
  expect((await names(page))[0]).toBe("Read 10 pages");
});

test("Arrange: two moves keep focus, save ONCE, and Done arranging never snaps back", async ({ page }) => {
  const actions = countActions(page);
  // Listen from the start: the save goes 600 ms after the last move, which
  // may be before or after Done arranging.
  const saved = nextAction(page);
  await page.getByRole("button", { name: "Arrange" }).click();
  const down = page.getByRole("button", { name: "Move Drink a glass of water down" });
  await down.click();
  await expect(down).toBeFocused();
  await down.press("Enter");
  await expect(down).toBeFocused();
  expect((await names(page)).indexOf("Drink a glass of water")).toBe(2);

  // The edges are announced instead of moving.
  // (aria-disabled, so Playwright would wait for it to be "enabled"; people can still tap it.)
  await page.getByRole("button", { name: "Move Read 10 pages up" }).click({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "Read 10 pages is already first." })).toBeAttached();

  // Done arranging: the new order stays on screen the whole time.
  await page.getByRole("button", { name: "Done arranging" }).click();
  expect((await names(page)).indexOf("Drink a glass of water")).toBe(2);
  await saved;
  expect((await names(page)).indexOf("Drink a glass of water")).toBe(2);
  expect(actions).toHaveLength(1); // three taps, one save

  await page.reload();
  expect((await names(page)).indexOf("Drink a glass of water")).toBe(2);
  // Today shows the same order.
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const keys = await todayOrder(page);
  expect(keys.indexOf("Drink a glass of water")).toBe(2);
});

test("Done straight after arranging waits for the save, then Today has the new order", async ({ page }) => {
  await page.getByRole("button", { name: "Arrange" }).click();
  // Header Done is hidden while arranging: "Done arranging" is the way out.
  await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Move No phone in bed up" }).click();
  await page.getByRole("button", { name: "Done arranging" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const keys = await todayOrder(page);
  expect(keys.indexOf("No phone in bed")).toBe(3);
});

test("deletes with a confirmation; Keep it cancels; focus moves to the next habit; saved", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Read 10 pages" }).click();
  await page.getByRole("button", { name: "Delete habit" }).click();
  await expect(page.getByText("Delete Read 10 pages? Its streak and history go too.")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: "Delete habit" })).toBeFocused();

  await page.getByRole("button", { name: "Delete habit" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Stretch for 5 minutes" })).toBeFocused();
  expect(await names(page)).not.toContain("Read 10 pages");
  await page.reload();
  expect(await names(page)).not.toContain("Read 10 pages");
});

test("leaving and coming back closes an open editor", async ({ page }) => {
  await page.getByRole("button", { name: "Edit Walk outside" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Habits" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveCount(0);
});
