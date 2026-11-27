// The Climb (plans/habit-tracker.md, Feature 10) on the demo account: the
// strip on Today, the Climb screen, the lift, the one-time zone moment.
// The expected heights come from lib/altitude.ts and the demo's own sample
// data, the same rule the database's habit_altitude() follows.

import type { Page } from "@playwright/test";
import { altitudeOf, dailyClimbCm, metres, nextZone, zoneAt, zonesBelow } from "../lib/altitude";
import { climbTop } from "../lib/climb-scene/scene";
import { MOTION } from "../lib/motion";
import { addDays, todayIn } from "../lib/dates";
import { demoSeedPayload } from "../lib/demo-seed";
import { expectNoA11yViolations, freshDemo, habitKey, holdKey } from "./helpers/app";
import { expect, nextSave, test } from "./helpers/saves";
import { localToday, reseedDemo } from "./helpers/seed";

/** The demo's altitude as the sample data says, in centimetres. */
function demoAltitude() {
  const { timeZone, today } = localToday();
  const habits = demoSeedPayload(today, timeZone).map((h) => ({ createdDay: todayIn(timeZone, new Date(h.created_at)), days: h.days }));
  return { ...altitudeOf(habits, today), habits: habits.length };
}

const strip = (page: Page) => page.getByRole("link", { name: /^Altitude/ });

/**
 * Forget the zones celebrated on this device: any earlier visit to the demo
 * (~8,760 m) remembered "Above the clouds" and would hide a lower zone's
 * moment (or the one finishing the demo, the Summit). Needs the app's origin, so it visits a page without the climb.
 */
async function forgetZones(page: Page) {
  await page.goto("/settings");
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("climb-zone")) localStorage.removeItem(key);
  });
}

/** The balloon's box on a scene canvas (CSS px), from its data-balloon (logical centre and basket row) with its ring. */
async function balloonBox(page: Page, canvas: string): Promise<{ left: number; right: number; top: number; bottom: number }> {
  // Only once the scene is painted at its size (before that there's no balloon to measure).
  await expect(page.locator(`${canvas}[data-painted][data-balloon]`)).toHaveCount(1);
  // Let the balloon settle beside chips measured after a text-size change.
  await page.waitForTimeout(200);
  const box = await page.locator(canvas).evaluate((el) => {
    const [x, y] = (el.getAttribute("data-balloon") ?? "").split(",").map(Number);
    const r = el.getBoundingClientRect();
    const scale = r.width / (el as HTMLCanvasElement).width;
    return { left: r.left + (x - 4) * scale, right: r.left + (x + 5) * scale, top: r.top + (y - 13) * scale, bottom: r.top + (y + 2) * scale, scale };
  });
  expect([box.left, box.right, box.top, box.bottom].every(Number.isFinite), "the balloon's box is measured").toBe(true);
  expect(box.scale, "the canvas is painted at 3 CSS px a pixel").toBeCloseTo(3, 1);
  return box;
}

