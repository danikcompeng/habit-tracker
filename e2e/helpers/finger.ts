// A finger for the demo recording: real touch events at a human pace, and a
// soft dot where it touches, so viewers see every tap and hold (adapted from
// Bitewise's, meal-cost-tracker/e2e/helpers/finger.ts).
//
// Playwright's click() lands instantly, which looks robotic on video, and a
// hold needs the finger to stay down. So this sends the browser's touch
// events directly (Chrome DevTools Protocol), the same way a phone does:
// the app sees a real touch (pointerType "touch") and its hold gesture
// (lib/hold.ts) runs exactly as on a phone.

import type { BrowserContext, CDPSession, Locator, Page } from "@playwright/test";

type Point = { x: number; y: number };

/** Slow at both ends, quick in the middle. t goes 0 → 1. */
export function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * On every page of `context`: a soft grey dot with a white rim under each
 * touch (it follows the finger, and fades when it lifts). Recording only:
 * it never takes a touch itself (pointer-events: none).
 */
export async function showTouches(context: BrowserContext) {
  await context.addInitScript(() => {
    const dot = document.createElement("div");
    dot.setAttribute("aria-hidden", "true");
    dot.style.cssText = [
      "position:fixed", "left:0", "top:0", "width:46px", "height:46px", "margin:-23px 0 0 -23px",
      "border-radius:50%", "pointer-events:none", "z-index:2147483647",
      "background:rgba(70,70,70,0.22)", "border:2px solid rgba(255,255,255,0.85)",
      "box-shadow:0 0 0 1px rgba(0,0,0,0.12),0 2px 10px rgba(0,0,0,0.18)",
      "opacity:0", "transform:scale(0.6)", "transition:opacity 220ms ease-out, transform 160ms ease-out",
    ].join(";");
    const place = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) dot.style.translate = `${t.clientX}px ${t.clientY}px`;
    };
    addEventListener("touchstart", (e) => {
      if (!dot.isConnected) document.body.append(dot);
      place(e);
      dot.style.opacity = "1";
      dot.style.transform = "scale(1)";
    }, { capture: true, passive: true });
    addEventListener("touchmove", place, { capture: true, passive: true });
    const lift = () => {
      dot.style.opacity = "0";
      dot.style.transform = "scale(0.85)";
    };
    addEventListener("touchend", lift, { capture: true, passive: true });
    addEventListener("touchcancel", lift, { capture: true, passive: true });
  });
}

export class Finger {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
  ) {}

  static async on(page: Page): Promise<Finger> {
    return new Finger(page, await page.context().newCDPSession(page));
  }

  private async touch(type: "touchStart" | "touchMove" | "touchEnd", at?: Point) {
    await this.cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: at ? [{ x: at.x, y: at.y, radiusX: 10, radiusY: 10, force: 1, id: 1 }] : [],
    });
  }

  /** The middle of an element (which must already be in view: see glideTo). */
  private async centre(target: Locator): Promise<Point> {
    const box = await target.boundingBox();
    if (!box) throw new Error(`Finger: can't see ${target}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** A tap held for a moment, like a thumb, so the app's press shows. Waits until it can be tapped. */
  async tap(target: Locator, { hold = 120 } = {}) {
    await target.click({ trial: true });
    await this.press(await this.centre(target), hold);
  }

  /** Puts the finger down on `target` for `ms` (a hold), then lifts it. */
  async hold(target: Locator, ms: number) {
    await target.click({ trial: true });
    await this.press(await this.centre(target), ms);
  }

  private async press(at: Point, ms: number) {
    await this.touch("touchStart", at);
    await this.page.waitForTimeout(ms);
    await this.touch("touchEnd");
  }
}

/**
 * Glides the page so `target` is in view (its bottom `margin` px above the
 * screen's bottom, or its top `margin` px below the top), in small eased
 * steps: between steps the page stands still, so every frame catches it at
 * rest. Nothing happens if it's already in view.
 */
export async function glideTo(target: Locator, { margin = 24, ms = 700 } = {}) {
  await glide(target.page(), await scrollTarget(target, margin), ms);
}

/** Where the page should be scrolled to (scrollY) so `target` is in view, `margin` px from the edge. */
export async function scrollTarget(target: Locator, margin = 24): Promise<number> {
  return target.evaluate((el, margin) => {
    const box = el.getBoundingClientRect();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    let top = window.scrollY;
    if (box.bottom > window.innerHeight - margin) top += box.bottom - (window.innerHeight - margin);
    else if (box.top < margin) top += box.top - margin;
    return Math.max(0, Math.min(top, max));
  }, margin);
}

/** Glides the page to `y` in small eased steps (about one per frame). */
export async function glide(page: Page, y: number, ms = 700) {
  const from = await page.evaluate(() => window.scrollY);
  if (Math.abs(from - y) < 1) return;
  const steps = Math.max(1, Math.round(ms / 40));
  for (let i = 1; i <= steps; i++) {
    const top = from + (y - from) * easeInOut(i / steps);
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), top);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
}
