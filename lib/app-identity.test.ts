import { describe, expect, it } from "vitest";
import {
  APP_ICONS,
  APP_NAME,
  ICON_COLORS,
  ICON_VERSION,
  MASKABLE_SAFE_RADIUS,
  MASKABLE_SCALE,
  SUMMIT,
  appManifest,
  iconByFile,
  iconUrl,
  summitPoints,
} from "./app-identity";
import { PALETTE, contrast } from "./palette";

describe("app icons", () => {
  it("has the four files phones ask for, with the right shapes", () => {
    expect(APP_ICONS.map((i) => [i.file, i.size, i.shape])).toEqual([
      ["icon-192.png", 192, "rounded"],
      ["icon-512.png", 512, "rounded"],
      ["icon-maskable-512.png", 512, "maskable"],
      ["apple-touch-icon.png", 180, "full"], // iPhone: opaque, no rounded corners
    ]);
  });

  it("every manifest icon is a file the route serves, at its real size", () => {
    for (const icon of appManifest().icons ?? []) {
      const file = icon.src.replace(/^\/icons\//, "").replace(/\?.*$/, "");
      const known = iconByFile(file);
      expect(known, icon.src).toBeDefined();
      expect(icon.sizes).toBe(`${known!.size}x${known!.size}`);
    }
  });

  it("only the maskable icon is marked maskable", () => {
    const purposes = (appManifest().icons ?? []).map((i) => i.purpose);
    expect(purposes).toEqual(["any", "any", "maskable"]);
  });

  it("serves icons under /icons/ (skipped by the proxy) with the current version", () => {
    expect(iconUrl(APP_ICONS[0])).toBe(`/icons/icon-192.png?v=${ICON_VERSION}`);
  });

  it("pins the drawing to ICON_VERSION: change the drawing, bump the version and this test together", () => {
    expect({ version: ICON_VERSION, SUMMIT, MASKABLE_SCALE, ICON_COLORS }).toEqual({
      version: 2, // the Summit (2026-11-24); 1 was the key with a check
      SUMMIT: {
        mountain: [[50, 14], [88, 84], [12, 84]],
        trail: [[27, 84], [39, 84], [61, 46], [55, 36]],
      },
      MASKABLE_SCALE: 0.75,
      ICON_COLORS: { field: "#B8420E", mark: "#F4EFE6" },
    });
  });
});

describe("the Summit mark", () => {
  const distance = ([x, y]: readonly [number, number]) => Math.hypot(x - 50, y - 50);

  it("is drawn exactly as specified on the tab and iPhone icons", () => {
    for (const shape of ["rounded", "full"] as const) {
      expect(summitPoints(shape)).toEqual({ mountain: SUMMIT.mountain, trail: SUMMIT.trail });
    }
  });

  it("keeps every corner of the maskable mountain inside Android's safe circle (radius 40%)", () => {
    const { mountain, trail } = summitPoints("maskable");
    for (const point of [...mountain, ...trail]) {
      expect(distance(point), `${point}`).toBeLessThanOrEqual(MASKABLE_SAFE_RADIUS);
    }
    // Not shrunk more than it needs to be: the base corners stay near the edge of the circle.
    expect(Math.max(...mountain.map(distance))).toBeGreaterThan(MASKABLE_SAFE_RADIUS * 0.9);
  });

  it("at full size it would NOT fit the safe circle (so the scaling matters)", () => {
    expect(Math.max(...SUMMIT.mountain.map(distance))).toBeGreaterThan(MASKABLE_SAFE_RADIUS);
  });

  it("keeps the trail inside the mountain's face", () => {
    // Left edge (50,14)-(12,84) and right edge (50,14)-(88,84), at a given height.
    const halfWidth = (y: number) => ((y - 14) / 70) * 38;
    for (const [x, y] of SUMMIT.trail) {
      expect(y).toBeGreaterThanOrEqual(14);
      expect(y).toBeLessThanOrEqual(84);
      expect(Math.abs(x - 50)).toBeLessThanOrEqual(halfWidth(y));
    }
  });

  it("bone on persimmon is at least 3:1, as a graphic needs", () => {
    expect(ICON_COLORS).toEqual({ field: PALETTE.light.accent, mark: PALETTE.light.background });
    expect(contrast(ICON_COLORS.mark, ICON_COLORS.field)).toBeGreaterThanOrEqual(3);
  });
});

describe("manifest", () => {
  const manifest = appManifest();
  it("opens standalone on Today, keeps its identity, and doesn't lock rotation", () => {
    expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", name: "Ascend", short_name: "Ascend" });
    expect(APP_NAME).toBe("Ascend");
    expect(manifest.orientation).toBeUndefined();
  });
  it("uses the page background from the palette", () => {
    expect(manifest.background_color).toBe(PALETTE.light.background);
    expect(manifest.theme_color).toBe(PALETTE.light.background);
  });
});