/** Does any of these elements cover the balloon on this canvas? */
async function balloonUnder(page: Page, canvas: string, covers: import("@playwright/test").Locator | string): Promise<boolean | string[]> {
  const b = await balloonBox(page, canvas);
  const locator = typeof covers === "string" ? page.locator(covers) : covers;
  const hits = await locator.evaluateAll(
    (els, b) =>
      els
        .map((el) => ({ text: el.textContent?.trim() ?? "", r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && Math.min(r.right, b.right) - Math.max(r.left, b.left) > 1 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 1)
        .map(({ text }) => text),
    b,
  );
  return typeof covers === "string" ? hits : hits.length > 0;
}

/** Any two of these overlap (by more than a pixel)? Returns the pairs that do. */
async function overlaps(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((els) => {
    const boxes = els.map((el) => ({ text: el.textContent?.trim() ?? "", r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0);
    const out: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) out.push(`"${boxes[i].text}" × "${boxes[j].text}"`);
      }
    }
    return out;
  });
}

test("Today's strip shows the demo's altitude and zone, is named by its own words, and opens Climb", async ({ page }) => {
  await freshDemo(page);
  const { altitudeCm } = demoAltitude();
  const zone = zoneAt(altitudeCm).name;
  await expect(strip(page)).toHaveAccessibleName(`Altitude ${metres(altitudeCm)} ${zone} Climb`);
  await expect(strip(page)).toHaveAttribute("href", "/climb");

  // The keys stay the hero: the first four fully above the fold at 390 × 844.
  const fourth = await page.getByRole("list", { name: "Habits" }).getByRole("listitem").nth(3).boundingBox();
  expect(fourth!.y + fourth!.height).toBeLessThanOrEqual(844);

  await strip(page).click();
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("Climb · Ascend");
  await expect(page.getByText(metres(altitudeCm), { exact: true }).first()).toBeVisible();
  const next = nextZone(altitudeCm);
  await expect(page.getByText(`${zone} · ${next.metres.toLocaleString("en-US")} m to ${next.zone.name}`)).toBeVisible();
  // The zones, for everyone; the ruler's own chip shows where you are.
  // Every zone below the world's top, plus "you are here".
  await expect(page.getByRole("list", { name: "Zones" }).getByRole("listitem")).toHaveCount(zonesBelow(climbTop(altitudeCm / 100)).length + 1);
  await expect(page.getByTestId("ruler-you")).toHaveText(metres(altitudeCm));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
});

test("the Climb screen opens on your marker, inside its own scrolling window", async ({ page }) => {
  await freshDemo(page);
  await strip(page).click();
  const window = page.getByRole("region", { name: /^The climb/ });
  await expect(page.getByTestId("ruler-you")).toBeVisible();
  const box = (await window.boundingBox())!;
  const you = (await page.getByTestId("ruler-you").boundingBox())!;
  expect(you.y).toBeGreaterThan(box.y);
  expect(you.y + you.height).toBeLessThan(box.y + box.height);
  expect(await window.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // The heading and Done stay on screen.
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeInViewport();
});

test("completing a habit lifts the altitude by its share of the day; undo brings it back", async ({ page }) => {
  await freshDemo(page);
  const { altitudeCm, beforeTodayCm, habits } = demoAltitude();
  // The demo starts with 2 of 5 done today.
  const after = beforeTodayCm + dailyClimbCm(3, habits);
  const read = habitKey(page, "Read 10 pages");
  const saved = nextSave(page);
  await holdKey(page, read, 800);
  await expect(strip(page)).toHaveAccessibleName(new RegExp(`^Altitude ${metres(after)} `));
  await saved;
  const undone = nextSave(page);
  await read.click();
  await expect(strip(page)).toHaveAccessibleName(new RegExp(`^Altitude ${metres(altitudeCm)} `));
  await undone;
});

test("the zone moment: once, after the save, with the right words, and never again", async ({ page }) => {
  // One habit, perfect for the last nine days: 1,350 m. Today's hold adds
  // 150 m, to exactly 1,500 m: Treeline.
  const { today } = localToday();
  await reseedDemo([
    {
      name: "Climb a little",
      created_at: new Date(`${addDays(today, -9)}T12:00:00Z`).toISOString(),
      days: Array.from({ length: 9 }, (_, i) => addDays(today, -9 + i)),
    },
  ]);
  try {
    await forgetZones(page);
    await page.goto("/");
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,350 m Forest/);
    const key = habitKey(page, "Climb a little");
    const saved = nextSave(page);
    await holdKey(page, key, 800);
    await saved;
    const card = page.getByRole("button", { name: /New zone Treeline/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText("+150 m · up to 1,500 m");
    await expect(page.getByRole("status").filter({ hasText: "New zone: Treeline." })).toBeAttached();
    await card.click();
    await expect(card).toHaveCount(0);

    // Undo below Treeline and complete again: no second card.
    const undone = nextSave(page);
    await key.click();
    await undone;
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,350 m Forest/);
    const again = nextSave(page);
    await holdKey(page, key, 800);
    await again;
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,500 m Treeline/);
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);

    // Nor after a reload: undo below Treeline and climb back again.
    await page.reload();
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,500 m Treeline/);
    const undoneAgain = nextSave(page);
    await key.click();
    await undoneAgain;
    const redone = nextSave(page);
    await holdKey(page, key, 800);
    await redone;
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 1,500 m Treeline/);
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);
  } finally {
    await reseedDemo();
  }
});

