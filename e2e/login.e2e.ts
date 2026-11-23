import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, signInDemo } from "./helpers/app";

test("a signed-out visit to Today goes to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Hold" })).toBeVisible();
});

test("the login page is accessible, in light and dark", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expectNoA11yViolations(page);
  }
});

test("a bad email is explained next to the box, without sending anything", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(/Enter your email address/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "true");
});

test("'I already have a code' without an email says what's missing", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "I already have a code" }).click();
  await expect(page.getByText("Enter the email the code was sent to first.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeFocused();
});

test("Reset demo puts the sample habits back and says so (needs the migration)", async ({ page }) => {
  await signInDemo(page);
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByRole("status")).toHaveText("Demo reset. The sample habits are back.");
});

test("'I already have a code' opens the code step for the typed email", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("me@example.com");
  await page.getByRole("button", { name: "I already have a code" }).click();
  await expect(page.getByText("Type the code we sent to me@example.com.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Code from the email" })).toBeFocused();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
});

test("Try the demo opens Today as the demo account, and Log out ends it", async ({ page }) => {
  await signInDemo(page);
  await expect(page.getByText("Demo account")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
  // Logged in, the login page sends you to Today.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
