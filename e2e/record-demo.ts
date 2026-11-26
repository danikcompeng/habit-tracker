// Records Ascend's silent demo videos on production: `npm run record:demo`.
// The same format as Bitewise's (meal-cost-tracker/design/videos): a
// 393 x 852 phone screen at 2x (786 x 1704), H.264 .mp4, no audio; here at
// 30 fps.
//
// Two takes, light and dark, each in a fresh browser (so the Summit card
// hasn't been seen on this "device"), logged in ONLY through "Try the demo".
// Each take puts the demo's sample habits back first, off camera, and the
// last step puts them back again: the demo is shared with real visitors.
//
// Makes, in design/videos/:
//   ascend-demo-{light,dark}.mp4  the tour (about 50 s)
//   ascend-loop-{light,dark}.mp4  Today, holding the open habits until the
//                                 Summit card (about 15 s), fading from and
//                                 to the page's colour, so it loops cleanly
//   ascend-summit.gif             the light loop, 360 px wide at 20 fps
//
// The shot list:
//   1. Login → Try the demo.
//   2. Today: the strip at 8,763 m, the peak in view.
//   3. Hold each open habit (the fill grows under the finger); the last
//      makes a perfect day: the Summit card.
//   4. History: 7 → 30 → 90 days.
//   5. Climb from the strip: the balloon, then a slow scroll up past the
//      Summit, through the clouds and the stratosphere into space; a pause
//      in space, then back to Today.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { Film, findFfmpeg, FPS } from "./helpers/film";
import { easeInOut, Finger, scrollTarget, showTouches } from "./helpers/finger";
import { reseedDemo } from "./helpers/seed";