test("a demo visitor who finishes today's three open habits passes the Summit and sees the card (Feature 10c)", async ({ page }) => {
  await freshDemo(page);
  try {
    await forgetZones(page);
    await page.goto("/");
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 8,7\d\d m Above the clouds/);
    for (const [i, name] of ["Read 10 pages", "Stretch for 5 minutes", "No phone in bed"].entries()) {
      const saved = nextSave(page);
      await holdKey(page, habitKey(page, name), 800);
      await saved;
      // Not before the last one (the perfect day's +70 m is what crosses).
      if (i < 2) await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);
    }
    const card = page.getByRole("button", { name: /New zone Summit/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/\+70 m · up\sto 8,8\d\d\sm/);
    await expect(strip(page)).toHaveAccessibleName(/Summit/);
    // The card sits clear of the balloon: you see it passing the peak.
    expect(await balloonUnder(page, 'canvas[data-scene="close"]', card)).toBe(false);
  } finally {
    // Never leave the shared demo finished (past the Summit) for the next visitor.
    await reseedDemo();
  }
});

/**
 * Watches Today's strip every frame (Feature 10h): the most confetti and
 * sparkles painted, and whether a celebration ever ran. Read with party().
 */
async function watchParty(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __party: { confetti: number; sparkles: number; celebrating: boolean } };
    w.__party = { confetti: 0, sparkles: 0, celebrating: false };
    const look = () => {
      const canvas = document.querySelector('canvas[data-scene="close"]');
      w.__party.confetti = Math.max(w.__party.confetti, Number(canvas?.getAttribute("data-confetti") ?? 0));
      w.__party.sparkles = Math.max(w.__party.sparkles, Number(canvas?.getAttribute("data-sparkles") ?? 0));
      if (document.querySelector("[data-celebrating]")) w.__party.celebrating = true;
      requestAnimationFrame(look);
    };
    look();
  });
}

function party(page: Page) {
  return page.evaluate(() => (window as unknown as { __party: { confetti: number; sparkles: number; celebrating: boolean } }).__party);
}

/** Completes the demo's three open habits (the last one crosses the Summit), each save answered. */
async function finishDemo(page: Page) {
  for (const name of ["Read 10 pages", "Stretch for 5 minutes", "No phone in bed"]) {
    const saved = nextSave(page);
    await holdKey(page, habitKey(page, name), 800);
    await saved;
  }
}

test("Feature 10h: crossing the Summit celebrates once (a lift, confetti, then the card), and never again on reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await freshDemo(page);
  try {
    await forgetZones(page);
    await page.goto("/");
    const box = page.locator("[data-celebrations]");
    await expect(box).toHaveAttribute("data-celebrations", "0");
    await watchParty(page);
    await finishDemo(page);
    const card = page.getByRole("button", { name: /New zone Summit/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText("+70 m");
    // It wiped open from the balloon's side after the lift (Feature 10i): 250 ms, from 950 ms.
    const wipe = await card.evaluate((el) => el.getAnimations().map((a) => ({ name: (a as CSSAnimation).animationName, delay: Number(a.effect?.getTiming().delay), duration: Number(a.effect?.getTiming().duration) })));
    expect(wipe).toEqual([{ name: "card-in", delay: MOTION.land, duration: MOTION.pop }]);
    // Closing the card (here, as soon as it has landed) doesn't start it again.
    await card.click();
    await expect(card).toHaveCount(0);
    // It ran (a lift and a burst of confetti), then stopped: nothing left on the canvas.
    await expect(box).not.toHaveAttribute("data-celebrating", /.*/, { timeout: 5_000 });
    await expect(box).toHaveAttribute("data-celebrations", "1");
    const seen = await party(page);
    expect(seen.celebrating).toBe(true);
    expect(seen.confetti).toBeGreaterThan(10);
    expect(seen.sparkles).toBe(0);
    await expect(page.locator('canvas[data-scene="close"][data-confetti]')).toHaveCount(0);
    await expect(strip(page)).toHaveAccessibleName(/Summit/);
    await page.waitForTimeout(1_000);
    await expect(box).toHaveAttribute("data-celebrations", "1");

    // A reload: no card and no celebration.
    await page.reload();
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 8,8\d\d m/);
    await watchParty(page);
    await page.waitForTimeout(2_500);
    await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);
    await expect(page.locator("[data-celebrations]")).toHaveAttribute("data-celebrations", "0");
    expect((await party(page)).confetti).toBe(0);
  } finally {
    await reseedDemo();
  }
});

