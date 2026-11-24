// Hold's name, icons and colours for the home screen, in one place
// (plans/habit-tracker.md, Feature 5). Same approach as Staple's.
import type { MetadataRoute } from "next";
import { PALETTE } from "./palette";

export const APP_NAME = "Hold";
export const APP_DESCRIPTION = "Habits you press and hold. A streak and a week of dots for each.";

/** The icon's colours: the persimmon field, the bone key, its darker lip. */
export const ICON_COLORS = {
  field: PALETTE.light.accent,
  key: PALETTE.light.background,
  lip: PALETTE.light["accent-lip"],
  check: PALETTE.light.accent,
} as const;

/**
 * - "rounded": a rounded square, for browser tabs and Android's "any" icon.
 * - "full": fills the whole square. iPhone rounds the corners itself, and
 *   it shows see-through corners as black.
 * - "maskable": full-bleed, with the key kept small in the middle, because
 *   Android cuts it to its own shape (circle, squircle...).
 */
export type IconShape = "rounded" | "full" | "maskable";

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
 * iPhone installs keep the old one until removed and added again.)
 */
export const ICON_VERSION = 1;

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
