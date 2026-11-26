import { describe, expect, it } from "vitest";
import { SUMMIT_M, nextZone, zonesBelow } from "../altitude";
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

  it("one mountain: its top is always the Summit (a flat top and crater), with nothing above it, at every height", () => {
    for (const you of [0, 1_500, 3_000, 5_000, 7_000, 7_848, 8_763, 9_500, 30_000]) {
      for (const view of ["world", "close"] as const) expect(mountainSpan(SUMMIT_M, 117, you, view), `${you} m, ${view}`).toBeNull();
      // On the strip (a far view) a small flat top; on Climb a broad one, about a third of the window.
      const flat = mountainSpan(SUMMIT_M - 1, 117, you, "close")!;
      expect(flat.right - flat.left, `${you} m: the strip's small flat top`).toBeGreaterThan(117 * 0.14);
      expect(flat.right - flat.left, `${you} m`).toBeLessThan(117 * 0.25);
      const broad = mountainSpan(SUMMIT_M - 1, 117, you)!;
      expect(broad.right - broad.left, `${you} m: Climb's flat top`).toBeGreaterThan(117 * 0.28);
      expect(broad.right - broad.left, `${you} m`).toBeLessThan(117 * 0.4);
    }
    // At the demo's height it's the real cone: a broad summit, not a plug (the flanks never close up going down).
    for (let a = SUMMIT_M - 400; a < SUMMIT_M - 25; a += 25) {
      for (const view of ["world", "close"] as const) {
        const lower = mountainSpan(a, 117, 8_763, view)!;
        const upper = mountainSpan(a + 25, 117, 8_763, view)!;
        expect(lower.right - lower.left - (upper.right - upper.left), `${a} m, ${view}`).toBeGreaterThanOrEqual(0);
      }
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

  it("the strip's profile: the real cone from 7,848 m (and past the Summit, out to 100 km); far below, stretched, never deeper than the real one; no jump", () => {
    expect(FRAME_BELOW_M).toBe(Math.round(47 * (1 - YOU_FROM_TOP)) * 40);
    for (const you of [CONE_REAL_FROM_M, 8_763, 9_488, 9_500, 20_000, 39_000, 100_000]) {
      for (const a of [0, 4_000, 8_000, SUMMIT_M]) expect(coneDepth(a, you, "close"), `${you} m, at ${a} m`).toBe(SUMMIT_M - a);
    }
    for (let you = 0; you < 100_000; you += 97) {
      for (const a of [0, 2_000, 6_000, 8_800]) {
        const d = coneDepth(a, you, "close");
        expect(Number.isFinite(d) && d >= 0, `${you} m, at ${a} m`).toBe(true);
        if (a >= you - FRAME_BELOW_M) expect(d, `${you} m, at ${a} m: never deeper than real`).toBeLessThanOrEqual(SUMMIT_M - a + 1e-9);
      }
      expect(coneDepth(SUMMIT_M, you, "close")).toBe(0);
    }
    // Smooth as you climb (no jump): a metre never changes a half-width by more than a fifth of a pixel.
    for (let you = 0; you < 9_000; you += 1) {
      for (const a of [you, you + 1_000]) {
        // (The strip's: Climb's mountain doesn't depend on you at all, tested below.)
        expect(Math.abs(coneHalfWidth(a, 117, you + 1, "close") - coneHalfWidth(a, 117, you, "close")), `${you} m`).toBeLessThan(0.2);
      }
    }
  });

  it("at Base camp the mountain's base fills the whole width of the strip and of Climb's window, its top off the frame", () => {
    const at = mountainSpan(0, 117, 0)!;
    expect(at.left, "past the left edge where you are").toBeLessThan(0);
    expect(at.right, "past the right edge").toBeGreaterThan(116);
    // Up to Forest the strip's bottom edge is still past both edges.
    for (const you of [0, 500, 1_000]) {
      const bottom = mountainSpan(stripFrame(you).bottom + 20, 117, you, "close")!;
      expect(bottom.left < 0 && bottom.right > 116, `${you} m: the strip's bottom edge`).toBe(true);
    }
    // The strip's bottom rows (the valley floor and the forest above it) are ground edge to edge.
    const close = strip(0);
    for (let y = 40; y < 47; y++) {
      for (let x = 0; x < 117; x++) expect(GROUND.has(close.px[y * 117 + x]) || ["marker", "balloon-light", "balloon-shade", "basket", "marker-ring", "marker-edge"].includes(ROLES[close.px[y * 117 + x]]), `strip row ${y}, x ${x}: ${ROLES[close.px[y * 117 + x]]}`).toBe(true);
    }
    // Climb's window as it opens at 0 m (5,000 m tall): the mountain past both edges, bottom to top; its top far off the frame.
    for (let a = 0; a < climbWindowTop(0, 5_000, 12_600); a += 25) {
      const span = mountainSpan(a, 117, 0)!;
      expect(span.left < 0 && span.right > 116, `${a} m`).toBe(true);
    }
  });

  it("Climb's mountain is a short, wide Fuji (Feature 10f): at least 60% of the window at 7,500 and 8,500 m, its flat top (the crater) at least 25%", () => {
    for (const width of [88, 117, 130, 156]) {
      const shown = (a: number) => {
        const span = mountainSpan(a, width, 150)!;
        return Math.min(width - 1, span.right) - Math.max(0, span.left) + 1;
      };
      expect(shown(7_500), `${width} px at 7,500 m`).toBeGreaterThanOrEqual(0.6 * width);
      expect(shown(8_500), `${width} px at 8,500 m`).toBeGreaterThanOrEqual(0.6 * width);
      const top = mountainSpan(SUMMIT_M - 1, width, 150)!;
      expect(top.right - top.left, `${width} px: the crater`).toBeGreaterThanOrEqual(0.25 * width);
    }
    // As drawn on Climb's canvas (you at 150 m): the row at 8,500 m is at least 60% mountain, the one at 7,500 m all of it.
    const { height, w } = climbView(150);
    const cone = (a: number) => {
      const y = height - 1 - Math.round(a / 25);
      return [...w.px.slice(y * 117, y * 117 + 117)].filter((v) => CONE.has(v)).length;
    };
    expect(cone(8_500)).toBeGreaterThanOrEqual(0.6 * 117);
    expect(cone(7_500)).toBe(117);
  });

  it("Climb's crater as drawn: open sky in a dip on the rim row with shaded lips, sky in the middle of the next row, the bowl's floor below", () => {
    for (const width of [88, 117, 156]) {
      for (const theme of ["light", "dark"] as const) {
        const height = 400;
        const w = drawWorldBase({ width, height, metresPerRow: 25, bottom: 0, top: 10_000, you: 150, theme, moon: null });
        const at = (x: number, y: number) => ROLES[w.px[y * width + x]];
        const top = [...Array(height).keys()].find((y) => [...Array(width).keys()].some((x) => CONE.has(w.px[y * width + x])))!;
        const centre = Math.floor(width / 2);
        const dip = coneHalfWidth(SUMMIT_M - 1, width, 150) * 0.5;
        const label = `${width} px ${theme}`;
        // The rim row: sky in the dip, a shaded lip on each side of it.
        expect(CONE.has(w.px[top * width + centre]), `${label}: sky in the dip`).toBe(false);
        for (const side of [-1, 1]) {
          const lips = [...Array(width).keys()].filter((x) => Math.sign(x + 0.5 - width / 2) === side && Math.abs(x + 0.5 - width / 2) >= dip && Math.abs(x + 0.5 - width / 2) < dip + 1.5);
          expect(lips.some((x) => at(x, top).startsWith("snow-")), `${label}: a lip on side ${side}`).toBe(true);
        }
        // The next row: still sky in the middle; the one below: the bowl's floor, no sky anywhere across the mountain.
        expect(CONE.has(w.px[(top + 1) * width + centre]), `${label}: sky in the bowl`).toBe(false);
        expect(at(centre, top + 2), `${label}: the bowl's floor`).toBe("snow-gully");
        const span = mountainSpan((height - 1 - (top + 2) + 0.5) * 25, width, 150)!;
        for (let x = Math.max(0, span.left); x <= Math.min(width - 1, span.right); x++) expect(CONE.has(w.px[(top + 2) * width + x]), `${label}: x ${x} on the bowl's floor row`).toBe(true);
      }
    }
  });

  it("Climb's Fuji: concave flanks, a base many windows wide, the same at every height, and no spire anywhere", () => {
    // Concave: the widening per row never shrinks going down (from the top to 2,000 m below it).
    let last = 0;
    for (let a = SUMMIT_M - 25; a > SUMMIT_M - 2_000; a -= 25) {
      const step = coneHalfWidth(a - 25, 117, 150) - coneHalfWidth(a, 117, 150);
      expect(step, `${a} m`).toBeGreaterThanOrEqual(last - 1e-9);
      last = step;
    }
    // The base: at least 10 windows each side.
    expect(coneHalfWidth(0, 117, 150)).toBeGreaterThanOrEqual(10 * 117);
    // Fixed: it doesn't depend on your height (it stands still; only your balloon moves).
    const base = (you: number) => drawWorldBase({ width: 117, height: 400, metresPerRow: 25, bottom: 0, top: 10_000, you, theme: "dark", moon: null }).px;
    for (const you of [0, 3_000, 7_000, 8_763, 30_000]) expect(Buffer.from(base(you)).equals(Buffer.from(base(150))), `${you} m`).toBe(true);
    // Edge to edge below about 8,180 m: every row of Climb's canvas from 0 to 8,100 m is ground.
    const still = drawWorldBase({ width: 117, height: 400, metresPerRow: 25, bottom: 0, top: 10_000, you: 150, theme: "light", moon: null });
    for (let y = 400 - 1 - Math.round(8_100 / 25); y < 400; y++) {
      for (let x = 0; x < 117; x++) expect(GROUND.has(still.px[y * 117 + x]), `row ${y}, x ${x}: ${ROLES[still.px[y * 117 + x]]}`).toBe(true);
    }
    // No spire: from the valley to the crater the mountain is never narrower than a quarter of the window.
    for (const width of [88, 117, 156]) {
      for (let a = 0; a < SUMMIT_M; a += 25) {
        const span = mountainSpan(a, width, 150)!;
        expect(span.right - span.left, `${width} px at ${a} m`).toBeGreaterThanOrEqual(0.25 * width);
      }
    }
  });

  it("Climb's slope is never a blank card: every 800 m of snow on the full-width slope (3,300–7,300 m) shows at least 3 streaks running down, on 88, 117 and 156 px", () => {
    for (const width of [88, 117, 156]) {
      for (const theme of ["light", "dark"] as const) {
        const w = drawWorldBase({ width, height: 400, metresPerRow: 25, bottom: 0, top: 10_000, you: 150, theme, moon: null });
        const at = (x: number, y: number) => (x < 0 || x >= width ? -1 : w.px[y * width + x]);
        // Streaks crossing a row: runs of shade with lit snow at both ends (on the lit face), and runs of gully (on the shaded face).
        // (A rare 2 px wind ripple in light counts too.)
        const crossing = (y: number) => {
          let n = 0;
          for (let x = 0; x < width; x++) {
            const r = at(x, y);
            if (r !== role("snow-shade") && r !== role("snow-gully")) continue;
            let end = x;
            while (at(end + 1, y) === r) end++;
            if (r === role("snow-gully") || (at(x - 1, y) === role("snow") && at(end + 1, y) === role("snow"))) n++;
            x = end;
          }
          return n;
        };
        // The band's median row must cross at least 3.
        for (let a = 3_300; a + 32 * 25 <= 7_300; a += 32 * 25) {
          const yTop = 400 - 1 - Math.round((a + 32 * 25) / 25);
          const counts: number[] = [];
          for (let y = yTop; y < yTop + 32; y++) counts.push(crossing(y));
          counts.sort((p, q) => p - q);
          const columns = counts[16];
          expect(columns, `${width} px ${theme}, ${a}–${a + 800} m`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("Climb's streaks never run down the centre column (under the flat top that reads as a road's centre line)", () => {
    for (const width of [88, 117, 156]) {
      for (const theme of ["light", "dark"] as const) {
        const w = drawWorldBase({ width, height: 400, metresPerRow: 25, bottom: 0, top: 10_000, you: 150, theme, moon: null });
        const at = (x: number, y: number) => w.px[y * width + x];
        for (let a = 3_000; a < SUMMIT_M - 100; a += 25) {
          const y = 400 - 1 - Math.round(a / 25);
          for (let x = 0; x < width; x++) {
            if (Math.abs(x + 0.5 - width / 2) >= 4) continue;
            const lone = at(x, y) === role("snow-shade") && at(x - 1, y) === role("snow") && at(x + 1, y) === role("snow");
            expect(at(x, y) === role("snow-gully") || lone, `${width} px ${theme}, ${a} m, x ${x}`).toBe(false);
          }
        }
      }
    }
  });

  it("Today's strip is exactly as in Feature 10e (the 10f change is Climb's alone)", () => {
    const fnv = (px: Uint8Array) => {
      let h = 2166136261;
      for (const v of px) {
        h ^= v;
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(16);
    };
    // Taken from the 10e commit (5cc0545).
    const golden: Record<string, string> = {
      "light 0 close": "4899a04e", "light 0 far": "2641ad8", "light 3000 close": "98a6e322", "light 3000 far": "ee9c5b42",
      "light 7000 close": "e8c02eba", "light 7000 far": "9490b80a", "light 8763 close": "5e016e2d", "light 8763 far": "a49b998f",
      "light 9500 close": "df05bc5e", "light 9500 far": "76bce590", "dark 0 close": "d29ea075", "dark 0 far": "88cdf343",
      "dark 3000 close": "a21e7230", "dark 3000 far": "38c83490", "dark 7000 close": "4475ed53", "dark 7000 far": "27c5bd47",
      "dark 8763 close": "b5c4aeb9", "dark 8763 far": "eebf5367", "dark 9500 close": "dcecb4a", "dark 9500 far": "6b6ddf19",
    };
    for (const theme of ["light", "dark"] as const) {
      for (const you of [0, 3_000, 7_000, 8_763, 9_500]) {
        expect(fnv(strip(you, theme).px), `${theme} ${you} m`).toBe(golden[`${theme} ${you} close`]);
        expect(fnv(drawWorldBase(closeFarOptions({ width: 117, height: 47, theme, altitude: you, you })).px), `${theme} ${you} m, far`).toBe(golden[`${theme} ${you} far`]);
      }
    }
    // Shaped from the day's start, mid-drift, and at other widths (also from 5cc0545).
    const more: [string, Parameters<typeof drawClose>[0], string, string][] = [
      ["8,763 m from 8,700, drifting", { width: 117, height: 47, time: 9_000, altitude: 8_763, you: 8_700, driftMs: 700, theme: "light" }, "1e5eea89", "f4639fec"],
      ["3,000 m from 2,900, drifting", { width: 117, height: 47, time: 9_000, altitude: 3_000, you: 2_900, driftMs: 700, theme: "light" }, "4f302d01", "7504e7c9"],
      ["88 px at 5,000 m", { width: 88, height: 47, time: 0, altitude: 5_000, you: 5_000, driftMs: 700, theme: "light" }, "bd112002", "98a7f29a"],
      ["130 px at 8,763 m", { width: 130, height: 47, time: 0, altitude: 8_763, you: 8_763, driftMs: 700, theme: "light" }, "196c314a", "97a6c6"],
    ];
    for (const [label, o, light, dark] of more) {
      expect(fnv(drawClose(o).px), `${label}, light`).toBe(light);
      expect(fnv(drawClose({ ...o, theme: "dark" }).px), `${label}, dark`).toBe(dark);
    }
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
    // On Climb (a fixed mountain), the mountain where its window opens at the top never widens as you climb: the window's top only rises.
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
    // On Climb the opened window is slope edge to edge low down; sky comes into its top corners from about 5,000 m.
    for (const you of [0, 1_500, 3_000, 4_500]) {
      const top = mountainSpan(climbWindowTop(you, 5_000, Infinity) - 25, 117, you)!;
      expect(top.left < 0 && top.right > 116, `${you} m: slope across the window's top`).toBe(true);
    }
    for (const you of [5_500, 6_500]) {
      const top = mountainSpan(climbWindowTop(you, 5_000, Infinity) - 25, 117, you)!;
      expect(top.left > 0 && top.right < 116, `${you} m: sky in the window's top corners`).toBe(true);
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

  it("the strip's mountain changes only a little from one day to the next (a day's 150 m at most)", () => {
    for (const you of [0, 3_000, 6_000, 7_700, 7_848, 8_600]) {
      const a = drawWorldBase(closeFarOptions({ width: 117, height: 47, theme: "light", altitude: you, you }));
      const b = drawWorldBase({ ...closeFarOptions({ width: 117, height: 47, theme: "light", altitude: you, you }), you: you + 150 });
      let changed = 0;
      for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) changed++;
      // (Measured on the strip's own 47-row frame, mostly mountain: 9% at most, at 3,000 m.)
      expect(changed / a.px.length, `${you} m`).toBeLessThan(0.1);
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

  it("Climb's dark moon sits at least 700 m above the Summit (its glow clear of the slope and of the Summit's chip even at 200% text), in the opened window from about 7,300 m", () => {
    for (let you = 0; you <= 9_000; you += 100) {
      const top = worldTop(you);
      const height = Math.ceil(top / 25);
      const m = worldMoon(117, height, 25, you, top);
      const a = (height - 1 - m.y) * 25;
      // The Summit chip at 200% text reaches about 400 m above 8,848 m; the glow about 175 m below the moon's centre.
      expect(a - 175, `${you} m`).toBeGreaterThan(SUMMIT_M + 400);
      if (you >= 7_300 && you <= 9_000) expect(a, `${you} m: in the opened window`).toBeLessThan(climbWindowTop(you, 5_000, top));
    }
  });

  it("Climb's dark moon never sits under a zone's chip (each just above where its zone starts, at the left, up to about 400 m tall at 200% text)", () => {
    for (let you = 0; you <= 60_000; you += 250) {
      const top = worldTop(you);
      const height = Math.ceil(top / 25);
      const m = worldMoon(117, height, 25, you, top);
      const a = (height - 1 - m.y) * 25;
      for (const z of zonesBelow(top)) expect(a > z.from - 300 && a < z.from + 575, `${you} m: the moon at ${a} m, ${z.name}'s chip at ${z.from} m`).toBe(false);
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
      const base = (bottom: number) => drawWorldBase({ width: 117, height: 47, metresPerRow: 40, bottom, top: 12_500, you, theme: "light", moon: null, view: "close" });
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