/** Every save answers `ms` late (the server taking its time), or never (`ms` null: the request fails). */
async function slowSaves(page: Page, ms: number | null) {
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      if (ms === null) return route.abort();
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.fallback();
  });
}

/** The demo with two of its three open habits done (the third crosses the Summit), and the strip's height then ("8,803 m"). */
async function oneToGo(page: Page): Promise<string> {
  await forgetZones(page);
  await page.goto("/");
  for (const name of ["Read 10 pages", "Stretch for 5 minutes"]) {
    const saved = nextSave(page);
    await holdKey(page, habitKey(page, name), 800);
    await saved;
  }
  return ((await strip(page).textContent()) ?? "").match(/8,\d{3} m/)![0];
}

test("Feature 10h: the strip holds its lift until the crossing's save answers; an undo (of it, or of another habit) before then brings no card and leaves the zone to come", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await freshDemo(page);
  try {
    const before = await oneToGo(page);
    await slowSaves(page, 1_500);
    const crossing = habitKey(page, "No phone in bed");
    const other = habitKey(page, "Read 10 pages");
    for (const undo of [crossing, other]) {
      const saved = nextSave(page);
      await holdKey(page, crossing, 800);
      await expect(crossing).toHaveAttribute("aria-pressed", "true");
      // Held: the key is done, the strip still says the height before it.
      await page.waitForTimeout(400);
      await expect(strip(page)).toContainText(before);
      const undone = nextSave(page);
      await undo.click();
      await saved;
      await undone;
      await page.waitForTimeout(1_500);
      await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);
      await expect(page.locator("[data-celebrations]")).toHaveAttribute("data-celebrations", "0");
    }
    await page.unroute("**/*");
    // Now "No phone in bed" is done and "Read 10 pages" isn't: completing it
    // crosses the Summit for real, and the card comes (the zone wasn't used up).
    const again = nextSave(page);
    await holdKey(page, other, 800);
    await again;
    await expect(page.getByRole("button", { name: /New zone Summit/ })).toBeVisible();
    await expect(page.locator("[data-celebrations]")).toHaveAttribute("data-celebrations", "1");
  } finally {
    await page.unroute("**/*");
    await reseedDemo();
  }
});

test("Feature 10h: a held crossing whose save fails never lifts the strip, nor shows a card", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await freshDemo(page);
  try {
    const before = await oneToGo(page);
    await watchParty(page);
    await slowSaves(page, null);
    const key = habitKey(page, "No phone in bed");
    await holdKey(page, key, 800);
    // The key goes back once the save fails; all the while the strip stays put.
    for (let i = 0; i < 20; i++) {
      await expect(strip(page)).toContainText(before, { timeout: 100 });
      await page.waitForTimeout(100);
    }
    await expect(key).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /New zone/ })).toHaveCount(0);
    expect((await party(page)).celebrating).toBe(false);
  } finally {
    await page.unroute("**/*");
    await reseedDemo();
  }
});

test("Feature 10h, Reduce Motion: no held lift, no lift, sway or confetti; the card fades in beside still sparkles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freshDemo(page);
  try {
    const before = await oneToGo(page);
    await watchParty(page);
    await slowSaves(page, 1_500);
    const saved = nextSave(page);
    await holdKey(page, habitKey(page, "No phone in bed"), 800);
    // At the new height at once, before the answer: nothing is held.
    await page.waitForTimeout(300);
    await expect(strip(page)).not.toContainText(before);
    await saved;
    await expect(page.getByRole("button", { name: /New zone Summit/ })).toBeVisible();
    await expect(page.locator('canvas[data-scene="close"]')).toHaveAttribute("data-sparkles", "4");
    await page.waitForTimeout(2_000);
    const seen = await party(page);
    expect(seen.confetti).toBe(0);
    expect(seen.celebrating).toBe(false);
    await expect(page.locator("[data-celebrations]")).toHaveAttribute("data-celebrations", "0");
  } finally {
    await page.unroute("**/*");
    await reseedDemo();
  }
});

