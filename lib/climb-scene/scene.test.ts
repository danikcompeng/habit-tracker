import { describe, expect, it } from "vitest";
import { nextZone } from "../altitude";
import { MEDIUM_CLOUDS, MIST_ABOVE_M, ROLES, SKY_BANDS, SMALL_CLOUDS, drawClose, drawWorld, drawWorldBase, mistLine, mountainSpan, seeded, skyBand, trailX, worldTop } from "./scene";

const world = (o: Partial<Parameters<typeof drawWorld>[0]> = {}) =>
  drawWorld({ width: 88, height: 480, metresPerRow: 25, bottom: 0, top: 12_000, theme: "light", time: 0, altitude: 7_113, you: 7_113, driftMs: 700, moon: { x: 12, y: 30 }, ...o });
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
    const tall = drawWorld({ width: 88, height: 800, metresPerRow: 25, bottom: 0, top: 20_000, theme: "light", time: 0, altitude: 7_113, you: 7_113, driftMs: 700, moon: null });
    const lowBottom = low.px.slice((480 - 400) * 88);
    const tallBottom = tall.px.slice((800 - 400) * 88);
    expect(Buffer.from(lowBottom).equals(Buffer.from(tallBottom))).toBe(true);
  });

  it("the world's top is 12,000 m, or 1,500 m above you in 2,500 m steps", () => {
    expect(worldTop(0)).toBe(12_600);
    // Past the next zone too: at 10,000 m the next is Jet stream (12,500 m), so 15,000 m.
    expect(worldTop(10_000)).toBe(15_600);
    expect(worldTop(36_000)).toBe(40_600);
  });

  it("the mountain is a broad cone around you: wider below, never a point, and the climbing line stays on it", () => {
    for (const you of [0, 3_000, 7_113, 12_000, 30_000]) {
      const at = mountainSpan(you, 117, you)!;
      expect(at.right - at.left, `${you} m: about half the width where you stand`).toBeGreaterThan(117 * 0.45);
      const below = mountainSpan(you - 2_000, 117, you)!;
      expect(below.right - below.left, `${you} m: wider below`).toBeGreaterThan(at.right - at.left);
      const x = trailX(you, 117, you);
      expect(x).toBeGreaterThan(at.left);
      expect(x).toBeLessThan(117 / 2);
      // Just under the cloud cap it's still broad: no peak.
      const top = mountainSpan(mistLine(you) - 1, 117, you)!;
      expect(top.right - top.left, `${you} m: no point under the cap`).toBeGreaterThan(117 * 0.3);
      expect(mountainSpan(mistLine(you), 117, you)).toBeNull();
    }
  });

  it("the top is never seen: no mountain above the cloud cap, and mountain right below it, in both views and at any height", () => {
    const mountain = new Set((["rock", "rock-shade", "snow", "snow-shade", "pine", "pine-dark", "ridge-far", "ridge-near", "valley", "valley-dark"] as const).map(role));
    for (const you of [0, 3_000, 7_113, 8_763, 9_500, 12_000, 30_000]) {
      for (const theme of ["light", "dark"] as const) {
        // Climb: 25 m a row, the whole world.
        const top = worldTop(you);
        const height = Math.ceil(top / 25);
        const w = drawWorld({ width: 117, height, metresPerRow: 25, bottom: 0, top, you, theme, time: 0, altitude: you, driftMs: 700, moon: null });
        const capRow = height - 1 - Math.round((you + MIST_ABOVE_M) / 25);
        for (let y = 0; y < capRow - 2; y++) {
          for (let x = 0; x < 117; x++) expect(mountain.has(w.px[y * 117 + x]), `${you} m ${theme}: mountain above the cap at row ${y}`).toBe(false);
        }
        // Today's strip: 40 m a row around you.
        const close = drawClose({ width: 117, height: 47, theme, time: 0, altitude: you, you, driftMs: 700 });
        // You stand 60% of the way down the strip.
        const closeCap = Math.round(47 * 0.6) - Math.round(MIST_ABOVE_M / 40);
        for (let y = 0; y < closeCap - 2; y++) {
          for (let x = 0; x < 117; x++) expect(mountain.has(close.px[y * 117 + x]), `${you} m ${theme}: strip, mountain above the cap at row ${y}`).toBe(false);
        }
      }
    }
  });

  it("the flag is always on the canvas, even low down where the cone is wider than the view", () => {
    for (const you of [0, 500, 864, 1_000, 2_000]) {
      for (const width of [88, 117]) {
        const x = trailX(you, width, you);
        expect(x, `${you} m, ${width} px`).toBeGreaterThanOrEqual(1);
        expect(x + 6, `${you} m, ${width} px`).toBeLessThan(width);
        const close = drawClose({ width, height: 47, theme: "light", time: 0, altitude: you, you, driftMs: 700 });
        expect(close.px.filter((v) => v === role("marker")).length, `${you} m: the flag is drawn`).toBeGreaterThan(20);
      }
    }
  });

  it("right under the cloud cap there's mountain or cloud, never a gap of sky", () => {
    for (const you of [3_000, 8_763, 12_000]) {
      const top = worldTop(you);
      const height = Math.ceil(top / 25);
      const w = drawWorld({ width: 117, height, metresPerRow: 25, bottom: 0, top, you, theme: "light", time: 0, altitude: null, driftMs: 700, moon: null });
      const capRow = height - 1 - Math.round(mistLine(you) / 25);
      const centre = 58;
      for (let y = capRow - 4; y <= capRow + 4; y++) {
        const r = ROLES[w.px[y * 117 + centre]];
        expect(r.startsWith("sky"), `${you} m: sky at the centre just under the cap (row ${y})`).toBe(false);
      }
    }
  });

  it("the strip's moon is never on the mountain, in dark at any height", () => {
    const ground = new Set((["rock", "rock-shade", "snow", "snow-shade", "pine", "pine-dark", "valley", "valley-dark"] as const).map(role));
    for (const you of [0, 3_000, 7_113, 8_763, 12_000, 30_000]) {
      const close = drawClose({ width: 117, height: 47, theme: "dark", time: 0, altitude: you, you, driftMs: 700 });
      // Mark where the moon is, then check what the same view has under it without the moon (light mode has no moon).
      const light = drawClose({ width: 117, height: 47, theme: "light", time: 0, altitude: you, you, driftMs: 700 });
      close.px.forEach((v, i) => {
        if (v === role("moon") || v === role("moon-shade")) expect(ground.has(light.px[i]), `${you} m: moon over the mountain`).toBe(false);
      });
    }
  });

  it("on Today the slope and its cap stay still while you climb the day (shaped from the day's start)", () => {
    // Two views of the same day's shape, 80 m (two rows) apart: the same picture, shifted by exactly two rows.
    const base = (bottom: number) => drawWorldBase({ width: 117, height: 47, metresPerRow: 40, bottom, top: 12_500, you: 8_763, theme: "light", moon: null });
    const low = base(8_000);
    const high = base(8_080);
    // The view 80 m higher shows each altitude two rows lower down.
    expect(Buffer.from(high.px.slice(2 * 117, 47 * 117)).equals(Buffer.from(low.px.slice(0, 45 * 117)))).toBe(true);
  });

  it("Climb's world always reaches past the next zone (its label is always shown)", () => {
    for (let a = 0; a <= 100_000; a += 137) {
      // With room above it for its label and ruler chip.
      expect(worldTop(a)).toBeGreaterThanOrEqual(nextZone(a * 100).zone.from + 600);
    }
  });

  it("clouds drift with time (a step at a time), and stand still at time 0", () => {
    const still = world({ time: 0 });
    const later = world({ time: 50_000 });
    expect(Buffer.from(still.px).equals(Buffer.from(later.px))).toBe(false);
    expect(Buffer.from(world({ time: 0 }).px).equals(Buffer.from(still.px))).toBe(true);
  });

  it("the close-up (Today's strip) shows your marker in its middle rows", () => {
    const close = drawClose({ width: 88, height: 35, theme: "light", time: 0, altitude: 7_113, you: 7_113, driftMs: 700 });
    const rows = new Set<number>();
    close.px.forEach((v, i) => v === role("marker") && rows.add(Math.floor(i / close.width)));
    expect(Math.max(...rows)).toBeGreaterThan(15);
    expect(Math.max(...rows)).toBeLessThan(26);
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
