// Ascend's name, icons and colours for the home screen, in one place
// (plans/habit-tracker.md, Feature 5). Same approach as Staple's.
import type { MetadataRoute } from "next";
import { PALETTE } from "./palette";

export const APP_NAME = "Ascend";
export const APP_DESCRIPTION = "Habits you press and hold. A streak and a week of dots for each.";

/** The icon's colours: the persimmon field and the bone mark on it. */
export const ICON_COLORS = {
  field: PALETTE.light.accent,
  mark: PALETTE.light.background,
} as const;

export type Point = readonly [x: number, y: number];

/**
 * The "Summit" mark, in a 0 0 100 100 box: a solid mountain with a trail
 * cut up its face (the trail shows the field through it). Straight edges
 * and sharp corners only.
 */
export const SUMMIT = {
  mountain: [[50, 14], [88, 84], [12, 84]],
  trail: [[27, 84], [39, 84], [61, 46], [55, 36]],
} as const satisfies Record<string, readonly Point[]>;

/**
 * Android's safe zone for a maskable icon: a centred circle with a radius
 * of 40% of the icon. Whatever shape Android cuts, it never cuts inside it.
 */
export const MASKABLE_SAFE_RADIUS = 40;

/**
 * How much smaller the mark is drawn on the maskable icon, about the
 * centre (50, 50). The base corners are the farthest points from the
 * centre: about 51 at full size, 38.2 at 0.75, so inside the 40 circle.
 */
export const MASKABLE_SCALE = 0.75;

/**
 * - "rounded": a rounded square, for browser tabs and Android's "any" icon.
 * - "full": fills the whole square. iPhone rounds the corners itself, and
 *   it shows see-through corners as black.
 * - "maskable": full-bleed, with the mark drawn smaller so it stays inside
 *   the safe circle, because Android cuts it to its own shape (circle,
 *   squircle...).
 */
export type IconShape = "rounded" | "full" | "maskable";

/** The mark's points for an icon shape, in the 0 0 100 100 box. */
export function summitPoints(shape: IconShape): { mountain: Point[]; trail: Point[] } {
  const scale = shape === "maskable" ? MASKABLE_SCALE : 1;
  const place = ([x, y]: Point): Point => [50 + (x - 50) * scale, 50 + (y - 50) * scale];
  return { mountain: SUMMIT.mountain.map(place), trail: SUMMIT.trail.map(place) };
}

export type AppIconFile = {
  file: string;
  size: number;
  shape: IconShape;
  /** Listed in the manifest (Android). The iPhone icon has its own tag. */
  inManifest: boolean;
};

/** Every icon PNG, served at /icons/<file> by app/icons/[file]/route.tsx. */
export const APP_ICONS: readonly AppIconFile[] = [
  { file: "icon-192.png", size: 192, shape: "rounded", inManifest: true },
  { file: "icon-512.png", size: 512, shape: "rounded", inManifest: true },
  { file: "icon-maskable-512.png", size: 512, shape: "maskable", inManifest: true },
  // 180 x 180 is what iPhones ask for.
  { file: "apple-touch-icon.png", size: 180, shape: "full", inManifest: false },
];

/**
 * Bump when the drawing changes: Next serves these PNGs as cacheable for a
 * year, so a new picture needs a new address to reach browsers and Android
 * installs. (iPhone copies its icon once, when you add the app: existing
 * iPhone installs keep the old one until removed and added again. Installs
 * made from the old address, before the rename to Ascend, keep the old name
 * and icon on both phones: they need adding again from the new address.)
 * lib/app-identity.test.ts pins the drawing next to this number, so a
 * changed drawing fails a test until the version is bumped with it.
 */
export const ICON_VERSION = 2; // 2: the Summit (2026-11-24); 1 was the key and check

export const iconUrl = (icon: AppIconFile) => `/icons/${icon.file}?v=${ICON_VERSION}`;

export function iconByFile(file: string): AppIconFile | undefined {
  return APP_ICONS.find((icon) => icon.file === file);
}

/** The web app manifest: what Android (and iPhone, partly) reads when you install. */
export function appManifest(): MetadataRoute.Manifest {
  return {
    // The app's identity: stays "/" forever, so Android always knows it's
    // the same app, whatever start_url becomes.
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/", // Today, or Log in when you're logged out
    scope: "/",
    display: "standalone",
    // No orientation lock (WCAG 1.3.4): some people have their phone
    // mounted sideways.
    background_color: PALETTE.light.background,
    theme_color: PALETTE.light.background,
    icons: APP_ICONS.filter((icon) => icon.inManifest).map((icon) => ({
      src: iconUrl(icon),
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.shape === "maskable" ? "maskable" : "any",
    })),
  };
}