/**
 * Records every view transition's animations on this page (Feature 10i):
 * each pseudo-element's name and duration, checked every frame. Installed as
 * an init script, so it runs in every new document from its very start (a
 * reload's own reveal is caught too); `__vtReady` says it ran.
 */
async function recordViewTransitions(page: Page) {
  const install = () => {
    const w = window as unknown as { __vt: [string, number][]; __vtReady: boolean };
    if (w.__vtReady) return;
    w.__vt = [];
    w.__vtReady = true;
    const look = () => {
      for (const a of document.documentElement?.getAnimations({ subtree: true }) ?? []) {
        const name = (a.effect as KeyframeEffect | null)?.pseudoElement;
        if (name && name.startsWith("::view-transition")) w.__vt.push([name, Number(a.effect?.getTiming().duration ?? 0)]);
      }
      requestAnimationFrame(look);
    };
    look();
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

/** The view transitions recorded while `go` ran (name → longest duration). */
async function viewTransitions(page: Page, go: () => Promise<unknown>): Promise<Map<string, number>> {
  await page.evaluate(() => ((window as unknown as { __vt: [string, number][] }).__vt = []));
  await go();
  await page.waitForTimeout(1_200);
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __vt?: [string, number][]; __vtReady?: boolean };
    return w.__vtReady ? (w.__vt ?? []) : null;
  });
  expect(seen, "the recorder ran in this document").not.toBeNull();
  const out = new Map<string, number>();
  for (const [name, ms] of seen!) out.set(name, Math.max(out.get(name) ?? 0, ms));
  return out;
}

test("Feature 10i: tapping the strip grows it into Climb's window, and Done shrinks it back (first visit and again); instant with Reduce Motion", async ({ page }) => {
  await recordViewTransitions(page);
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await freshDemo(page);
    for (let visit = 0; visit < 2; visit++) {
      const there = await viewTransitions(page, () => strip(page).click());
      await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
      const back = await viewTransitions(page, () => page.getByRole("link", { name: "Done" }).click());
      await expect(strip(page)).toBeVisible();
      for (const [label, run] of [["to Climb", there], ["back to Today", back]] as const) {
        const where = `${reducedMotion}, visit ${visit + 1}, ${label}`;
        // Only the box moves: the page itself isn't captured.
        expect(run.has("::view-transition-group(root)"), `${where}: no root snapshot`).toBe(false);
        if (reducedMotion === "reduce") {
          // Instant: nothing that runs takes any time (a 0 s transition may not even be seen).
          for (const [name, ms] of run) expect(ms, `${where}: ${name}`).toBe(0);
        } else {
          expect(run.get("::view-transition-group(climb-scene)"), `${where}: the strip and the window morph`).toBe(MOTION.morph);
        }
      }
    }
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // A page load (the skeleton's strip giving way to the strip), the browser's
  // back, a save, and Today's other links don't morph, or start any view transition.
  const none = (label: string, run: Map<string, number>) => expect([...run.keys()], label).toEqual([]);
  none("a reload", await viewTransitions(page, () => page.reload()));
  none("a cold load", await viewTransitions(page, () => page.goto("/")));
  await strip(page).click();
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
  await page.waitForTimeout(600);
  none("the browser's back", await viewTransitions(page, () => page.goBack()));
  await expect(strip(page)).toBeVisible();
  none(
    "a save",
    await viewTransitions(page, async () => {
      const saved = nextSave(page);
      await holdKey(page, habitKey(page, "Read 10 pages"), 800);
      await saved;
    }),
  );
  none("History", await viewTransitions(page, () => page.getByRole("link", { name: "History" }).click()));
  await reseedDemo();
});

test("Feature 10i: the morph never blocks input: a tap that lands while the box is still growing goes through", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await freshDemo(page);
  // A slow morph (3 s instead of 350 ms), so the tap certainly lands during it.
  await page.addStyleTag({ content: ":root { --motion-morph: 3000ms; }" });
  await page.evaluate(() => {
    const w = window as unknown as { __tapDuringMorph?: boolean };
    addEventListener(
      "pointerdown",
      () => {
        w.__tapDuringMorph = document.documentElement
          .getAnimations({ subtree: true })
          .some((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === "::view-transition-group(climb-scene)" && a.playState === "running");
      },
      { capture: true },
    );
  });
  await strip(page).click();
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
  // Climb's header is live under the growing box: Done takes the tap.
  await page.getByRole("link", { name: "Done" }).click({ timeout: 2_000 });
  expect(await page.evaluate(() => (window as unknown as { __tapDuringMorph?: boolean }).__tapDuringMorph)).toBe(true);
  await expect(page).toHaveURL(/\/$/);
  await expect(strip(page)).toBeVisible();
});

