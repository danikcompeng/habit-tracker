import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIMB_SCENE, EASE_GLIDE, EASE_OUT, MORPH_ONLY, MOTION } from "./motion";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

describe("motion tokens", () => {
  it.each(Object.entries(MOTION))("--motion-%s in globals.css is %i ms", (name, ms) => {
    expect(css).toMatch(new RegExp(`--motion-${name}:\\s*${ms}ms;`));
  });
  it("--ease-out matches", () => {
    expect(css).toContain(`--ease-out: ${EASE_OUT};`);
  });
  it("--ease-glide matches", () => {
    expect(css).toContain(`--ease-glide: ${EASE_GLIDE};`);
  });
  it("the scene drifts slowly but visibly: a step under a second, never a glide", () => {
    expect(MOTION.drift).toBeGreaterThanOrEqual(400);
    expect(MOTION.drift).toBeLessThan(1_000);
  });
  it("answers to a tap stay between 150 and 250 ms", () => {
    for (const ms of [MOTION.fast, MOTION.base, MOTION.pop]) {
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(250);
    }
  });
  it("Feature 10i's motions are short: 150–400 ms (the morph, the crossfade, the wipe, the pulse)", () => {
    for (const ms of [MOTION.morph, MOTION.base, MOTION.pop]) {
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(400);
    }
  });
});


/** A CSS rule's body, by its exact selector (the first one). */
function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return "";
  return css.slice(at, css.indexOf("}", at) + 1);
}

describe("the stylesheet's Feature 10i motion", () => {
  it("the strip's morph runs on --motion-morph and --ease-glide, clipped and solid in the scene's colour, its pictures 1:1 crossfading evenly (it opens, not stretches)", () => {
    expect(CLIMB_SCENE).toBe("climb-scene");
    expect(MORPH_ONLY).toEqual({ "climb-scene": "morph", default: "none" });
    const group = rule("::view-transition-group(.morph)");
    expect(group).toContain("animation-duration: var(--motion-morph);");
    expect(group).toContain("animation-timing-function: var(--ease-glide);");
    expect(group).toContain("overflow: clip;");
    expect(group).toContain("background: var(--climb-ground);");
    expect(css).toContain("::view-transition-new(.morph) {\n  animation-duration: var(--motion-morph);\n  animation-timing-function: linear;");
    expect(css).toContain("\n::view-transition-old(.morph),\n::view-transition-new(.morph) {\n  height: 100%;\n  object-fit: none;");
  });
  it("a view transition never blocks input: the page isn't captured, and the overlay lets taps through", () => {
    expect(css).toContain("\n:root {\n  view-transition-name: none;\n");
    expect(rule("::view-transition")).toContain("pointer-events: none;");
  });
  it("with Reduce Motion every view transition is instant", () => {
    const at = css.indexOf("@media (prefers-reduced-motion: reduce) {\n  ::view-transition-group(*)");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("::view-transition-old(*)");
    expect(block).toContain("::view-transition-new(*)");
    expect(block).toContain("animation-duration: 0s !important;");
  });
  it("the zone card's entrance is a mask wipe from the left that ends fully open, hidden until it starts", () => {
    const keyframes = css.slice(css.indexOf("@keyframes card-in"), css.indexOf("@keyframes fade-in"));
    // From the left edge (8 px out, so nothing of the card or its focus ring is cut), to fully open.
    expect(keyframes).toMatch(/from \{[^}]*clip-path: inset\(-8px 100% -8px -8px round var\(--radius-key\)\);[^}]*visibility: hidden;/);
    expect(keyframes).toMatch(/to \{[^}]*clip-path: inset\(-8px round var\(--radius-key\)\);/);
  });
});

describe("the scene's ground colour (Feature 10i)", () => {
  it("is sky, or space once the strip has shown space, for the loading boxes and the morph", () => {
    expect(css).toMatch(/:root \{\n  view-transition-name: none;[^}]*--climb-ground: var\(--scene-sky-6\);/);
    expect(css).toContain(":root[data-climb-night] {\n  --climb-ground: var(--scene-space-1);\n}");
  });
});