const VIDEOS = path.resolve("design", "videos");
const BASE_URL = process.env.BASE_URL ?? "https://ascend-dk.vercel.app";
/** Bitewise's phone: 393 x 852 at 2x. */
const PHONE = {
  userAgent: devices["iPhone 14"].userAgent,
  viewport: { width: 393, height: 852 },
  screen: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
/** The page's background (app/globals.css --background), for the loop's fade. */
const BACKGROUND = { light: "0xF4EFE6", dark: "0x191613" } as const;
/** The Climb window's scroll ends with its middle here: Space, Moonlight's moon above. */
const SPACE_M = 22_600;
/** Seconds the scroll from your balloon up to space takes. */
const SCROLL_S = 11;

type Theme = keyof typeof BACKGROUND;

test.describe.configure({ mode: "serial" });

/**
 * Glides the page to `y` over `ms`, one eased step a video frame, each kept
 * for exactly 1/30 s (Film.stepped), so the glide is as even as the scroll.
 */
async function glide(film: Film, page: Page, y: number, ms: number) {
  const from = await page.evaluate(() => window.scrollY);
  if (Math.abs(from - y) < 1) return;
  const steps = Math.round((ms / 1000) * FPS);
  await film.stepped(steps, (i) =>
    page.evaluate((top) => {
      window.scrollTo({ top, behavior: "instant" });
      return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, from + (y - from) * easeInOut((i + 1) / steps)),
  );
  await page.waitForTimeout(200);
}

const habit = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const strip = (page: Page) => page.getByRole("link", { name: /^Altitude/ });

async function act(page: Page, film: Film) {
  const finger = await Finger.on(page);
  const pause = (ms: number) => page.waitForTimeout(ms);

  // 1. Login → Try the demo.
  film.mark("start");
  await pause(1800);
  await finger.tap(page.getByRole("button", { name: "Try the demo" }));
  film.mark("tapped");
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(habit(page, "Read 10 pages")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('canvas[data-scene="close"][data-painted]')).toHaveCount(1);

  // 2. The strip at 8,763 m, the peak in view.
  await expect(strip(page)).toHaveAccessibleName(/^Altitude 8,7\d\d m/);
  film.mark("today");
  await pause(3400);

  // 3. Hold each open habit. The one below the fold first, so the last two
  //    (and the Summit card, on the strip) are at the top of the screen.
  await glide(film, page, await scrollTarget(habit(page, "No phone in bed")), 700);
  await pause(500);
  await finger.hold(habit(page, "No phone in bed"), 1000);
  await expect(habit(page, "No phone in bed")).toHaveAttribute("aria-pressed", "true");
  await pause(900);
  await glide(film, page, 0, 800);
  await pause(400);
  await finger.hold(habit(page, "Read 10 pages"), 1000);
  await expect(habit(page, "Read 10 pages")).toHaveAttribute("aria-pressed", "true");
  await pause(900);
  await finger.hold(habit(page, "Stretch for 5 minutes"), 1000);
  const card = page.getByRole("button", { name: /New zone Summit/ });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText("+70 m");
  film.mark("summit");
  await pause(2800);
  film.mark("loopEnd");

  // 4. History: 7 → 30 → 90 days.
  await finger.tap(page.getByRole("link", { name: "History" }));
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
  const range = (days: number) => page.getByRole("button", { name: `${days} days` });
  if ((await range(7).getAttribute("aria-pressed")) !== "true") await finger.tap(range(7));
  await expect(range(7)).toHaveAttribute("aria-pressed", "true");
  await pause(1800);
  await finger.tap(range(30));
  await expect(range(30)).toHaveAttribute("aria-pressed", "true");
  await pause(2000);
  await finger.tap(range(90));
  await expect(range(90)).toHaveAttribute("aria-pressed", "true");
  await pause(2400);
  await finger.tap(page.getByRole("link", { name: "Done" }));
  await expect(strip(page)).toBeVisible();
  await pause(900);

  // 5. Climb from the strip: your balloon, then up into space.
  await finger.tap(strip(page));
  await expect(page.getByRole("heading", { name: "Climb", level: 1 })).toBeVisible();
  await expect(page.locator('canvas[data-scene="world"][data-painted]')).toHaveCount(1);
  await pause(2400);
  const climb = page.getByRole("region", { name: /^The climb/ });
  const { from, to } = await climb.evaluate((el, middle) => {
    // The world's top is in its name ("… to 46,000 m"); 25 m a row, 3 css px a row.
    const top = Number((el.getAttribute("aria-label") ?? "").match(/([\d,]+) m$/)![1].replace(/,/g, ""));
    return { from: el.scrollTop, to: Math.max(0, ((top - middle) / 25) * 3 - el.clientHeight / 2) };
  }, SPACE_M);
  // One step a video frame (eased in and out), each kept for exactly 1/30 s (Film.stepped).
  film.mark("scroll");
  const steps = SCROLL_S * FPS;
  await film.stepped(steps, (i) =>
    climb.evaluate((el, y) => {
      el.scrollTop = y;
      // Resolves once the new position has been painted.
      return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, from + (to - from) * easeInOut((i + 1) / steps)),
  );
  film.mark("space");
  await pause(2800);
  await finger.tap(page.getByRole("link", { name: "Done" }));
  await expect(strip(page)).toBeVisible();
  await pause(2000);
}

/** Size in MB, one decimal. */
function megabytes(file: string) {
  return (fs.statSync(file).size / 1024 / 1024).toFixed(1);
}

async function take(browser: Browser, theme: Theme) {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) throw new Error("record:demo needs ffmpeg: put it on the PATH or set FFMPEG_PATH");
  // Off camera: the sample habits, fresh (2 of 5 done, 8,763 m).
  await reseedDemo();
  const context = await browser.newContext({ ...PHONE, baseURL: BASE_URL, colorScheme: theme, reducedMotion: "no-preference" });
  await showTouches(context);
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Try the demo" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const film = await Film.roll(page, path.resolve("test-results", `recording-${theme}`), { width: 786, height: 1704 });
    try {
      await act(page, film);
    } finally {
      await film.stop();
    }
    const demo = path.join(VIDEOS, `ascend-demo-${theme}.mp4`);
    const loop = path.join(VIDEOS, `ascend-loop-${theme}.mp4`);
    // The tour skips the wait for the sign-in (it varies on production): a cut from the tap to Today.
    const signIn = film.at("today") - film.at("tapped") > 1_500;
    const tour = signIn
      ? [{ from: film.at("start"), to: film.at("tapped") + 600 }, { from: film.at("today") - 300, to: film.at("end") }]
      : [{ from: film.at("start"), to: film.at("end") }];
    const full = film.encode(ffmpeg, demo, tour, { fade: BACKGROUND[theme] });
    const short = film.encode(ffmpeg, loop, [{ from: film.at("today"), to: film.at("loopEnd") }], { fade: BACKGROUND[theme] });
    console.log(`${theme}: tour ${full.seconds.toFixed(1)} s (${megabytes(demo)} MB), loop ${short.seconds.toFixed(1)} s (${megabytes(loop)} MB)`);
    console.log(`${theme}: frames drawn a second: holds ${film.rate(film.at("today"), film.at("loopEnd")).toFixed(1)}, Climb's scroll ${film.rate(film.at("scroll"), film.at("space")).toFixed(1)}`);
    console.log(`${theme}: marks (s): summit ${(film.at("summit") / 1000).toFixed(2)}, space ${(film.at("space") / 1000).toFixed(2)}, loop from ${(film.at("today") / 1000).toFixed(2)}`);
    if (theme === "light") {
      // The README's GIF: the light loop, 360 px wide at 20 fps, one palette for the whole clip.
      const gif = path.join(VIDEOS, "ascend-summit.gif");
      const result = spawnSync(ffmpeg, [
        "-y", "-hide_banner", "-loglevel", "error", "-i", loop,
        "-vf", "fps=20,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
        "-loop", "0", gif,
      ], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`ffmpeg failed for the GIF:\n${result.stderr}`);
      console.log(`gif: ${megabytes(gif)} MB`);
    }
  } finally {
    await context.close();
  }
}

for (const theme of ["light", "dark"] as const satisfies readonly Theme[]) {
  test(`${theme} take`, async ({ browser }) => {
    test.setTimeout(240_000);
    await take(browser, theme);
  });
}

test("the demo is back as it was: a fresh sign-in at 8,763 m, three habits open", async ({ browser }) => {
  await reseedDemo();
  const context = await browser.newContext({ ...PHONE, baseURL: BASE_URL });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expect(strip(page)).toHaveAccessibleName(/^Altitude 8,763 m/);
    for (const name of ["Read 10 pages", "Stretch for 5 minutes", "No phone in bed"]) await expect(habit(page, name)).toHaveAttribute("aria-pressed", "false");
    for (const name of ["Drink a glass of water", "Walk outside"]) await expect(habit(page, name)).toHaveAttribute("aria-pressed", "true");
  } finally {
    await context.close();
  }
});