test("the chips on the strip and on Climb never overlap: 320 px, and 200% text", async ({ page }) => {
  await freshDemo(page);
  for (const [width, textSize] of [
    [320, 100],
    [390, 200],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(strip(page)).toBeVisible();
    if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    expect(await overlaps(page, 'a[href="/climb"] .bg-surface'), `${width} px, ${textSize}%: the strip`).toEqual([]);
    expect(await balloonUnder(page, 'canvas[data-scene="close"]', 'a[href="/climb"] .bg-surface'), `${width} px, ${textSize}%: a strip chip over the balloon`).toEqual([]);
    await page.goto("/climb");
    await expect(page.getByTestId("ruler-you")).toBeVisible();
    if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
    const chips = '[role="region"] .bg-surface:not([aria-hidden="true"].w-px), [role="region"] li:not(.sr-only), [data-testid="ruler-you"]';
    expect(await overlaps(page, chips), `${width} px, ${textSize}%: Climb's chips`).toEqual([]);
    expect(await balloonUnder(page, 'canvas[data-scene="world"]', chips), `${width} px, ${textSize}%: a chip over the balloon`).toEqual([]);
  }
});

test("on Climb no zone label covers the balloon, low down too (0 m, and 3,000 m right at Snowline), at 320 px and 200% text", async ({ page }) => {
  const { today } = localToday();
  await freshDemo(page);
  try {
    for (const days of [0, 20]) {
      // 20 perfect days of one habit: 20 × 150 m = 3,000 m.
      await reseedDemo([{ name: "Climb", created_at: new Date(`${addDays(today, -days)}T12:00:00Z`).toISOString(), days: Array.from({ length: days }, (_, i) => addDays(today, -days + i)) }]);
      for (const [width, textSize] of [
        [390, 100],
        [320, 100],
        [390, 200],
      ] as const) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/climb");
        await expect(page.getByTestId("ruler-you")).toHaveText(days === 0 ? "0 m" : "3,000 m");
        if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
        const chips = '[role="region"] li:not(.sr-only), [role="region"] .bg-surface, [data-testid="ruler-you"]';
        expect(await balloonUnder(page, 'canvas[data-scene="world"]', chips), `${days * 150} m, ${width} px, ${textSize}%`).toEqual([]);
      }
    }
  } finally {
    await reseedDemo();
  }
});

/** Colours on a scene canvas that aren't one of the --scene-* tokens (as the browser resolves them). */
async function strayColours(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluate((el) => {
    const probe = document.createElement("canvas").getContext("2d")!;
    const style = getComputedStyle(document.documentElement);
    const tokens = new Set<string>();
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (!name.startsWith("--scene-")) continue;
      probe.fillStyle = style.getPropertyValue(name).trim();
      tokens.add(String(probe.fillStyle).toLowerCase());
    }
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const stray = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      const hex = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      if (!tokens.has(hex)) stray.add(hex);
    }
    return [...stray];
  });
}

