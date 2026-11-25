import { describe, expect, it } from "vitest";
import { SUMMIT_M } from "../altitude";
import { MEDIUM_CLOUDS, ROLES, SKY_BANDS, SMALL_CLOUDS, drawClose, drawWorld, mountainSpan, seeded, skyBand, trailX, worldTop } from "./scene";

const world = (o: Partial<Parameters<typeof drawWorld>[0]> = {}) =>
  drawWorld({ width: 88, height: 480, metresPerRow: 25, bottom: 0, top: 12_000, theme: "light", time: 0, altitude: 7_113, driftMs: 700, moon: { x: 12, y: 30 }, ...o });
const role = (name: (typeof ROLES)[number]) => ROLES.indexOf(name);
const count = (px: Uint8Array, r: number) => px.reduce((n, v) => n + (v === r ? 1 : 0), 0);

describe("the Climb's scene", () => {
  it("is the same every time it's drawn (seeded), and every pixel is a known role", () => {
    const a = world();
    const b = world();
    expect(Buffer.from(a.px).equals(Buffer.from(b.px))).toBe(true);
    expect(Math.max(...a.px)).toBeLessThan(ROLES.length);
    expect(count(a.px, role("none"))).toBe(0);
  });

  it("draws your marker, once, where your altitude is", () => {
    const a = world();
    expect(count(a.px, role("marker"))).toBeGreaterThan(5);
    const markerRows = new Set<number>();
    a.px.forEach((v, i) => v === role("marker") && markerRows.add(Math.floor(i / a.width)));
    const markerRow = Math.max(...markerRows); // the pole's foot
    expect(Math.abs(markerRow - (480 - 1 - Math.round(7_113 / 25)))).toBeLessThanOrEqual(1);
    expect(count(world({ altitude: null }).px, role("marker"))).toBe(0);
  });

  it("dark has stars and the moon; light has neither", () => {
    const dark = world({ theme: "dark" });
    expect(count(dark.px, role("star")) + count(dark.px, role("star-dim"))).toBeGreaterThan(20);
    expect(count(world({ theme: "dark" }).px, role("moon"))).toBeGreaterThan(10);
    expect(count(world().px, role("star"))).toBe(0);
    expect(count(world().px, role("moon"))).toBe(0);
  });

  it("the sky is stepped by altitude, and fixed in metres (it doesn't shift as the world grows)", () => {
    expect(skyBand(0)).toBe(role("sky-12"));
    expect(skyBand(SKY_BANDS[0])).toBe(role("sky-11"));
    expect(skyBand(50_000)).toBe(role("sky-1"));
    // The bottom 12,000 m look the same whether the world tops out at 12,000 or 20,000 m.
    const low = world({ top: 12_000, moon: null });
    const tall = drawWorld({ width: 88, height: 800, metresPerRow: 25, bottom: 0, top: 20_000, theme: "light", time: 0, altitude: 7_113, driftMs: 700, moon: null });
    const lowBottom = low.px.slice((480 - 400) * 88);
    const tallBottom = tall.px.slice((800 - 400) * 88);
    expect(Buffer.from(lowBottom).equals(Buffer.from(tallBottom))).toBe(true);
  });

  it("the world's top is 12,000 m, or 1,500 m above you in 2,500 m steps", () => {
    expect(worldTop(0)).toBe(12_000);
    expect(worldTop(10_000)).toBe(12_500);
    expect(worldTop(36_000)).toBe(37_500);
  });

  it("the mountain narrows to its summit at 8,848 m, and the climbing line stays on it", () => {
    for (const a of [0, 1_000, 3_000, 6_000, 8_000]) {
      const span = mountainSpan(a, 88)!;
      expect(span.left).toBeLessThan(span.right);
      const x = trailX(a, 88);
      expect(x).toBeGreaterThanOrEqual(Math.floor(span.left));
      expect(x).toBeLessThanOrEqual(Math.ceil(span.right));
    }
    expect(mountainSpan(SUMMIT_M, 88)).toBeNull();
    expect(mountainSpan(1_000, 88)!.right - mountainSpan(1_000, 88)!.left).toBeGreaterThan(mountainSpan(7_000, 88)!.right - mountainSpan(7_000, 88)!.left);
  });

  it("clouds drift with time (a step at a time), and stand still at time 0", () => {
    const still = world({ time: 0 });
    const later = world({ time: 50_000 });
    expect(Buffer.from(still.px).equals(Buffer.from(later.px))).toBe(false);
    expect(Buffer.from(world({ time: 0 }).px).equals(Buffer.from(still.px))).toBe(true);
  });

  it("the close-up (Today's strip) shows your marker in its middle rows", () => {
    const close = drawClose({ width: 88, height: 35, theme: "light", time: 0, altitude: 7_113, driftMs: 700 });
    const rows = new Set<number>();
    close.px.forEach((v, i) => v === role("marker") && rows.add(Math.floor(i / close.width)));
    expect(Math.max(...rows)).toBeGreaterThan(12);
    expect(Math.max(...rows)).toBeLessThan(24);
  });

  it("cloud shapes are well formed: positive radii, inside their width, a flat base below every bump", () => {
    for (const shape of [...SMALL_CLOUDS, ...MEDIUM_CLOUDS]) {
      for (const b of shape.bumps) {
        expect(b.r).toBeGreaterThan(0);
        expect(b.x - b.r).toBeGreaterThanOrEqual(0);
        expect(b.x + b.r).toBeLessThanOrEqual(shape.width);
        expect(b.y).toBeLessThanOrEqual(shape.base);
      }
    }
  });

  it("the marker's ring takes the colour that stands out from what's under it", () => {
    const scene = world({ theme: "dark" });
    expect(count(scene.px, role("marker-ring")) + count(scene.px, role("marker-edge"))).toBeGreaterThan(10);
  });

  it("the random numbers are seeded", () => {
    const draws = (g: () => number) => Array.from({ length: 5 }, g);
    expect(draws(seeded(1))).toEqual(draws(seeded(1)));
    expect(draws(seeded(1))).not.toEqual(draws(seeded(2)));
  });
});
