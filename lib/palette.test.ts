import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOLD_FILL_MIN_CONTRAST, NON_TEXT_PAIRS, PALETTE, TEXT_PAIRS, contrast, type Mode } from "./palette";

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