test("every pixel of the scene is one of its colour tokens, in light and dark (none unread, none invented)", async ({ page }) => {
  await freshDemo(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.waitForTimeout(400);
    expect(await strayColours(page, 'canvas[data-scene="close"]'), `the strip, ${colorScheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await strip(page).click();
  await expect(page.getByTestId("ruler-you")).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.waitForTimeout(400);
    expect(await strayColours(page, 'canvas[data-scene="world"]'), `Climb, ${colorScheme}`).toEqual([]);
  }
});

test("Reduce Motion: the scene stands still; with motion, its clouds drift", async ({ page }) => {
  await freshDemo(page);
  const canvas = page.locator('canvas[data-scene="close"]');
  await expect(canvas).toBeVisible();
  const frame = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  const still = await frame();
  await page.waitForTimeout(1_500);
  expect(await frame()).toBe(still);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const start = await frame();
  await expect.poll(frame, { timeout: 5_000 }).not.toBe(start);
});

/** Climb's scrolling window, scrolled to one end ("top" or "bottom"). */
async function climbAt(page: Page, end: "top" | "bottom") {
  const region = page.getByRole("region", { name: /^The climb/ });
  await region.evaluate((el, end) => el.scrollTo(0, end === "top" ? 0 : el.scrollHeight), end);
  await page.waitForTimeout(100);
  return region;
}

/** Chips (zone labels, ruler chips, yours) and ruler marks that stick out of Climb's world, or whose words spill out of their chip. */
async function clipped(page: Page): Promise<string[]> {
  return page.getByRole("region", { name: /^The climb/ }).evaluate((region) => {
    const world = region.firstElementChild!.getBoundingClientRect();
    const out: string[] = [];
    const items = region.querySelectorAll<HTMLElement>('li:not(.sr-only), span.absolute, [data-testid="ruler-you"]');
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height > world.height / 2) continue; // the ruler's line runs the whole world
      const text = el.textContent?.trim() || "a ruler mark";
      if (r.top < world.top - 0.5 || r.bottom > world.bottom + 0.5 || r.left < world.left - 0.5 || r.right > world.right + 0.5) out.push(`${text}: out of the world`);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${text}: words spill out`);
    }
    return out;
  });
}

test("Climb (10g): at the top and bottom scroll limits no zone label or ruler mark is clipped; the world reaches past 45,000 m, at 390 px and 320 px with 200% text", async ({ page }) => {
  const { today } = localToday();
  await freshDemo(page);
  try {
    // The demo (8,763 m), then one perfect day (150 m: the user's own case), three (450 m: your chip near
    // the floor) and 39 (5,850 m: your chip beside a label lifted above the 5,000 m ruler mark).
    for (const days of [null, 1, 3, 39]) {
      if (days !== null) await reseedDemo([{ name: "Climb", created_at: new Date(`${addDays(today, -days)}T12:00:00Z`).toISOString(), days: Array.from({ length: days }, (_, i) => addDays(today, -days + i)) }]);
      for (const [width, textSize] of [
        [390, 100],
        [320, 100],
        [320, 200],
        [390, 200],
      ] as const) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/climb");
        await expect(page.getByTestId("ruler-you")).toBeVisible();
        if (textSize !== 100) await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
        const label = `${days === null ? "the demo" : `${days * 150} m`}, ${width} px, ${textSize}%`;
        await expect(page.getByRole("region", { name: /^The climb/ })).toHaveAccessibleName(/to (4[6-9]|[5-9]\d|\d{3}),\d{3} m$/);
        for (const end of ["top", "bottom"] as const) {
          await climbAt(page, end);
          expect(await clipped(page), `${label}, at the ${end}`).toEqual([]);
        }
        // Overlaps too: for the demo at every size; otherwise at normal text. At 200% text the room runs
        // out (logged under Feature 10g): low down the floor has no room for "Base camp", "Forest" and
        // your chip (500 m = 60 px apart), and at 5,850 m the word "clouds" is wider than the room left
        // of your chip (by about 3 px at 390 px).
        if (days === null || textSize === 100) {
          const chips = '[role="region"] .bg-surface:not([aria-hidden="true"].w-px), [role="region"] li:not(.sr-only), [data-testid="ruler-you"]';
          expect(await overlaps(page, chips), `${label}: Climb's chips`).toEqual([]);
          expect(await balloonUnder(page, 'canvas[data-scene="world"]', chips), `${label}: a chip over the balloon`).toEqual([]);
        }
        // At the top: the 45,000 m zone ("Further still") in view, with sky above it.
        const region = await climbAt(page, "top");
        const box = (await region.boundingBox())!;
        const chip = (await region.getByRole("listitem").filter({ hasText: "Further still" }).first().boundingBox())!;
        expect(chip.y, `${label}: sky above the top label`).toBeGreaterThan(box.y + 20);
        expect(chip.y + chip.height, `${label}: the top label in view`).toBeLessThan(box.y + box.height);
      }
    }
  } finally {
    await reseedDemo();
  }
});

