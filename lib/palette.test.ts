import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOLD_FILL_MIN_CONTRAST, NON_TEXT_PAIRS, PALETTE, SCENE_BACKDROPS, SCENE_PALETTE, TEXT_PAIRS, contrast, type Mode } from "./palette";
import { ROLES, ringFor } from "./climb-scene/scene";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** The --name: #hex values in the block that follows `marker` in globals.css. */
function cssColors(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`globals.css has no "${marker}" block`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2].toUpperCase()]));
}

describe.each(["light", "dark"] as Mode[])("%s palette", (mode) => {
  const colors = PALETTE[mode];

  it.each(TEXT_PAIRS)("%s text on %s is at least 4.5:1", (text, on) => {
    expect(contrast(colors[text], colors[on])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("%s on %s is at least 3:1", (mark, on) => {
    expect(contrast(colors[mark], colors[on])).toBeGreaterThanOrEqual(3);
  });

  it(`the hold fill is at least ${HOLD_FILL_MIN_CONTRAST}:1 against the key it grows over`, () => {
    expect(contrast(colors["accent-tint"], colors.surface)).toBeGreaterThanOrEqual(HOLD_FILL_MIN_CONTRAST);
  });

  // ...and at its ceiling: darker would fail the accent dots on it (light)
  // and crowd a done key (dark), so a held key could pass for a done one.
  it("the hold fill stays clearly apart from a done key (at least 2.4:1)", () => {
    expect(contrast(colors["accent-tint"], colors["accent-key"])).toBeGreaterThanOrEqual(2.4);
  });

  it("globals.css has exactly these colours", () => {
    const fromCss = cssColors(mode === "light" ? "/* light */" : "/* dark */");
    const expected = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, v.toUpperCase()]));
    expect(fromCss).toEqual(expected);
  });
});

describe("contrast", () => {
  it("matches known WCAG values", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
  });
});

describe.each(["light", "dark"] as Mode[])("%s scene palette (Feature 10)", (mode) => {
  const scene = SCENE_PALETTE[mode];

  it("has a colour for every role the scene draws, and globals.css has exactly these", () => {
    // Every role the scene draws, plus the ruler (drawn by the page over the scene).
    expect(Object.keys(scene).sort()).toEqual([...ROLES.filter((r) => r !== "none"), "ruler"].sort());
    const marker = mode === "light" ? "/* scene light */" : "/* scene dark */";
    const start = css.indexOf(marker);
    const block = css.slice(start, css.indexOf("}", start));
    const fromCss = Object.fromEntries([...block.matchAll(/--scene-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2].toUpperCase()]));
    expect(fromCss).toEqual(Object.fromEntries(Object.entries(scene).map(([k, v]) => [k, v.toUpperCase()])));
  });

  it("the marker (the balloon) is Ascend's accent, shaded with its lip", () => {
    expect(scene.marker.toUpperCase()).toBe(PALETTE[mode].accent.toUpperCase());
    expect(scene["balloon-shade"].toUpperCase()).toBe(PALETTE[mode]["accent-lip"].toUpperCase());
  });

  it("the marker's ring has a light and a dark colour, 3:1 apart, and the flag stands out from its light ring", () => {
    expect(contrast(scene["marker-ring"], scene["marker-edge"])).toBeGreaterThanOrEqual(3);
  });

  // The ring takes whichever of its two colours stands out more from what's
  // under it (ringFor in lib/climb-scene/scene.ts): that one must be 3:1.
  it.each(SCENE_BACKDROPS)("the marker's ring stands out 3:1 on %s", (backdrop) => {
    const ring = ringFor(scene, backdrop);
    expect(contrast(scene[ring], scene[backdrop])).toBeGreaterThanOrEqual(3);
  });
});
