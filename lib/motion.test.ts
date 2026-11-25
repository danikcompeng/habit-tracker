import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EASE_OUT, MOTION } from "./motion";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

describe("motion tokens", () => {
  it.each(Object.entries(MOTION))("--motion-%s in globals.css is %i ms", (name, ms) => {
    expect(css).toMatch(new RegExp(`--motion-${name}:\\s*${ms}ms;`));
  });
  it("--ease-out matches", () => {
    expect(css).toContain(`--ease-out: ${EASE_OUT};`);
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
});
