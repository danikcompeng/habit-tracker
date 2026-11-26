import { describe, expect, it } from "vitest";
import { SUMMIT_M, nextZone } from "../altitude";
import {
  BALLOON_MIN_X,
  YOU_FROM_TOP,
  CAP_GONE_M,
  CAP_THINS_FROM_M,
  LOOP_FROM_M,
  LOOP_M,
  MEDIUM_CLOUDS,
  ROLES,
  SKY_BANDS,
  SMALL_CLOUDS,
  apexFor,
  balloonX,
  capStrength,
  drawClose,
  drawWorld,
  drawWorldBase,
  looped,
  mistLine,
  mountainSpan,
  seeded,
  skyBand,
  worldMoon,
  worldTop,
} from "./scene";

const world = (o: Partial<Parameters<typeof drawWorld>[0]> = {}) =>
  drawWorld({ width: 88, height: 480, metresPerRow: 25, bottom: 0, top: 12_000, theme: "light", time: 0, altitude: 7_113, you: 7_113, driftMs: 700, moon: { x: 12, y: 30 }, ...o });
const role = (name: (typeof ROLES)[number]) => ROLES.indexOf(name);
const count = (px: Uint8Array, r: number) => px.reduce((n, v) => n + (v === r ? 1 : 0), 0);
const MOUNTAIN = new Set((["rock", "rock-shade", "snow", "snow-shade", "snow-gully", "pine", "pine-dark", "ridge-far", "ridge-near", "valley", "valley-dark"] as const).map(role));
const CLOUDS = new Set((["cloud", "cloud-light", "cloud-shade", "cloud-deep", "cloud-far", "cloud-far-shade"] as const).map(role));
/** Climb's whole world for you at `you`. */
const climbView = (you: number, theme: "light" | "dark" = "light", altitude: number | null = you) => {
  const top = worldTop(you);
  const height = Math.ceil(top / 25);
  return { height, w: drawWorld({ width: 117, height, metresPerRow: 25, bottom: 0, top, you, theme, time: 0, altitude, driftMs: 700, moon: null }) };
};
/** Today's strip for you at `you` (shaped from there). */
const strip = (you: number, theme: "light" | "dark" = "light", time = 0) => drawClose({ width: 117, height: 47, theme, time, altitude: you, you, driftMs: 700 });
/** The strip's far row of an altitude (you 60% of the way down, 40 m a row, whole rows). */
const stripRow = (you: number, a: number) => {
  const bottom = Math.round((you - 47 * (1 - YOU_FROM_TOP) * 40) / 40) * 40;
  return Math.round(46 - (a - bottom) / 40);
};
const rowsWith = (px: Uint8Array, width: number, roles: Set<number>) => {
  const rows = new Set<number>();
  px.forEach((v, i) => roles.has(v) && rows.add(Math.floor(i / width)));
  return rows;
};