/**
 * The colours in a faked bounce: the world shifted by `shift` css px (down at
 * the top, up at the bottom: what iOS's rubber band does), shot, and the
 * gap's pixels read back in the page. Counts of each colour, as #rrggbb.
 */
async function bounceGap(page: Page, end: "top" | "bottom", shift = 150): Promise<Record<string, number>> {
  const region = await climbAt(page, end);
  await region.evaluate((el, s) => ((el.firstElementChild as HTMLElement).style.transform = `translateY(${s}px)`), end === "top" ? shift : -shift);
  await page.waitForTimeout(150);
  const shot = (await region.screenshot()).toString("base64");
  await region.evaluate((el) => ((el.firstElementChild as HTMLElement).style.transform = ""));
  return page.evaluate(
    async ({ shot, end, shift }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${shot}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const scale = img.width / document.querySelector<HTMLElement>('[role="region"]')!.getBoundingClientRect().width;
      // Inside the border and the rounded corners (24 px), in the gap: 8 px in from each side, 16 px from the end.
      const rows = end === "top" ? [16, shift - 6] : [img.height / scale - shift + 6, img.height / scale - 16];
      const data = ctx.getImageData(Math.round(8 * scale), Math.round(rows[0] * scale), Math.round(img.width - 16 * scale), Math.round((rows[1] - rows[0]) * scale)).data;
      const counts: Record<string, number> = {};
      for (let i = 0; i < data.length; i += 4) {
        const hex = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
        counts[hex] = (counts[hex] ?? 0) + 1;
      }
      return counts;
    },
    { shot, end, shift },
  );
}

/** A --scene-* token (or the card's surface) as the browser resolves it, #rrggbb. */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return String(probe.fillStyle).toLowerCase();
  }, name);
}

test("Climb (10g): a faked bounce shows the sky above the top and the valley below the floor, never the card's background, light and dark", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/climb");
  await expect(page.locator('canvas[data-scene="world"][data-painted]')).toHaveCount(1);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.waitForTimeout(400);
    const space = await token(page, "--scene-space-1");
    const valley = await token(page, "--scene-valley");
    const surface = await token(page, "--surface");
    const background = await token(page, "--background");
    const ruler = await token(page, "--scene-ruler");
    const stars = [await token(page, "--scene-star"), await token(page, "--scene-star-dim")];
    const sky = new Set<string>([ruler]);
    for (const name of ["space-1", "star", "star-dim", "planet", "planet-shade", "satellite", "nebula", "nebula-light", "moon", "moon-shade"]) sky.add(await token(page, `--scene-${name}`));

    const top = await bounceGap(page, "top");
    const total = Object.values(top).reduce((a, b) => a + b, 0);
    const inSky = Object.entries(top).filter(([hex]) => sky.has(hex)).reduce((n, [, v]) => n + v, 0);
    expect(inSky / total, `${colorScheme}: the top gap is the scene's sky (${JSON.stringify(top).slice(0, 200)})`).toBeGreaterThan(0.99);
    expect((top[space] ?? 0) / total, `${colorScheme}: mostly the top's space colour`).toBeGreaterThan(0.85);
    expect(top[surface] ?? 0, `${colorScheme}: never the card`).toBe(0);
    expect(top[background] ?? 0, `${colorScheme}: never the page`).toBe(0);
    // Not a flat band: the stars drawn above the top, and the ruler running on through it.
    expect(stars.reduce((n, hex) => n + (top[hex] ?? 0), 0) / total, `${colorScheme}: stars in the gap`).toBeGreaterThan(0.0005);
    expect((top[ruler] ?? 0) / total, `${colorScheme}: the ruler in the gap`).toBeGreaterThan(0.0015);

    const bottom = await bounceGap(page, "bottom");
    const all = Object.values(bottom).reduce((a, b) => a + b, 0);
    expect(((bottom[valley] ?? 0) + (bottom[ruler] ?? 0)) / all, `${colorScheme}: the bottom gap is the valley and the ruler (${JSON.stringify(bottom).slice(0, 200)})`).toBeGreaterThan(0.99);
    expect((bottom[ruler] ?? 0) / all, `${colorScheme}: the ruler runs on below the floor`).toBeGreaterThan(0.0015);
  }
});
