import { describe, expect, it } from "vitest";
import { SUMMIT_M, nextZone } from "../altitude";
import { SCENE_BACKDROPS, SCENE_PALETTE, contrast } from "../palette";
import {
  BALLOON_MIN_X,
  CONE_REAL_FROM_M,
  FRAME_BELOW_M,
  YOU_FROM_TOP,
  LOOP_FROM_M,
  LOOP_M,
  MEDIUM_CLOUDS,
  ROLES,
  SKY_BANDS,
  SMALL_CLOUDS,
  birdFor,
  climbWindowTop,
  closeBalloonAt,
  closeFarOptions,
  drawWorldMoving,
  balloonX,
  coneDepth,
  coneHalfWidth,
  drawClose,
  drawWorld,
  drawWorldBase,
  looped,
  moonShows,
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
/** The cone itself (not the far ridges or the valley floor). */
const CONE = new Set((["rock", "rock-shade", "snow", "snow-shade", "snow-gully", "pine", "pine-dark", "pine-shade"] as const).map(role));
/** The ground: the cone, the valley, the lake. */
const GROUND = new Set([...CONE, ...(["valley", "valley-dark", "lake", "lake-light"] as const).map(role)]);
/** The strip's far frame for you at `you` (47 rows, as drawn): its bottom and top altitudes. */
const stripFrame = (you: number) => {
  const o = closeFarOptions({ width: 117, height: 47, theme: "light", altitude: you, you });
  return { bottom: o.bottom, top: o.bottom + 47 * 40 };
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

  it("one mountain: its top is always the Summit (a small flat top and crater), with nothing above it, at every height", () => {
    for (const you of [0, 1_500, 3_000, 5_000, 7_000, 7_848, 8_763, 9_500, 30_000]) {
      expect(mountainSpan(SUMMIT_M, 117, you), `${you} m`).toBeNull();
      const flat = mountainSpan(SUMMIT_M - 1, 117, you)!;
      expect(flat.right - flat.left, `${you} m: a small flat top`).toBeGreaterThan(117 * 0.14);
      expect(flat.right - flat.left, `${you} m`).toBeLessThan(117 * 0.25);
    }
    // At the demo's height it's the real cone: a broad summit, not a plug (the flanks never close up going down).
    for (let a = SUMMIT_M - 400; a < SUMMIT_M - 25; a += 25) {
      const lower = mountainSpan(a, 117, 8_763)!;
      const upper = mountainSpan(a + 25, 117, 8_763)!;
      expect(lower.right - lower.left - (upper.right - upper.left), `${a} m`).toBeGreaterThanOrEqual(0);
    }
    // Nothing of the mountain above the Summit, on Climb's whole canvas and the strip, from Base camp up.
    for (const you of [0, 3_000, 7_000, 8_000, 8_763, 9_500, 12_000, 30_000]) {
      const { height, w } = climbView(you);
      const summitRow = height - 1 - Math.round(SUMMIT_M / 25);
      for (let y = 0; y < summitRow - 1; y++) {
        for (let x = 0; x < 117; x++) expect(CONE.has(w.px[y * 117 + x]), `${you} m: mountain above the Summit at row ${y}`).toBe(false);
      }
    }
  });

  it("the profile: the real cone from 7,848 m (and past the Summit, out to 100 km); far below, stretched, never deeper than the real one; no jump", () => {
    expect(FRAME_BELOW_M).toBe(Math.round(47 * (1 - YOU_FROM_TOP)) * 40);
    for (const you of [CONE_REAL_FROM_M, 8_763, 9_488, 9_500, 20_000, 39_000, 100_000]) {
      for (const a of [0, 4_000, 8_000, SUMMIT_M]) expect(coneDepth(a, you), `${you} m, at ${a} m`).toBe(SUMMIT_M - a);
    }
    for (let you = 0; you < 100_000; you += 97) {
      for (const a of [0, 2_000, 6_000, 8_800]) {
        const d = coneDepth(a, you);
        expect(Number.isFinite(d) && d >= 0, `${you} m, at ${a} m`).toBe(true);
        if (a >= you - FRAME_BELOW_M) expect(d, `${you} m, at ${a} m: never deeper than real`).toBeLessThanOrEqual(SUMMIT_M - a + 1e-9);
      }
      expect(coneDepth(SUMMIT_M, you)).toBe(0);
    }
    // Smooth as you climb (no jump): a metre never changes a half-width by more than a fifth of a pixel.
    for (let you = 0; you < 9_000; you += 1) {
      for (const a of [you, you + 1_000]) {
        for (const view of ["world", "close"] as const) expect(Math.abs(coneHalfWidth(a, 117, you + 1, view) - coneHalfWidth(a, 117, you, view)), `${you} m, ${view}`).toBeLessThan(0.2);
      }
    }
  });

  it("at Base camp the mountain's base fills the whole width of the strip and of Climb's window, its top off the frame", () => {
    const at = mountainSpan(0, 117, 0)!;
    expect(at.left, "past the left edge where you are").toBeLessThan(0);
    expect(at.right, "past the right edge").toBeGreaterThan(116);
    // Up to Forest the strip's bottom edge is still past both edges.
    for (const you of [0, 500, 1_000]) {
      const bottom = mountainSpan(stripFrame(you).bottom + 20, 117, you)!;
      expect(bottom.left < 0 && bottom.right > 116, `${you} m: the strip's bottom edge`).toBe(true);
    }
    // The strip's bottom rows (the valley floor and the forest above it) are ground edge to edge.
    const close = strip(0);
    for (let y = 40; y < 47; y++) {
      for (let x = 0; x < 117; x++) expect(GROUND.has(close.px[y * 117 + x]) || ["marker", "balloon-light", "balloon-shade", "basket", "marker-ring", "marker-edge"].includes(ROLES[close.px[y * 117 + x]]), `strip row ${y}, x ${x}: ${ROLES[close.px[y * 117 + x]]}`).toBe(true);
    }
    // Climb's window as it opens at 0 m (5,000 m tall): the mountain past both edges in its bottom 300 m…
    for (let a = 0; a <= 300; a += 25) {
      const span = mountainSpan(a, 117, 0)!;
      expect(span.left < 0 && span.right > 116, `${a} m`).toBe(true);
    }
    // …and still there at its top, sky beside it: the top is off the frame.
    const top = mountainSpan(climbWindowTop(0, 5_000, 12_600) - 25, 117, 0)!;
    expect(top.left).toBeGreaterThan(0);
    expect(top.right - top.left).toBeGreaterThan(117 * 0.25);
  });

  it("climbing, the slopes narrow: the mountain at the strip's top edge never widens, and sky comes in on both sides", () => {
    let last = Infinity;
    for (let you = 0; you <= 7_600; you += 50) {
      const { top } = stripFrame(you);
      const w = 2 * coneHalfWidth(top, 117, you, "close");
      expect(w, `${you} m`).toBeLessThanOrEqual(last + 1e-9);
      last = w;
    }
    // Its bottom edge never widens either (0–7,800 m).
    last = Infinity;
    for (let you = 0; you <= 7_800; you += 50) {
      const w = 2 * coneHalfWidth(stripFrame(you).bottom, 117, you, "close");
      // (Within a pixel: the strip's frame moves in whole 40 m rows.)
      expect(w, `${you} m: the bottom edge`).toBeLessThanOrEqual(last + 1);
      last = w;
    }
    // On Climb, the mountain where its window opens at the top never widens as you climb (it stands still while the window's held).
    last = Infinity;
    for (let you = 0; you <= 6_900; you += 50) {
      const w = 2 * coneHalfWidth(climbWindowTop(you, 5_000, Infinity) - 25, 117, you);
      expect(w, `${you} m: Climb's window top`).toBeLessThanOrEqual(last + 1e-9);
      last = w;
    }
    // Sky (or far ridges and clouds: not the cone) on both sides at the strip's top from 1,500 m, beside you from 5,000 m.
    for (const you of [1_500, 3_000, 5_000, 7_000]) {
      const close = strip(you);
      expect(CONE.has(close.px[2 * 117 + 1]) || CONE.has(close.px[2 * 117 + 115]), `${you} m: the top corners`).toBe(false);
    }
    for (const you of [5_000, 7_000]) {
      const span = mountainSpan(you, 117, you, "close")!;
      expect(span.left > 0 && span.right < 116, `${you} m: beside you`).toBe(true);
    }
    // On Climb the window's top shows the flanks leaning in, sky beside them, from Base camp: about 1 px a side every 3 rows over its top 30 rows.
    for (const you of [0, 1_500, 3_000, 5_000]) {
      const top = climbWindowTop(you, 5_000, Infinity) - 25;
      const upper = mountainSpan(top, 117, you)!;
      const lower = mountainSpan(top - 30 * 25, 117, you)!;
      expect(upper.left, `${you} m: sky beside the window's top`).toBeGreaterThan(0);
      expect(upper.left - lower.left, `${you} m: the flank leans in`).toBeGreaterThanOrEqual(9);
    }
  });

  it("the peak isn't in the frame below about 7,000 m: on Today's strip, and in Climb's window as it opens", () => {
    for (let you = 0; you <= 7_000; you += 25) {
      // The strip's frame (and a day's lift on top) stays more than 300 m under the Summit.
      expect(stripFrame(you + 150).top, `${you} m`).toBeLessThan(SUMMIT_M - 300);
    }
    for (const windowMetres of [3_200, 5_000, 7_500]) {
      for (let you = 0; you <= 6_900; you += 25) {
        const top = climbWindowTop(you, windowMetres, 12_600);
        expect(top, `${you} m, a ${windowMetres} m window`).toBeLessThan(8_600);
        // You're in it, at least a fifth of the way down.
        expect(top - you, `${you} m, a ${windowMetres} m window`).toBeGreaterThanOrEqual(0.2 * windowMetres);
        expect(top - you, `${you} m, a ${windowMetres} m window`).toBeLessThanOrEqual(windowMetres);
      }
      // The peak in view at the demo's height, and the window's top never comes down as you climb past it.
      expect(climbWindowTop(8_763, windowMetres, 12_600), `${windowMetres} m window`).toBeGreaterThan(SUMMIT_M + 100);
      let last = 0;
      for (let you = 6_800; you <= 7_600; you += 10) {
        const top = climbWindowTop(you, windowMetres, 12_600);
        expect(top, `${you} m, a ${windowMetres} m window`).toBeGreaterThanOrEqual(last);
        last = top;
      }
    }
    // Then it comes into view: in Climb's window from about 7,000 m, on the strip from about 7,600 m.
    expect(climbWindowTop(7_000, 5_000, 12_600)).toBeGreaterThan(SUMMIT_M);
    expect(climbWindowTop(7_500, 5_000, 12_600)).toBeGreaterThan(SUMMIT_M + 300);
    for (const you of [7_750, 8_500, 8_763]) {
      const close = strip(you);
      const peakRow = stripRow(you, SUMMIT_M - 60);
      const centre = [...close.px.slice(peakRow * 117 + 50, peakRow * 117 + 67)].map((v) => ROLES[v]);
      expect(centre.some((r) => r.startsWith("snow")), `${you} m: the peak on the strip (${centre.join(" ")})`).toBe(true);
    }
    // Clamped to the world: never above its top, never below its floor.
    expect(climbWindowTop(0, 5_000, 12_600)).toBe(5_000);
    expect(climbWindowTop(12_000, 5_000, 12_600)).toBe(12_600);
    expect(climbWindowTop(100, 20_000, 12_600)).toBe(12_600);
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

  it("the mountain changes only a little from one day to the next (a day's 150 m at most)", () => {
    for (const you of [0, 3_000, 6_000, 7_700, 7_848, 8_600]) {
      const a = drawWorldBase({ width: 117, height: 200, metresPerRow: 25, bottom: Math.max(0, you - 1_000), top: you + 4_000, you, theme: "light", moon: null });
      const b = drawWorldBase({ width: 117, height: 200, metresPerRow: 25, bottom: Math.max(0, you - 1_000), top: you + 4_000, you: you + 150, theme: "light", moon: null });
      let changed = 0;
      for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) changed++;
      expect(changed / a.px.length, `${you} m`).toBeLessThan(0.06);
    }
  });

  it("drifting clouds pass behind the mountain: never over the slope, the forest, the valley or the lake below the Summit", () => {
    const clouds = new Set([...CLOUDS, role("rim")]);
    for (const you of [0, 1_500, 5_000, 8_763]) {
      for (const theme of ["light", "dark"] as const) {
        for (let time = 0; time < 60_000; time += 6_100) {
          // Climb's window around you.
          const o = { width: 117, height: 200, metresPerRow: 25, bottom: Math.max(0, you - 1_800), top: you + 3_200, you, theme, moon: null };
          const base = drawWorldBase(o);
          const w = drawWorld({ ...o, time, altitude: you, driftMs: 700 });
          base.px.forEach((v, i) => GROUND.has(v) && expect(clouds.has(w.px[i]), `Climb, ${you} m ${theme} t${time}: cloud over ${ROLES[v]}`).toBe(false));
          // Today's strip (both layers).
          const far = closeFarOptions({ width: 117, height: 47, theme, altitude: you, you });
          const stripBase = drawWorldBase(far);
          const close = strip(you, theme, time);
          stripBase.px.forEach((v, i) => GROUND.has(v) && expect(clouds.has(close.px[i]), `strip, ${you} m ${theme} t${time}: cloud over ${ROLES[v]}`).toBe(false));
        }
      }
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

  it("the stratosphere has thin high clouds (to 16,500 m); none in space; in space light mode has stars too", () => {
    const high = drawWorld({ width: 117, height: 200, metresPerRow: 25, bottom: 12_000, top: 17_000, you: 14_000, theme: "light", time: 0, altitude: null, driftMs: 700, moon: null });
    expect(count(high.px, role("cloud-high")), "thin high clouds between 12,000 and 17,000 m").toBeGreaterThan(10);
    for (const you of [18_000, 25_000, 50_000]) {
      for (const theme of ["light", "dark"] as const) {
        const close = strip(you, theme, 5_000);
        expect([...close.px].filter((v) => CLOUDS.has(v)).length, `${you} m ${theme}: clouds`).toBe(0);
      }
    }
    expect(count(strip(25_000).px, role("star")) + count(strip(25_000).px, role("star-dim"))).toBeGreaterThan(10);
  });

  it("dark: the strip has its moon from about 2,700 m up (beside the cone, or above it; behind a cloud now and then); none low down, where the slope fills the strip's top", () => {
    // Away from the cloud layers, on phones 105–130 logical px wide.
    for (const width of [105, 117, 130]) {
      for (const you of [4_500, 7_000, 8_763, 11_000, 15_000, ...(width >= 117 ? [3_000] : [])]) {
        expect(count(drawClose({ width, height: 47, theme: "dark", time: 0, altitude: you, you, driftMs: 700 }).px, role("moon")), `${you} m, ${width} px`).toBeGreaterThan(10);
      }
    }
    for (const you of [0, 1_000]) expect(count(strip(you, "dark").px, role("moon")), `${you} m: no room (accepted)`).toBe(0);
  });

  it("the strip's moon is never on the mountain, swept 0–9,500 m, and in the middle of a day (shaped from its start)", () => {
    const ground = new Set((["rock", "rock-shade", "snow", "snow-shade", "snow-gully", "pine", "pine-dark"] as const).map(role));
    for (let you = 0; you <= 9_500; you += 37) {
      for (const altitude of [you, you + 150]) {
        const dark = drawClose({ width: 117, height: 47, theme: "dark", time: 0, altitude, you, driftMs: 700 });
        const light = drawClose({ width: 117, height: 47, theme: "light", time: 0, altitude, you, driftMs: 700 });
        dark.px.forEach((v, i) => {
          if (v === role("moon") || v === role("moon-shade")) expect(ground.has(light.px[i]), `${you} m (+${altitude - you}): moon over the mountain`).toBe(false);
        });
      }
    }
  });

  it("on the strip, near and far clouds never cover the moon (the same disc, glow and all, through a minute of drift)", () => {
    for (const you of [1_500, 3_000, 6_000, 9_500]) {
      const at = (time: number) => strip(you, "dark", time).px.map((v) => (["moon", "moon-shade", "moon-glow", "moon-glow-2"].includes(ROLES[v]) ? v : 0));
      const still = at(0);
      for (let time = 0; time < 60_000; time += 2_300) expect(Buffer.from(at(time)).equals(Buffer.from(still)), `${you} m, time ${time}`).toBe(true);
    }
  });

  it("drifting clouds never cover the moon (its disc always shows whole)", () => {
    for (const you of [3_000, 8_700, 15_000]) {
      for (let time = 0; time < 120_000; time += 4_100) {
        const top = worldTop(you);
        const height = Math.ceil(top / 25);
        const w = drawWorld({ width: 117, height, metresPerRow: 25, bottom: 0, top, you, theme: "dark", time, altitude: you, driftMs: 700, moon: worldMoon(117, height, 25, you, top) });
        expect(count(w.px, role("moon")) + count(w.px, role("moon-shade")), `${you} m, time ${time}: the whole disc (37 px)`).toBe(37);
      }
    }
  });

  it("the light moon on the strip is decided by the day's start: none below about 13,750 m, then there all day", () => {
    expect(count(strip(13_600).px, role("moon"))).toBe(0);
    expect(count(strip(13_900).px, role("moon"))).toBeGreaterThan(10);
    // A lift during the day doesn't make it appear.
    const lifted = drawClose({ width: 117, height: 47, theme: "light", time: 0, altitude: 13_740, you: 13_600, driftMs: 700 });
    expect(count(lifted.px, role("moon"))).toBe(0);
  });

  it("high clouds end at 16,500 m (none above, on Climb's view) and are the same whichever row the view starts on", () => {
    const highRoles = new Set((["cloud-high", "cloud-high-shade"] as const).map(role));
    const w = drawWorld({ width: 117, height: 200, metresPerRow: 25, bottom: 15_000, top: 20_000, you: 15_000, theme: "light", time: 0, altitude: null, driftMs: 700, moon: null });
    const row16700 = 199 - Math.round((16_700 - 15_000) / 25);
    for (let y = 0; y < row16700; y++) for (let x = 0; x < 117; x++) expect(highRoles.has(w.px[y * 117 + x]), `row ${y}`).toBe(false);
    const view = (bottom: number, height: number) => drawWorld({ width: 117, height, metresPerRow: 25, bottom, top: 20_000, you: 14_000, theme: "light", time: 3_000, altitude: null, driftMs: 700, moon: null });
    const a = view(13_000, 100);
    const b = view(12_000, 140);
    expect(Buffer.from(b.px.slice(0, 100 * 117)).equals(Buffer.from(a.px))).toBe(true);
  });

  it("on the strip the high clouds never drift behind the balloon (and would, without its clear box)", () => {
    const highRoles = new Set((["cloud-high", "cloud-high-shade"] as const).map(role));
    let without = 0;
    for (const you of [12_600, 13_400, 14_200, 15_000, 15_800]) {
      const o = { width: 117, height: 47, theme: "light" as const, altitude: you, you };
      const at = closeBalloonAt(o);
      const inBox = (i: number) => {
        const x = i % 117;
        const y = Math.floor(i / 117);
        return Math.abs(x - at.x) <= 6 && y >= at.y - 15 && y <= at.y + 2;
      };
      for (let time = 0; time < 240_000; time += 2_100) {
        const base = drawWorldBase(closeFarOptions(o));
        drawWorldMoving(base, { ...closeFarOptions(o), time, altitude: null, driftMs: 1_400, clearOf: at });
        base.px.forEach((v, i) => inBox(i) && expect(highRoles.has(v), `${you} m, time ${time}`).toBe(false));
        const bare = drawWorldBase(closeFarOptions(o));
        drawWorldMoving(bare, { ...closeFarOptions(o), time, altitude: null, driftMs: 1_400, clearOf: null });
        bare.px.forEach((v, i) => inBox(i) && highRoles.has(v) && without++);
      }
    }
    expect(without, "without the box, some frame has a high cloud there (so the test can fail)").toBeGreaterThan(0);
  });

  it("the moon: always in dark; in light once the sky is deep (the stratosphere and space), never lower", () => {
    expect(moonShows("dark", 3_000)).toBe(true);
    expect(moonShows("light", 12_000)).toBe(false);
    expect(moonShows("light", 15_000)).toBe(true);
    const moon = (you: number) => count(strip(you).px, role("moon"));
    expect(moon(9_000), "light, 9,000 m").toBe(0);
    expect(moon(15_000), "light, 15,000 m").toBeGreaterThan(10);
  });

  it("a 20 m lift still shows things passing you (the strip's near layer): birds low down, specks in space", () => {
    for (const you of [0, 1_500, 3_000, 25_000]) {
      const before = strip(you);
      const after = drawClose({ width: 117, height: 47, theme: "light", time: 0, altitude: you + 20, you, driftMs: 700 });
      const notBalloon = (v: number) => !["marker", "balloon-light", "balloon-shade", "basket", "marker-ring", "marker-edge"].includes(ROLES[v]);
      let changed = 0;
      for (let i = 0; i < before.px.length; i++) if (notBalloon(before.px[i]) && notBalloon(after.px[i]) && before.px[i] !== after.px[i]) changed++;
      expect(changed, `${you} m`).toBeGreaterThan(5);
    }
    // The birds: low down only.
    for (const you of [9_000, 20_000]) expect(count(strip(you).px, role("bird")) + count(strip(you).px, role("bird-light")), `${you} m`).toBe(0);
    let birds = 0;
    for (let you = 0; you < 6_000; you += 200) birds += count(strip(you).px, role("bird")) + count(strip(you).px, role("bird-light"));
    expect(birds, "birds somewhere below 6,000 m").toBeGreaterThan(20);
  });

  it("the strip's moon is never on the mountain, in dark at any height", () => {
    const ground = new Set((["rock", "rock-shade", "snow", "snow-shade", "snow-gully", "pine", "pine-dark", "valley", "valley-dark"] as const).map(role));
    for (const you of [0, 3_000, 7_113, 8_200, 8_763, 9_500, 12_000, 30_000]) {
      const close = drawClose({ width: 117, height: 47, theme: "dark", time: 0, altitude: you, you, driftMs: 700 });
      // Mark where the moon is, then check what the same view has under it in light (no moon below the stratosphere).
      const light = drawClose({ width: 117, height: 47, theme: "light", time: 0, altitude: you, you, driftMs: 700 });
      close.px.forEach((v, i) => {
        if (v === role("moon") || v === role("moon-shade")) expect(ground.has(light.px[i]), `${you} m: moon over the mountain`).toBe(false);
      });
    }
  });

  it("birds take the shade that stands out (3:1) from anything they fly in front of, stay off the valley floor, and are still at time 0", () => {
    for (const theme of ["light", "dark"] as const) {
      const palette = SCENE_PALETTE[theme];
      for (const r of [...SCENE_BACKDROPS, "pine-shade"] as const) {
        const shade = birdFor(palette, r);
        expect(contrast(palette[shade], palette[r]), `${theme}: a bird on ${r}`).toBeGreaterThanOrEqual(3);
      }
    }
    const birds = new Set([role("bird"), role("bird-light")]);
    for (const you of [0, 300, 500]) {
      for (let time = 0; time < 60_000; time += 3_100) {
        const close = strip(you, "light", time);
        const base = drawWorldBase(closeFarOptions({ width: 117, height: 47, theme: "light", altitude: you, you }));
        close.px.forEach((v, i) => birds.has(v) && expect(ROLES[base.px[i]].startsWith("valley") || ROLES[base.px[i]].startsWith("lake"), `${you} m, time ${time}: a bird on the valley floor`).toBe(false));
      }
    }
    const still = (driftMs: number) => drawClose({ width: 117, height: 47, theme: "light", time: 0, altitude: 1_500, you: 1_500, driftMs });
    expect(Buffer.from(still(700).px).equals(Buffer.from(still(1_400).px))).toBe(true);
  });

  it("on Today the slope stays still while you climb the day (shaped from the day's start)", () => {
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