describe("the Climb's scene", () => {
  it("is the same every time it's drawn (seeded), and every pixel is a known role", () => {
    const a = world();
    const b = world();
    expect(Buffer.from(a.px).equals(Buffer.from(b.px))).toBe(true);
    expect(Math.max(...a.px)).toBeLessThan(ROLES.length);
    expect(count(a.px, role("none"))).toBe(0);
  });

  it("draws your balloon, once, its basket where your altitude is", () => {
    const a = world();
    expect(count(a.px, role("marker"))).toBeGreaterThanOrEqual(20);
    expect(count(a.px, role("balloon-shade"))).toBeGreaterThan(5);
    const basketRow = Math.max(...rowsWith(a.px, a.width, new Set([role("basket")])));
    expect(Math.abs(basketRow - (480 - 1 - Math.round(7_113 / 25)))).toBeLessThanOrEqual(1);
    expect(count(world({ altitude: null }).px, role("marker"))).toBe(0);
  });

  it("the balloon bobs a pixel with time, and is still at time 0 (Reduce Motion)", () => {
    const rowsAt = (time: number) => rowsWith(strip(25_000, "light", time).px, 117, new Set([role("basket")]));
    const still = Math.max(...rowsAt(0));
    const bobs = [0, 2_100, 4_200, 6_300].map((t) => Math.max(...rowsAt(t)));
    expect(new Set(bobs).size).toBe(2);
    expect(Math.max(...bobs)).toBe(still);
    expect(Math.min(...bobs)).toBe(still - 1);
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
    expect(skyBand(13_000)).toBe(role("sky-1"));
    // Then it darkens into space in nine gentle steps, the deepest from 20,000 m.
    expect(skyBand(13_250)).toBe(role("space-9"));
    expect(skyBand(16_250)).toBe(role("space-5"));
    expect(skyBand(19_999)).toBe(role("space-2"));
    expect(skyBand(20_000)).toBe(role("space-1"));
    expect(skyBand(1_000_000)).toBe(role("space-1"));
    // The bottom 12,000 m look the same whether the world tops out at 12,000 or 20,000 m.
    const low = world({ top: 12_000, moon: null });
    const tall = drawWorld({ width: 88, height: 800, metresPerRow: 25, bottom: 0, top: 20_000, theme: "light", time: 0, altitude: 7_113, you: 7_113, driftMs: 700, moon: null });
    const lowBottom = low.px.slice((480 - 400) * 88);
    const tallBottom = tall.px.slice((800 - 400) * 88);
    expect(Buffer.from(lowBottom).equals(Buffer.from(tallBottom))).toBe(true);
  });

  it("the world's top is 12,000 m, or 1,500 m above you in 2,500 m steps", () => {
    expect(worldTop(0)).toBe(12_600);
    // Past the next zone too: at 10,000 m the next is Stratosphere (12,500 m), so 15,000 m.
    expect(worldTop(10_000)).toBe(15_600);
    expect(worldTop(36_000)).toBe(40_600);
  });

  it("the mountain is a broad cone: wide where you stand, wider below, with a small flat top at the Summit", () => {
    for (const you of [0, 3_000, 6_000, 7_113]) {
      const at = mountainSpan(you, 117, you)!;
      expect(at.right - at.left, `${you} m: about half the width where you stand`).toBeGreaterThan(117 * 0.45);
      const below = mountainSpan(you - 2_000, 117, you)!;
      expect(below.right - below.left, `${you} m: wider below`).toBeGreaterThan(at.right - at.left);
      // Just under the cloud cap it's still broad: no point.
      const top = mountainSpan(mistLine(you) - 1, 117, you)!;
      expect(top.right - top.left, `${you} m: no point under the cap`).toBeGreaterThan(117 * 0.25);
      expect(mountainSpan(mistLine(you), 117, you)).toBeNull();
    }
    // Near the Summit the cone is the real one: its top is the Summit, a small flat top, not a point.
    for (const you of [7_700, 8_200, 8_763, 9_500, 30_000]) {
      expect(apexFor(you)).toBe(SUMMIT_M);
      expect(mountainSpan(SUMMIT_M + 1, 117, you)).toBeNull();
    }
    const flat = mountainSpan(SUMMIT_M - 1, 117, 8_763)!;
    expect(flat.right - flat.left).toBeGreaterThan(117 * 0.14);
    expect(flat.right - flat.left).toBeLessThan(117 * 0.25);
    // A broad summit, not a plug: the flanks open at least a pixel a row (25 m) near the top.
    for (let a = SUMMIT_M - 400; a < SUMMIT_M - 25; a += 25) {
      const lower = mountainSpan(a, 117, 8_763)!;
      const upper = mountainSpan(a + 25, 117, 8_763)!;
      expect(lower.right - lower.left - (upper.right - upper.left), `${a} m`).toBeGreaterThanOrEqual(0);
    }
    expect(mistLine(0)).toBeGreaterThanOrEqual(2_000);
    // At Base camp, both flanks are in view below the cap.
    const low = mountainSpan(1_200, 117, 0)!;
    expect(low.left).toBeGreaterThan(0);
    expect(low.right).toBeLessThan(117);
  });

  it("the cloud cap is solid far below the Summit, thins in the last stretch, and is gone from 700 m below it", () => {
    expect(capStrength(SUMMIT_M - 3_000)).toBe(1);
    expect(capStrength(SUMMIT_M - CAP_THINS_FROM_M)).toBe(1);
    expect(capStrength(SUMMIT_M - (CAP_THINS_FROM_M + CAP_GONE_M) / 2)).toBeCloseTo(0.5);
    expect(capStrength(SUMMIT_M - CAP_GONE_M)).toBe(0);
    expect(capStrength(SUMMIT_M + 5_000)).toBe(0);
  });

  it("far below, the top is never seen: no mountain above the cloud cap, on Climb's whole canvas and the strip", () => {
    for (const you of [0, 3_000, 6_000, 7_113, 7_700]) {
      for (const theme of ["light", "dark"] as const) {
        const { height, w } = climbView(you, theme);
        const capRow = height - 1 - Math.round(mistLine(you) / 25);
        for (let y = 0; y < capRow - 2; y++) {
          for (let x = 0; x < 117; x++) expect(MOUNTAIN.has(w.px[y * 117 + x]), `${you} m ${theme}: mountain above the cap at row ${y}`).toBe(false);
        }
        const close = strip(you, theme);
        const closeCap = stripRow(you, mistLine(you));
        for (let y = 0; y < closeCap - 2; y++) {
          for (let x = 0; x < 117; x++) expect(MOUNTAIN.has(close.px[y * 117 + x]), `${you} m ${theme}: strip, mountain above the cap at row ${y}`).toBe(false);
        }
      }
    }
  });

  it("close to the Summit the peak is in view; nothing is ever above it", () => {
    for (const you of [SUMMIT_M - CAP_GONE_M, 8_500, 8_763]) {
      // The peak's top rows hold snow at the centre, on the strip (the demo's view).
      const close = strip(you);
      const peakRow = stripRow(you, SUMMIT_M - 60);
      const centre = [...close.px.slice(peakRow * 117 + 50, peakRow * 117 + 67)].map((v) => ROLES[v]);
      expect(centre.some((r) => r.startsWith("snow")), `${you} m: the peak on the strip (${centre.join(" ")})`).toBe(true);
    }
    for (const you of [8_000, 8_763, 9_500, 12_000, 30_000]) {
      const { height, w } = climbView(you);
      const summitRow = height - 1 - Math.round(SUMMIT_M / 25);
      for (let y = 0; y < summitRow - 1; y++) {
        for (let x = 0; x < 117; x++) expect(MOUNTAIN.has(w.px[y * 117 + x]), `${you} m: mountain above the Summit at row ${y}`).toBe(false);
      }
      const close = strip(you);
      for (let y = 0; y < Math.min(47, stripRow(you, SUMMIT_M) - 1); y++) {
        for (let x = 0; x < 117; x++) expect(MOUNTAIN.has(close.px[y * 117 + x]), `${you} m: strip, mountain above the Summit at row ${y}`).toBe(false);
      }
    }
  });

  it("the balloon is always on the canvas, clear of the zone labels, at every height", () => {
    for (const you of [0, 500, 864, 1_000, 2_000, 3_000, 8_700, 8_763, 9_500, 15_000, 40_000, 100_000]) {
      for (const width of [88, 117]) {
        const x = balloonX(you, width, you);
        expect(x, `${you} m, ${width} px`).toBeGreaterThanOrEqual(Math.round(width * BALLOON_MIN_X));
        expect(x + 4, `${you} m, ${width} px`).toBeLessThanOrEqual(width);
        if (you <= SUMMIT_M) expect(x + 4, `${you} m, ${width} px: beside the slope`).toBeLessThan(width / 2 + 1);
        const close = drawClose({ width, height: 47, theme: "light", time: 0, altitude: you, you, driftMs: 700 });
        expect(count(close.px, role("marker")), `${you} m: the balloon is drawn on the strip`).toBeGreaterThanOrEqual(20);
        // And on Climb's whole world, its basket on your row (or resting on the grass at 0 m).
        const top = worldTop(you);
        const height = Math.ceil(top / 25);
        const w = drawWorld({ width, height, metresPerRow: 25, bottom: 0, top, you, theme: "dark", time: 0, altitude: you, driftMs: 700, moon: null });
        expect(count(w.px, role("marker")), `${you} m: the balloon is drawn on Climb`).toBeGreaterThanOrEqual(20);
        const basket = Math.max(...rowsWith(w.px, width, new Set([role("basket")])));
        expect(Math.abs(basket - Math.min(height - 3, height - 1 - Math.round(you / 25))), `${you} m: the basket's row`).toBeLessThanOrEqual(1);
      }
    }
    // Kept right of chips the page measured.
    expect(balloonX(0, 117, 0, 70)).toBe(70);
  });

  it("the balloon moves smoothly up the mountain and past the peak: never a jump sideways", () => {
    for (let a = 0; a < 12_000; a += 10) {
      expect(Math.abs(balloonX(a + 10, 117, a + 10) - balloonX(a, 117, a)), `${a} m`).toBeLessThanOrEqual(1);
    }
    // On Today (shaped from the day's start) through the demo's crossing, a metre at a time.
    for (let a = 8_763; a < 8_873; a++) expect(Math.abs(balloonX(a + 1, 117, 8_763) - balloonX(a, 117, 8_763)), `${a} m`).toBeLessThanOrEqual(1);
    // Past the top it drifts over the crater.
    expect(balloonX(9_200, 117, 9_200)).toBe(Math.round(117 / 2));
  });

  it("the cap thins without a jump: a metre's climb changes only a little of the picture", () => {
    for (const you of [7_747, 7_900, 8_100]) {
      const a = drawWorldBase({ width: 117, height: 200, metresPerRow: 25, bottom: you - 1_000, top: you + 4_000, you, theme: "light", moon: null });
      const b = drawWorldBase({ width: 117, height: 200, metresPerRow: 25, bottom: you - 1_000, top: you + 4_000, you: you + 2, theme: "light", moon: null });
      let changed = 0;
      for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) changed++;
      expect(changed / a.px.length, `${you} m`).toBeLessThan(0.12);
    }
  });

  it("nothing in space sits behind the balloon's column (its ring stays clear of planets)", () => {
    const planets = new Set((["planet", "planet-shade", "satellite"] as const).map(role));
    for (const you of [22_500, 27_500, 35_000, 37_500, 50_000]) {
      const base = drawWorldBase({ width: 117, height: 400, metresPerRow: 25, bottom: you - 5_000, top: you + 5_000, you, theme: "light", moon: null });
      const x = balloonX(you, 117, you);
      for (let y = 0; y < 400; y++) {
        for (let dx = -5; dx <= 5; dx++) {
          // Asteroids are specks (1–2 px), which the ring ignores; whole planets and satellites keep out.
          if (Math.floor((you - 5_000 + (399 - y) * 25) / 2_500) * 2_500 === 32_500) continue;
          expect(planets.has(base.px[y * 117 + x + dx]), `${you} m: something behind the balloon at row ${y}`).toBe(false);
        }
      }
    }
  });

  it("right under a solid cloud cap there's mountain or cloud, never a gap of sky", () => {
    for (const you of [3_000, 6_000]) {
      const { height, w } = climbView(you, "light", null);
      const capRow = height - 1 - Math.round(mistLine(you) / 25);
      for (let y = capRow - 4; y <= capRow + 4; y++) {
        const r = ROLES[w.px[y * 117 + 58]];
        expect(r.startsWith("sky"), `${you} m: sky at the centre just under the cap (row ${y})`).toBe(false);
      }
    }
  });

  it("space repeats seamlessly: 50 km looks exactly like 60 km, on the strip (with its near layer) and on Climb", () => {
    expect(looped(LOOP_FROM_M - 1)).toBe(LOOP_FROM_M - 1);
    expect(looped(LOOP_FROM_M + LOOP_M + 123)).toBe(LOOP_FROM_M + 123);
    for (const theme of ["light", "dark"] as const) {
      for (const time of [0, 9_000]) {
        const a = strip(50_000, theme, time);
        const b = strip(60_000, theme, time);
        expect(Buffer.from(a.px).equals(Buffer.from(b.px)), `${theme}, time ${time}`).toBe(true);
      }
      const window = (bottom: number) => drawWorld({ width: 117, height: 300, metresPerRow: 25, bottom, top: bottom + 7_500, you: bottom + 3_000, theme, time: 0, altitude: bottom + 3_000, driftMs: 700, moon: null });
      expect(Buffer.from(window(47_000).px).equals(Buffer.from(window(57_000).px))).toBe(true);
    }
  });

  it("space repeats in Climb's real view too (from the valley, the real top, the moon): the rows around you match", () => {
    const view = (you: number) => {
      const top = worldTop(you);
      const height = Math.ceil(top / 25);
      const w = drawWorld({ width: 117, height, metresPerRow: 25, bottom: 0, top, you, theme: "dark", time: 0, altitude: you, driftMs: 700, moon: worldMoon(117, height, 25, you, top) });
      const youRow = height - 1 - Math.round(you / 25);
      return w.px.slice((youRow - 60) * 117, (youRow + 60) * 117);
    };
    expect(Buffer.from(view(50_000)).equals(Buffer.from(view(60_000)))).toBe(true);
  });

  it("space is the same wherever the view starts: no sprite pops in at a view's edge", () => {
    const base = (bottom: number, height: number) => drawWorldBase({ width: 117, height, metresPerRow: 25, bottom, top: 70_000, you: 50_000, theme: "light", moon: null });
    const short = base(50_000, 100);
    const tall = base(49_000, 140);
    // The tall view's top 100 rows are the short view (50,000 m up).
    expect(Buffer.from(tall.px.slice(0, 100 * 117)).equals(Buffer.from(short.px))).toBe(true);
  });

  it("above the clouds there are no clouds; in space light mode has stars too", () => {
    for (const you of [15_000, 25_000, 50_000]) {
      for (const theme of ["light", "dark"] as const) {
        const close = strip(you, theme, 5_000);
        expect([...close.px].filter((v) => CLOUDS.has(v)).length, `${you} m ${theme}: clouds`).toBe(0);
      }
    }
    expect(count(strip(25_000).px, role("star")) + count(strip(25_000).px, role("star-dim"))).toBeGreaterThan(10);
  });

  it("a lift in space still shows things passing you (the strip's near layer)", () => {
    const before = strip(25_000);
    const after = drawClose({ width: 117, height: 47, theme: "light", time: 0, altitude: 25_020, you: 25_000, driftMs: 700 });
    const notBalloon = (v: number) => !["marker", "balloon-shade", "basket", "marker-ring", "marker-edge"].includes(ROLES[v]);
    let changed = 0;
    for (let i = 0; i < before.px.length; i++) if (notBalloon(before.px[i]) && notBalloon(after.px[i]) && before.px[i] !== after.px[i]) changed++;
    expect(changed).toBeGreaterThan(5);
  });

  it("the strip's moon is never on the mountain, in dark at any height", () => {
    const ground = new Set((["rock", "rock-shade", "snow", "snow-shade", "snow-gully", "pine", "pine-dark", "valley", "valley-dark"] as const).map(role));
    for (const you of [0, 3_000, 7_113, 8_200, 8_763, 9_500, 12_000, 30_000]) {
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
    for (const you of [5_000, 7_900, 8_763]) {
      const base = (bottom: number) => drawWorldBase({ width: 117, height: 47, metresPerRow: 40, bottom, top: 12_500, you, theme: "light", moon: null });
      const low = base(you - 760);
      const high = base(you - 680);
      // The view 80 m higher shows each altitude two rows lower down.
      expect(Buffer.from(high.px.slice(2 * 117, 47 * 117)).equals(Buffer.from(low.px.slice(0, 45 * 117))), `${you} m`).toBe(true);
    }
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

  it("the close-up (Today's strip) shows your balloon's basket two thirds of the way down", () => {
    const close = drawClose({ width: 88, height: 35, theme: "light", time: 0, altitude: 7_113, you: 7_113, driftMs: 700 });
    const basket = Math.max(...rowsWith(close.px, close.width, new Set([role("basket")])));
    expect(Math.abs(basket - Math.round(35 * YOU_FROM_TOP))).toBeLessThanOrEqual(1);
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
