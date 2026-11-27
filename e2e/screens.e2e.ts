// Screenshots for the design-critic and the case study, in light and dark,
// at iPhone size (390 x 844 @3x). Saved to docs/screenshots/<feature>/.
// Run against a production build, so no dev tools appear in the shots:
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 npm run screens -- -g "today"

import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/saves";
import { freshDemo, habitKey } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

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
  // And the top of the window: past the Summit, the clouds and the sky darkening (Feature 10c).
  await page.getByRole("region", { name: /^The climb/ }).evaluate((el) => el.scrollTo(0, 0));
  await shoot(page, folder, "climb-top");

  // The zone moment, as a demo visitor sees it (Feature 10c): finishing
  // today's three open habits passes the Summit.
  await freshDemo(page);
  try {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("climb-zone")) localStorage.removeItem(key);
    });
    await page.goto("/");
    for (const name of ["Read 10 pages", "Stretch for 5 minutes", "No phone in bed"]) await hold(page, name);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole("button", { name: /New zone Summit/ })).toBeVisible();
    // Shot quickly: the card closes itself after 6 s.
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `docs/screenshots/${folder}/zone-moment-${scheme}.png` });
    }
  } finally {
    // Never leave the shared demo finished for the next visitor.
    await reseedDemo();
  }
});

test("climb 10g screens", async ({ page }) => {
  // Feature 10g: Climb's top limit, a faked bounce at each end (the world
  // shifted as iOS's rubber band does: the gap shows the box's background),
  // and the zones above the clouds, for the demo (8,763 m).
  const folder = "feature-10/climb-10g";
  await freshDemo(page);
  await page.goto("/climb");
  await expect(page.getByTestId("ruler-you")).toBeVisible();
  const region = page.getByRole("region", { name: /^The climb/ });
  const shift = (px: number) => region.evaluate((el, px) => ((el.firstElementChild as HTMLElement).style.transform = px ? `translateY(${px}px)` : ""), px);
  await region.evaluate((el) => el.scrollTo(0, 0));
  await shoot(page, folder, "top");
  await shift(160);
  await shoot(page, folder, "bounce-top");
  await shift(0);
  await region.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shoot(page, folder, "bottom");
  await shift(-160);
  await shoot(page, folder, "bounce-bottom");
  await shift(0);
  // Centred on a height: (top − a) / 25 m a row × 3 css px.
  for (const [name, a] of [["11000", 11_000], ["stratosphere", 12_500], ["edge-of-space", 17_500], ["moonlight", 23_000], ["asteroid-belt", 33_000]] as const) {
    await region.evaluate((el, a) => {
      const top = (el.firstElementChild as HTMLElement).offsetHeight / 3 * 25;
      el.scrollTo(0, ((top - a) / 25) * 3 - el.clientHeight / 2);
    }, a);
    await shoot(page, folder, name);
  }
});

