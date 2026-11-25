// Installable (plans/habit-tracker.md, Feature 5). Phones fetch the
// manifest and icons WITHOUT the login cookie, so these run logged out.

import { expect, test, type Page } from "@playwright/test";
import { APP_ICONS, iconByFile, iconUrl } from "../lib/app-identity";

/** Width and height of a PNG, from its header. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("the manifest loads without a login and opens standalone on Today", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ id: "/", name: "Ascend", short_name: "Ascend", start_url: "/", display: "standalone" });
  expect(manifest.orientation).toBeUndefined();
});

for (const icon of APP_ICONS) {
  test(`${icon.file} is a ${icon.size} px PNG, without a login`, async ({ request }) => {
    const response = await request.get(iconUrl(icon), { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(pngSize(await response.body())).toEqual({ width: icon.size, height: icon.size });
  });
}

test("an unknown icon is a 404, not the login page", async ({ request }) => {
  const response = await request.get("/icons/nope.png", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

/**
 * The distinct values of an attribute on matching tags. A production build
 * streams the page's metadata a second time (Partial Prerendering), so the
 * same tag can appear twice; what matters is that there's only one value.
 */
async function distinct(page: Page, selector: string, attribute: string) {
  const values = await page.locator(selector).evaluateAll((els, a) => els.map((el) => el.getAttribute(a)), attribute);
  return [...new Set(values)];
}

test("pages link the manifest and our icons, and never the default favicon", async ({ page }) => {
  await page.goto("/login");
  expect(await distinct(page, 'link[rel="manifest"]', "href")).toEqual(["/manifest.webmanifest"]);
  // Exact, so the current ICON_VERSION is in the address.
  expect(await distinct(page, 'link[rel="apple-touch-icon"]', "href")).toEqual([iconUrl(iconByFile("apple-touch-icon.png")!)]);
  expect(await distinct(page, 'link[rel="icon"]', "href")).toEqual([iconUrl(iconByFile("icon-192.png")!)]);
  await expect(page.locator('link[href*="favicon.ico"]')).toHaveCount(0);
});

test("iPhone home-screen tags: the name, a solid status bar, and the 180 px icon", async ({ page }) => {
  await page.goto("/login");
  expect(await distinct(page, 'meta[name="apple-mobile-web-app-title"]', "content")).toEqual(["Ascend"]);
  expect(await distinct(page, 'meta[name="apple-mobile-web-app-status-bar-style"]', "content")).toEqual(["default"]);
  expect(await distinct(page, 'link[rel="apple-touch-icon"]', "sizes")).toEqual(["180x180"]);
});

test("/favicon.ico is a plain 404, not a redirect to the login page", async ({ request }) => {
  const response = await request.get("/favicon.ico", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

/**
 * The RGBA of one pixel of an icon, at (x, y) in the drawing's 0 0 100 100
 * box (kept 1 px inside the edges), read through a canvas in the page.
 */
function iconPixel(page: Page, file: string, x: number, y: number) {
  return page.evaluate(
    async ({ src, x, y }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const px = Math.min(img.width - 2, Math.max(1, Math.floor((img.width * x) / 100)));
      const py = Math.min(img.height - 2, Math.max(1, Math.floor((img.height * y) / 100)));
      return Array.from(ctx.getImageData(px, py, 1, 1).data);
    },
    { src: iconUrl(iconByFile(file)!), x, y },
  );
}

const BONE = [0xf4, 0xef, 0xe6, 255];
const PERSIMMON = [0xb8, 0x42, 0x0e, 255];

test("the drawings have the right corners: iPhone opaque, tab icon rounded (see-through), maskable full-bleed", async ({ page }) => {
  await page.goto("/login");
  expect((await iconPixel(page, "apple-touch-icon.png", 0, 0))[3]).toBe(255);
  expect((await iconPixel(page, "icon-192.png", 0, 0))[3]).toBe(0);
  expect(await iconPixel(page, "icon-maskable-512.png", 0, 0)).toEqual(PERSIMMON); // opaque
});

test("the Summit is drawn: a bone mountain, the trail showing the field, smaller on the maskable icon", async ({ page }) => {
  await page.goto("/login");
  for (const file of ["icon-512.png", "apple-touch-icon.png"]) {
    expect(await iconPixel(page, file, 70, 75), `${file} mountain`).toEqual(BONE);
    expect(await iconPixel(page, file, 38, 72), `${file} trail`).toEqual(PERSIMMON);
    expect(await iconPixel(page, file, 15, 82), `${file} base corner`).toEqual(BONE);
  }
  // Maskable: scaled by 0.75 about the centre, so where the full-size base
  // corner would be is field, and the scaled corner is mountain.
  expect(await iconPixel(page, "icon-maskable-512.png", 15, 82), "maskable, unscaled corner").toEqual(PERSIMMON);
  expect(await iconPixel(page, "icon-maskable-512.png", 24, 74), "maskable, scaled corner").toEqual(BONE);
});
