import { describe, expect, it } from "vitest";
import { APP_ICONS, appManifest, iconByFile, iconUrl } from "./app-identity";
import { PALETTE } from "./palette";

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

  it("serves icons under /icons/ (skipped by the proxy) with a version", () => {
    expect(iconUrl(APP_ICONS[0])).toMatch(/^\/icons\/icon-192\.png\?v=\d+$/);
  });
});

describe("manifest", () => {
  const manifest = appManifest();
  it("opens standalone on Today, keeps its identity, and doesn't lock rotation", () => {
    expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", name: "Hold" });
    expect(manifest.orientation).toBeUndefined();
  });
  it("uses the page background from the palette", () => {
    expect(manifest.background_color).toBe(PALETTE.light.background);
    expect(manifest.theme_color).toBe(PALETTE.light.background);
  });
});