test("climb 10h screens", async ({ page }) => {
  // Feature 10h: the zone celebration, crossing the demo's Summit, as stills
  // on a paused clock (the scene's frames and the card's CSS animation both
  // set to the same moment): 150, 400, 900 and 1,400 ms in; and with Reduce
  // Motion, the card with its still sparkles.
  test.setTimeout(240_000);
  const folder = "feature-10/climb-10h";
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "no-preference" });
    await page.clock.install();
    await freshDemo(page);
    await page.goto("/settings");
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("climb-zone")).forEach((k) => localStorage.removeItem(k)));
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await hold(page, "No phone in bed");
    await page.evaluate(() => window.scrollTo(0, 0));
    await hold(page, "Read 10 pages");
    await page.waitForTimeout(800);
    // The last: its answer comes 1.5 s late (the key saves as the hold
    // completes, finger still down), so the clock can stop before it lands
    // and the celebration waits at 0 ms.
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fallback();
    });
    const answered = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
    const key = habitKey(page, "Stretch for 5 minutes");
    const box = (await key.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
    await answered;
    await page.unroute("**/*");
    // (By its text: until it lands it's hidden, so not in the accessibility tree.)
    const card = page.locator("button", { hasText: "New zone" });
    await expect(card).toBeAttached();
    await page.waitForTimeout(300);
    let at = 0;
    for (const t of [150, 400, 900, 1_400]) {
      await page.clock.runFor(t - at);
      at = t;
      // The card's CSS animation, to the same moment (it began with the celebration).
      await card.evaluate((el, t) => el.getAnimations().forEach((a) => (a.pause(), (a.currentTime = t))), t);
      await page.screenshot({ path: `docs/screenshots/${folder}/t${t}-${scheme}.png`, clip: { x: 0, y: 0, width: 390, height: 300 } });
    }
    await page.clock.resume();
    await reseedDemo();
  }
  // Reduce Motion: the card at once, and the sparkles.
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await freshDemo(page);
    await page.goto("/settings");
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("climb-zone")).forEach((k) => localStorage.removeItem(k)));
    await page.goto("/");
    await hold(page, "No phone in bed");
    await page.evaluate(() => window.scrollTo(0, 0));
    await hold(page, "Read 10 pages");
    await page.waitForTimeout(800);
    const answered = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
    await hold(page, "Stretch for 5 minutes");
    await answered;
    await expect(page.getByRole("button", { name: /New zone Summit/ })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screenshots/${folder}/reduce-${scheme}.png` });
    await reseedDemo();
  }
});

/**
 * Freezes the next animations that `pick` finds (checked every frame, from
 * now) at `ms` into them, and resolves once it has. Start it before the
 * action that begins them; screenshot; then `thaw`. Resolves with how many it
 * froze (0: none came within 4 s); `frozen()` fails the test on 0.
 */
function freezeNext(page: Page, pick: "morph" | "check" | "streak", ms: number | `${number}%`) {
  return page.evaluate(
    ([pick, ms]) =>
      new Promise<number>((resolve) => {
        const until = performance.now() + 4_000;
        const look = () => {
          const all = document.documentElement.getAnimations({ subtree: true });
          const found = all.filter((a) => {
            const effect = a.effect as KeyframeEffect | null;
            if (pick === "morph") return effect?.pseudoElement?.includes("climb-scene");
            const target = effect?.target as Element | null;
            if (pick === "check") return !!target?.parentElement?.hasAttribute("data-check");
            return !!target?.id.endsWith("-streak");
          });
          if (found.length > 0) {
            for (const a of found) {
              const duration = Number(a.effect?.getTiming().duration);
              a.pause();
              a.currentTime = typeof ms === "number" ? ms : (duration * parseInt(ms)) / 100;
            }
            (window as unknown as { __frozen: Animation[] }).__frozen = found;
            resolve(found.length);
          } else if (performance.now() < until) requestAnimationFrame(look);
          else resolve(0);
        };
        look();
      }),
    [pick, ms] as const,
  );
}

/** Waits for a freezeNext, failing the screens test if nothing was frozen (a still of the settled state would mislead). */
async function frozen(what: string, freeze: Promise<number>) {
  expect(await freeze, `${what}: an animation to freeze`).toBeGreaterThan(0);
}

async function thaw(page: Page) {
  await page.evaluate(() => (window as unknown as { __frozen?: Animation[] }).__frozen?.forEach((a) => a.play()));
  await page.waitForTimeout(500);
}

test("climb 10i screens", async ({ page }) => {
  // Feature 10i, frozen mid-motion: the strip growing into Climb's window (at
  // 40% and 80%) and shrinking back (50%); a key's check mid-crossfade,
  // completing and undoing; its streak mid-pulse.
  test.setTimeout(240_000);
  const folder = "feature-10/climb-10i";
  const strip = page.getByRole("link", { name: /^Altitude/ });
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "no-preference" });
    await freshDemo(page);
    await page.evaluate(() => document.fonts.ready);
    // The first visit grows into Climb's loading box; later ones into the world itself.
    for (const [visit, at, backAt] of [["first", "40%", "50%"], ["again", "20%", "20%"], ["again", "60%", null]] as const) {
      const freeze = freezeNext(page, "morph", at);
      await strip.click();
      await frozen("the morph in", freeze);
      await page.screenshot({ path: `docs/screenshots/${folder}/morph-in-${visit}-${at.replace("%", "")}-${scheme}.png` });
      await thaw(page);
      await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
      await page.waitForTimeout(400);
      const back = freezeNext(page, "morph", backAt ?? "50%");
      await page.getByRole("link", { name: "Done" }).click();
      await frozen("the morph back", back);
      if (backAt) await page.screenshot({ path: `docs/screenshots/${folder}/morph-back-${backAt.replace("%", "")}-${scheme}.png` });
      await thaw(page);
      await expect(strip).toBeVisible();
      await page.waitForTimeout(400);
    }
    // A key: completing (its check mid-crossfade, its streak mid-pulse), then undoing.
    const key = habitKey(page, "Read 10 pages");
    const box = (await key.boundingBox())!;
    const check = freezeNext(page, "check", 100);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await frozen("the check completing", check);
    await page.mouse.up();
    await page.screenshot({ path: `docs/screenshots/${folder}/check-complete-${scheme}.png`, clip: { x: 0, y: box.y - 20, width: 390, height: box.height + 40 } });
    await thaw(page);
    // (Its streak pulse ran too: shown on the next completion, below.)
    const undo = freezeNext(page, "check", 100);
    await key.click();
    await frozen("the check undoing", undo);
    await page.screenshot({ path: `docs/screenshots/${folder}/check-undo-${scheme}.png`, clip: { x: 0, y: box.y - 20, width: 390, height: box.height + 40 } });
    await thaw(page);
    const pulseAgain = freezeNext(page, "streak", 125);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await frozen("the streak pulse", pulseAgain);
    await page.mouse.up();
    await page.screenshot({ path: `docs/screenshots/${folder}/streak-pulse-${scheme}.png`, clip: { x: 0, y: box.y - 20, width: 390, height: box.height + 40 } });
    await thaw(page);
    await page.waitForTimeout(800);
    await reseedDemo();
  }
});
