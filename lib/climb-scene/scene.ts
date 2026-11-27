// The Climb's pixel-art world (plans/habit-tracker.md, Features 10 to 10f).
//
// The journey: a Fuji-like mountain seen close up, its base filling the
// width at the bottom (on Today's strip its slopes narrow as you climb; on
// Climb it's one fixed, short and wide Fuji, 10f) until its flat top and
// crater (the Summit, 8,848 m) come into view (10e: no cloud hides it); you
// pass it; a band of cloud; the stratosphere darkening; then space,
// which repeats every LOOP_M from LOOP_FROM_M up, so it looks the same
// forever. Your marker is a small hot-air balloon.
//
// Pure: it fills a buffer of colour ROLES, one byte per logical pixel; the
// component (components/climb/scene-canvas.tsx) paints the roles in the
// theme's token colours and scales the canvas up by a whole number, so every
// pixel is a crisp square. No canvas here, so it's tested in Node.
//
// Two views of one world:
// - "world": the Climb screen, valley to the top of the sky, 25 m a row.
// - "close": Today's strip, near clouds at 5 m a row in front of the world
//   itself at 40 m a row (a far, slow layer).
//
// Everything is placed in metres by seeded randomness, so the scene is the
// same on every visit; only drift (time) and your altitude move things.
// The still layer (drawWorldBase) is drawn once and cached by the caller;
// each tick only draws the drifting clouds and you (drawWorldMoving).

import { CM, SUMMIT_M, nextZone, zoneByIndex } from "../altitude";
import type { Bit } from "../celebration";
import { SCENE_PALETTE, contrast } from "../palette";

/** Sky bands, highest (1) to lowest (12). */
const SKY = Array.from({ length: 12 }, (_, i) => `sky-${i + 1}` as const);

/** Colour roles. Index = the byte in the buffer. 0 is "nothing drawn". */
export const ROLES = [
  "none",
  ...SKY,
  "space-9",
  "space-8",
  "space-7",
  "space-6",
  "space-5",
  "space-4",
  "space-3",
  "space-2",
  "space-1",
  "star",
  "star-dim",
  "moon",
  "moon-shade",
  "moon-glow",
  "moon-glow-2",
  "bank-far",
  "bank-far-light",
  "bank-near",
  "bank-near-light",
  "bank-edge",
  "bank-shade",
  "ridge-far",
  "ridge-near",
  "rock",
  "rock-shade",
  "snow",
  "snow-shade",
  "snow-gully",
  "pine",
  "pine-dark",
  "pine-shade",
  "valley",
  "valley-dark",
  "lake",
  "lake-light",
  "cloud",
  "cloud-light",
  "cloud-shade",
  "cloud-deep",
  "cloud-far",
  "cloud-far-shade",
  "cirrus",
  "cloud-high",
  "cloud-high-shade",
  "bird",
  "bird-light",
  "rim",
  "planet",
  "planet-shade",
  "satellite",
  "nebula",
  "nebula-light",
  "marker",
  "balloon-light",
  "balloon-shade",
  "basket",
  "marker-ring",
  "marker-edge",
] as const;

export type Role = (typeof ROLES)[number];
const R = Object.fromEntries(ROLES.map((role, i) => [role, i])) as Record<Role, number>;

export type Theme = "light" | "dark";

/** The world's top: 12,000 m, or higher once you are (your altitude + 1,500 m, and always past the next zone, in 2,500 m steps). */
export function worldTop(altitude: number): number {
  const next = nextZone(Math.max(0, Math.round(altitude * CM))).zone.from;
  return Math.max(12_000, Math.ceil(Math.max(altitude + 1_500, next + 1_000) / 2_500) * 2_500) + 600;
}

/** On Climb, stars and rocks keep out of this many columns at the right: the ruler (4 px in) and its ticks (3 px wide), and a column of air. */
const RULER_CLEAR_PX = 8;

/** On Climb, the sky above the highest zone and ruler mark: their chips (and sky above them) are whole at the scroll limit. */
export const TOP_SKY_M = 1_000;

/**
 * Climb's world top (Feature 10g): TOP_SKY_M above a 2,500 m step that is
 * at least the space loop's start (so everyone can scroll on into space, to
 * 45,000 m), at least 1,500 m above you and at least 1,000 m above the next
 * zone. Zones from 42,500 m are 2,500 m apart, so the highest zone and ruler
 * mark are always exactly TOP_SKY_M under the top. Today's strip keeps worldTop.
 */
export function climbTop(altitude: number): number {
  const next = nextZone(Math.max(0, Math.round(altitude * CM))).zone.from;
  return Math.max(LOOP_FROM_M, Math.ceil(Math.max(altitude + 1_500, next + 1_000) / 2_500) * 2_500) + TOP_SKY_M;
}

/**
 * The rows to repaint between two frames of roles: runs [from, to] (inclusive)
 * of rows with any changed pixel, runs closer than `gap` rows merged (one
 * rectangle each). Everything when there's no last frame.
 */
export function dirtyRuns(last: Uint8Array | null, px: Uint8Array, width: number, gap = 8): [number, number][] {
  const height = Math.floor(px.length / width);
  if (!last || last.length !== px.length) return height > 0 ? [[0, height - 1]] : [];
  const runs: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    let changed = false;
    for (let i = y * width; i < (y + 1) * width && !changed; i++) changed = px[i] !== last[i];
    if (!changed) continue;
    const run = runs[runs.length - 1];
    if (run && y - run[1] <= gap) run[1] = y;
    else runs.push([y, y]);
  }
  return runs;
}

/** A small, fast, seeded random number generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in [0, 1) for (seed, i), without allocating (an integer hash). */
function hash01(seed: number, i: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise on a line: the same x and seed always give the same value in [0, 1). */
function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(seed, i);
  const b = hash01(seed, i + 1);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

/** A drawing surface: a role per logical pixel, row 0 at the top. */
export class Canvas {
  readonly px: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.px = new Uint8Array(width * height);
  }
  set(x: number, y: number, role: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.px[y * this.width + x] = role;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.px[y * this.width + x];
  }
}

/** One rounded bump of a cloud: centre and radius, in logical pixels. */
export type Bump = { x: number; y: number; r: number };

export type CloudShades = {
  base: number;
  light: number;
  shade: number;
  deep: number;
  /** A one-pixel edge along the top-left silhouette (dark mode's coral rim, a bank's moonlit edge). */
  rim?: number;
  /** Small, far clouds: just the body and a bottom band, no arcs (they'd only speckle at that size). */
  plain?: boolean;
};

function inCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px + 0.5 - cx;
  const dy = py + 0.5 - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * A pixel cloud from rounded bumps (back to front) above a flat base, the
 * reference's way: crisp stepped edges; inside each bump a thin lighter arc
 * along its upper left and a thin shaded one along its lower right, so the
 * bumps in front draw curved seams over the ones behind; the body below the
 * bumps in the base colour; a thin shaded band and a deeper last row at the
 * bottom. No outlines. `ox`, `oy` place it; `base` is its bottom row.
 */
export function drawCloud(
  c: Pick<Canvas, "set" | "get">,
  ox: number,
  oy: number,
  bumps: readonly Bump[],
  base: number,
  shades: CloudShades,
  /** Banks and the cloud sea: a seed for a stepped, uneven underside instead of a straight one. */
  ragged?: number,
  /** Collects the rim's pixels as [x, y, the role under it, …] (so a rim left in fragments can be put back: tidyRims). */
  rims?: number[],
) {
  const undersides = new Map<number, number>();
  const bottom = (x: number) => {
    if (ragged === undefined) return base;
    let b = undersides.get(x);
    if (b === undefined) {
      b = base - Math.floor(noise1(x / 6, ragged) * 3 + noise1(x / 2.3, ragged + 1) * 1.4);
      undersides.set(x, b);
    }
    return b;
  };
  const drawn = new Set<number>();
  const key = (x: number, y: number) => (y + 50_000) * 100_000 + (x + 50_000);
  let top = Infinity;
  for (const b of bumps) {
    const shift = b.r < 5 ? 1 : 1.6;
    const x0 = Math.floor(b.x - b.r);
    const x1 = Math.ceil(b.x + b.r);
    const y0 = Math.floor(b.y - b.r);
    top = Math.min(top, y0);
    for (let y = y0; y <= base; y++) {
      for (let x = x0; x <= x1; x++) {
        if (y > bottom(x)) continue;
        const round = inCircle(x, y, b.x, b.y, b.r);
        // Below the bump's middle the body runs straight down to the base.
        const body = !round && y + 0.5 >= b.y && x + 0.5 >= b.x - b.r * 0.9 && x + 0.5 <= b.x + b.r * 0.9;
        if (!round && !body) continue;
        let role = shades.base;
        if (shades.plain) role = shades.base;
        else if (round && y + 0.5 < b.y && !inCircle(x, y, b.x + shift, b.y + shift, b.r)) role = shades.light;
        else if (round && y + 0.5 >= b.y - b.r * 0.2 && !inCircle(x, y, b.x - shift, b.y - shift, b.r)) role = shades.shade;
        c.set(ox + x, oy + y, role);
        drawn.add(key(x, y));
      }
    }
  }
  const xs = bumps.flatMap((b) => [Math.floor(b.x - b.r), Math.ceil(b.x + b.r)]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  // The underside: a thin shaded band, the last row deeper.
  const band = ragged === undefined ? 1 : 2;
  for (let x = left; x <= right; x++) {
    const b = bottom(x);
    for (let y = b - band; y <= b; y++) {
      if (!drawn.has(key(x, y))) continue;
      c.set(ox + x, oy + y, y === b ? shades.deep : shades.shade);
    }
  }
  // The rim: only the upper-left arc of the silhouette (the edge facing the
  // moon), the first third of the top from the left. A catch of light, not an outline.
  if (shades.rim !== undefined) {
    const mid = (top + base) / 2;
    const reach = left + (right - left) * 0.36;
    for (const k of drawn) {
      const y = Math.floor(k / 100_000) - 50_000;
      const x = (k % 100_000) - 50_000;
      if (y > mid || x > reach) continue;
      // Only against the sky (a rim against snow or another cloud reads as a loose bar).
      if (!drawn.has(key(x, y - 1)) && isSky(c.get(ox + x, oy + y - 1))) {
        rims?.push(ox + x, oy + y, c.get(ox + x, oy + y));
        c.set(ox + x, oy + y, shades.rim);
      }
    }
  }
}

// Small low clouds (mostly) and a few medium cumulus, as rounded bumps over
// a flat base, back to front: hand-placed, like a pixel artist's sprites.
export const SMALL_CLOUDS: readonly { bumps: Bump[]; base: number; width: number }[] = [
  {
    bumps: [
      { x: 5, y: 7, r: 3.2 },
      { x: 26.5, y: 7.2, r: 2.8 },
      { x: 10, y: 5.5, r: 4.2 },
      { x: 22, y: 6, r: 4 },
      { x: 16, y: 4.8, r: 4.8 },
    ],
    base: 9,
    width: 30,
  },
  {
    bumps: [
      { x: 4.5, y: 6.5, r: 3 },
      { x: 20, y: 6.6, r: 3.2 },
      { x: 9.5, y: 4.8, r: 4.2 },
      { x: 15, y: 5.2, r: 4 },
    ],
    base: 8,
    width: 24,
  },
  {
    bumps: [
      { x: 3.5, y: 7.4, r: 2.6 },
      { x: 30.5, y: 7.6, r: 2.4 },
      { x: 9, y: 5.8, r: 3.8 },
      { x: 26.5, y: 6.4, r: 3.6 },
      { x: 21, y: 5, r: 4.4 },
      { x: 15, y: 4.8, r: 4.8 },
    ],
    base: 9,
    width: 34,
  },
];

export const MEDIUM_CLOUDS: readonly { bumps: Bump[]; base: number; width: number }[] = [
  {
    bumps: [
      { x: 7, y: 16.5, r: 5.5 },
      { x: 45, y: 16.5, r: 5.5 },
      { x: 15, y: 12, r: 7 },
      { x: 37, y: 12.5, r: 7 },
      { x: 26, y: 8.5, r: 8.5 },
      { x: 20, y: 15.5, r: 6 },
      { x: 32, y: 15.5, r: 6 },
    ],
    base: 21,
    width: 52,
  },
  {
    bumps: [
      { x: 6, y: 14.5, r: 5 },
      { x: 40, y: 14.5, r: 4.8 },
      { x: 14, y: 10.5, r: 6.5 },
      { x: 30.5, y: 9, r: 7.5 },
      { x: 22, y: 13, r: 6.8 },
    ],
    base: 19,
    width: 46,
  },
];

/** What the mountain is made of at an altitude. */
export function groundAt(altitude: number, snowline: number, treeline: number): "valley" | "pine" | "rock" | "snow" {
  if (altitude < 500) return "valley";
  if (altitude < treeline) return "pine";
  if (altitude < snowline) return "rock";
  return "snow";
}

/** Where each sky band starts (above the lowest), in metres: stepped, gently. */
export const SKY_BANDS = [700, 1_500, 2_400, 3_400, 4_500, 5_700, 7_000, 8_400, 9_900, 11_500, 12_500] as const;

/** Cirrus wisps up to here (the stratosphere). */
const CIRRUS_END_M = 18_000;

/** Where each of space's colours starts (space-9 … space-1, deepest last): the sky darkens gently through the stratosphere into space. */
export const SPACE_BANDS = [13_250, 14_000, 14_750, 15_500, 16_250, 17_000, 17_750, 18_750, 20_000] as const;
/** From here the sky is dark enough for stars in light mode too (and a dark box before the scene paints). */
export const NIGHT_M = 17_500;
/** Space: planets, satellites… from here up. */
export const SPACE_M = 20_000;
/** Space is drawn the same every LOOP_M from here up (past the last named zone, so each named one has its own sky): a seamless backdrop, forever. */
export const LOOP_FROM_M = 45_000;
export const LOOP_M = 10_000;

/** The altitude that seeds what's drawn at `altitude`: itself below LOOP_FROM_M, then the same place in the repeating stretch. */
export function looped(altitude: number): number {
  if (altitude < LOOP_FROM_M) return altitude;
  return LOOP_FROM_M + (((altitude - LOOP_FROM_M) % LOOP_M) + LOOP_M) % LOOP_M;
}

/** The sky band (sky-12 palest … sky-1, then space-9 … space-1 deepest) at an altitude: fixed in metres, so the sky never shifts as the world grows. */
export function skyBand(altitude: number): number {
  const space = SPACE_BANDS.filter((b) => altitude >= b).length;
  if (space > 0) return R["space-9"] + space - 1;
  return R["sky-12"] - SKY_BANDS.filter((b) => altitude >= b).length;
}

function isSky(role: number): boolean {
  return (role >= R["sky-1"] && role <= R["sky-12"]) || (role >= R["space-9"] && role <= R["space-1"]);
}

/** The sky one band paler than this one (for wisps: a shade lighter than the sky they're in). */
function paler(role: number): number {
  if (role >= R["sky-1"] && role < R["sky-12"]) return role + 1;
  if (role === R["space-9"]) return R["sky-1"];
  if (role > R["space-9"] && role <= R["space-1"]) return role - 1;
  return role;
}

export type WorldOptions = {
  width: number;
  height: number;
  /** Metres per row. */
  metresPerRow: number;
  /** The altitude at the bottom row. */
  bottom: number;
  /** The world's top. */
  top: number;
  /** Your altitude, which shapes the strip's mountain (how stretched its profile is drawn); Climb's is fixed. */
  you: number;
  theme: Theme;
  /** The moon, in logical pixels of this view (so it's in sight); dark always, light once the sky is deep (moonShows). Or null. */
  moon: { x: number; y: number } | null;
  /** ms, for drift; 0 for a still scene. */
  time: number;
  /** Your altitude: the marker. null for none. */
  altitude: number | null;
  /** ms per pixel of cloud drift (MOTION.drift). */
  driftMs: number;
  /** Keep the balloon's centre at least this far right (logical px): clear of the page's chips beside it. */
  balloonMinX?: number;
  /** With no balloon of its own (the strip's far layer), keep clouds clear of this one (logical px, its basket's row). */
  clearOf?: { x: number; y: number } | null;
  /** Whose frame shapes the mountain: Climb's window ("world", the default) or Today's strip ("close", its far layer). */
  view?: View;
  /** Tests only: leave coral rim fragments as Feature 10e drew them (to compare with its checksums). */
  keepRimFragments?: boolean;
};

/** Climb's window (a fixed, wide Fuji) or Today's strip (the profile stretched for your height): coneDepth, coneHalfWidth. */
export type View = "world" | "close";

export type BaseOptions = Omit<WorldOptions, "time" | "altitude" | "driftMs" | "balloonMinX">;

const SEED = 20261125;

/**
 * The mountain (Features 10c, 10e, 10f): one Fuji-like cone, its flat top
 * and crater at the Summit (8,848 m), seen close up, with nothing hiding it.
 * - On Today's strip its profile (concave flanks, gentle low down, steeper
 *   near the top) is drawn stretched upward while you're far below
 *   (coneDepth): the strip's bottom always sits on the broad lower flanks
 *   (past both edges at Base camp), the flanks curve in above, and as you
 *   climb the slopes narrow and sky comes in on both sides. From
 *   CONE_REAL_FROM_M up it's the real cone.
 * - On Climb it's one fixed, short and wide Fuji (WORLD_*): the slope fills
 *   the window edge to edge below about 8,250 m, the flat top a third of it.
 */
const CONE_CENTRE = 0.5;
/** Half-width of the flat top, as a share of the width. */
const CONE_TOP = 0.085;
/** Near the top the flanks widen at least this much per metre down (share of the width): so the strip's summit is broad, not a plug. It fades out lower down. */
const CONE_SHOULDER = 0.00034;
const CONE_SHOULDER_M = 400;
/** How fast the flanks widen going down (share of the width, scaled by the curve below). */
const CONE_SPREAD = 0.168;
/** The flanks' curve: the widening grows by e every this many metres down (concave, like Fuji). */
const CONE_FOLD_M = 1_500;
/** Today's strip (47 rows of 40 m, you a third of the way up) reaches this far below you: round(47 × (1 − YOU_FROM_TOP)) × 40. */
export const FRAME_BELOW_M = 640;
/** How deep into the profile the strip's bottom edge sits: this at Base camp… */
const EDGE_DEPTH_M = 2_049;
/** …shrinking steadily to this, where the real cone takes over. */
const EDGE_DEPTH_REAL_M = 1_640;
/** From here up the mountain is the real cone. */
export const CONE_REAL_FROM_M = SUMMIT_M + FRAME_BELOW_M - EDGE_DEPTH_REAL_M;
/** Far below, the stretched profile's extra bend (its depth goes as a power 1 + this of the real one), easing to none at CONE_REAL_FROM_M. */
const CONE_BEND = 0.8;

/** Climb's window as it opens on a phone (about 600 css px): its moon is placed for this. */
const WORLD_WINDOW_M = 5_000;
/**
 * Climb's mountain (Feature 10f): one fixed Fuji, short and wide, drawn at
 * Climb's true scale (25 m a row), the same for you at any height. Its
 * half-width, as a share of the window's width, at a depth d below the Summit:
 * WORLD_TOP + WORLD_STEEP·d + WORLD_FLARE·d².
 * The flat top and crater a third of the window; the flanks about 0.7 px a
 * row at the rim on a phone, flaring to about 2.6 px a row where they leave
 * the frame (concave: the widening per metre only grows); 64% wide at
 * 8,500 m, past both edges from about 8,250 m; the base about 88 windows
 * across.
 */
const WORLD_TOP = 1 / 6;
const WORLD_STEEP = 0.00024;
const WORLD_FLARE = 5.6e-7;

/**
 * How deep into the real cone's profile an altitude is drawn, for you at
 * `you`, in a view. Never deeper than the real depth (in the view's frame);
 * 0 at the Summit.
 * - Today's strip ("close"): the real depth from CONE_REAL_FROM_M up; far
 *   below, the strip's bottom edge sits EDGE_DEPTH_M…EDGE_DEPTH_REAL_M deep
 *   and the depth above it shrinks faster than the real one (a power above
 *   1), so the flanks curve in within its ~1,880 m.
 * - Climb's window ("world"): the real depth, always (its own wide profile
 *   is in coneHalfWidth); `you` doesn't change it.
 */
export function coneDepth(altitude: number, you: number, view: View = "world"): number {
  const d = Math.max(0, SUMMIT_M - altitude);
  if (view === "world") return d;
  if (you >= CONE_REAL_FROM_M) return d;
  const t = Math.max(0, you) / CONE_REAL_FROM_M;
  const edge = SUMMIT_M - Math.max(you - FRAME_BELOW_M, STRIP_FLOOR_M);
  const target = EDGE_DEPTH_M - (EDGE_DEPTH_M - EDGE_DEPTH_REAL_M) * t;
  return target * Math.pow(d / edge, 1 + CONE_BEND * (1 - t));
}

/** The mountain's half-width (logical px, smooth) at an altitude, for you at `you`; 0 above the Summit. */
export function coneHalfWidth(altitude: number, width: number, you: number, view: View = "world"): number {
  if (altitude > SUMMIT_M) return 0;
  const d = coneDepth(altitude, you, view);
  if (view === "world") return width * (WORLD_TOP + WORLD_STEEP * d + WORLD_FLARE * d * d);
  return width * (CONE_TOP + CONE_SPREAD * (Math.exp(d / CONE_FOLD_M) - 1) + CONE_SHOULDER * d * Math.exp(-d / CONE_SHOULDER_M));
}

/** The mountain's left and right edges (logical x) at an altitude, or null above its top. */
export function mountainSpan(altitude: number, width: number, you: number, view: View = "world"): { left: number; right: number } | null {
  if (altitude >= SUMMIT_M) return null;
  const half = coneHalfWidth(altitude, width, you, view);
  const centre = width * CONE_CENTRE;
  // A little roughness on the edges, so the slopes step like rock, not a
  // ruler; less on Climb's broad top, where the flanks' curve must read.
  const rough = view === "world" ? 2 : 3;
  const roughL = (noise1(altitude / 160, 11) - 0.5) * rough;
  const roughR = (noise1(altitude / 190, 23) - 0.5) * rough;
  return { left: Math.floor(centre - half + roughL), right: Math.ceil(centre + half + roughR) };
}

/**
 * The line between the lit face (left) and the shaded one (right): a little
 * right of the centre, running out from the summit with the slope, wandering
 * and ragged like a real ridge (never a lane divider). On Climb, where the
 * slope is many windows wide, it leans right from the rim and eases toward
 * the right edge without leaving it (about 10 px short of it lower down), so
 * every window keeps a leaning shaded face, through snow, rock and forest.
 */
function ridgeAt(altitude: number, width: number, you: number, view: View = "world"): number {
  const half = coneHalfWidth(altitude, width, you, view);
  const out = half * (view === "world" ? 0.3 : 0.12);
  const room = width * RIDGE_ROOM - RIDGE_KEEP_PX;
  const shift = view === "world" ? room * (1 - Math.exp(-out / room)) : out;
  return width * CONE_CENTRE + shift + (noise1(altitude / 110, 29) - 0.5) * 4 + (noise1(altitude / 900, 31) - 0.5) * Math.min(12, half * 0.3);
}

/** On Climb the shade line eases toward this share of the width right of the centre (the right edge)… */
const RIDGE_ROOM = 0.5;
/** …less this many px, so even near the valley the shaded face is about this wide. */
const RIDGE_KEEP_PX = 10;

/** On Climb the rock fingers fan with the half-width only up to this share of the window: past it the slope runs off both edges, and they keep a phone's scale. */
const FACE_MAX = 0.75;
/** On Climb's wide slope a level of streaks is born this many px apart (and ends 4 times as far apart); closer on a narrow window, at most a sixth of its width. */
const STREAK_PX = 18;
/** …and only this share of a level's slots has one, so they're uneven (never a ruled fan). */
const STREAK_KEEP = 0.7;
/** Two streaks in a row stay at least this far apart (closer, they read as ski tracks). */
const STREAK_GAP = 7;
/** …and none within this many px of the centre column (it would read as a road's centre line). */
const STREAK_CENTRE_PX = 5;

/** The balloon's half-width, in logical pixels (it's 7 wide). */
const BALLOON_HALF = 3;
/** Clear air between the balloon and the slope. */
const BALLOON_GAP = 2;

/** The balloon never floats left of this share of the width: Climb's zone labels sit in the column at the left. */
export const BALLOON_MIN_X = 0.36;

/**
 * The x of your balloon's centre: just off the lit (left) slope at your
 * altitude where that's clear of the zone labels, else in front of the
 * slope at BALLOON_MIN_X; past the mountain's top it drifts over the crater
 * to the centre, a pixel at a time (no jump). Always on the canvas.
 */
export function balloonX(altitude: number, width: number, you: number, minX = Math.round(width * BALLOON_MIN_X), view: View = "world"): number {
  const apex = SUMMIT_M;
  // The slope two rows below the basket: where it's widest under the balloon.
  const at = Math.min(altitude, apex) - 60;
  const centre = Math.round(width * CONE_CENTRE);
  const beside = Math.max(minX, Math.min(centre - BALLOON_HALF - 2, Math.round(width * CONE_CENTRE - coneHalfWidth(at, width, you, view) - BALLOON_GAP - BALLOON_HALF)));
  // Past the top, it drifts over the crater: a pixel every 15 m, so it never jumps.
  const past = Math.max(0, altitude - apex);
  const x = beside >= centre ? beside : Math.min(centre, beside + Math.floor(past / 15));
  // At most at the right edge (its envelope in view; at large text sizes the page's chips can push it there).
  return Math.min(width - BALLOON_HALF - 1, x);
}

/** Cloud banks behind everything (centre, height, near, reach as a share of the width, the side they reach in from). */
const BANKS = [
  [1_300, 900, false, 0.75, "left"],
  [2_700, 1_100, true, 0.6, "right"],
  [4_100, 900, false, 0.7, "left"],
  [6_500, 1_100, true, 0.65, "right"],
  [7_900, 900, false, 0.7, "left"],
  // "Into the clouds": a full-width band in two tiers, well above the Summit.
  [10_500, 900, false, 1.1, "left"],
  [10_950, 1_000, true, 1.1, "right"],
] as const;

/** Is there cloud in the still layer (a bank, the cloud sea, the band above the Summit) within `margin` metres of an altitude, at x? The moon keeps off it. */
function cloudyAt(altitude: number, x: number, width: number, margin: number): boolean {
  if (altitude > CLOUD_BAND[0] - margin && altitude < CLOUD_BAND[1] + margin) return true;
  if (altitude > 4_650 - margin && altitude < 5_250 + margin) return true;
  return BANKS.some(([centre, height, , reach, side]) => {
    if (Math.abs(altitude - centre) > height / 2 + margin) return false;
    return side === "left" ? x < width * reach + 10 : x > width * (1 - reach) - 10;
  });
}

/** Row ↔ altitude for a view of the world. */
function rows(o: Pick<WorldOptions, "height" | "metresPerRow" | "bottom">) {
  return {
    alt: (row: number) => o.bottom + (o.height - 1 - row + 0.5) * o.metresPerRow,
    rowOf: (a: number) => Math.round(o.height - 1 - (a - o.bottom) / o.metresPerRow),
  };
}

/** Draws the world into a fresh canvas: the still base, then the drifting clouds and you. */
export function drawWorld(o: WorldOptions): Canvas {
  const c = drawWorldBase(o);
  drawWorldMoving(c, o);
  return c;
}

/** Everything that doesn't move: sky, stars, moon, banks, ridges, mountain, forest, valley, the cloud sea. Cache it. */
export function drawWorldBase(o: BaseOptions): Canvas {
  const c = new Canvas(o.width, o.height);
  const { alt, rowOf } = rows(o);
  const dark = o.theme === "dark";
  const lowest = alt(o.height - 1);
  const highest = alt(0);

  // 1. Sky, in gentle steps, each seam a little stepped (column by column), never a ruler line.
  for (let y = 0; y < o.height; y++) {
    const a = alt(y);
    for (let x = 0; x < o.width; x++) c.set(x, y, skyBand(a + (noise1(x / 4, 99) - 0.5) * 50));
  }

  // 2. Stars: dark, above the valley haze; light, once the sky turns to
  //    space. Seeded per kilometre (the looped one in space, so it repeats);
  //    never two touching; some dim, a few with a small cross.
  {
    const from = dark ? 2_500 : NIGHT_M;
    // Crowding is judged on star positions, not on the canvas, so a star just
    // outside the view still counts and the view's edges never change a star.
    const placed = new Set<string>();
    for (let k = Math.max(Math.floor(from / 1_000), Math.floor(lowest / 1_000) - 1); k * 1_000 <= highest + 1_000; k++) {
      const rnd = seeded(SEED + 1_000 + looped(k * 1_000) / 1_000);
      // Starfield (25,000 m) twice as many, Deep space (42,500 m) half (Feature 10g).
      const zone = k * 1_000 >= 25_000 && k * 1_000 < 27_500 ? 2 : k * 1_000 >= 42_500 && k * 1_000 < LOOP_FROM_M ? 0.5 : 1;
      const count = Math.round((o.width / (k * 1_000 >= SPACE_M ? 6 : 8)) * zone);
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rnd() * o.width);
        const a = k * 1_000 + rnd() * 1_000;
        const kind = rnd();
        const y = rowOf(a);
        if (a < from) continue;
        // On Climb, none on the window's edge, on the ruler's ticks or right of them (it'd read as a broken tick).
        if ((o.view ?? "world") === "world" && (x < 2 || x >= o.width - RULER_CLEAR_PX - 1)) continue; // (a cross-star reaches a pixel each way)
        let crowded = false;
        for (let dy = -2; dy <= 2 && !crowded; dy++) {
          for (let dx = -2; dx <= 2; dx++) if (placed.has(`${x + dx},${y + dy}`)) crowded = true;
        }
        if (crowded) continue;
        placed.add(`${x},${y}`);
        if (kind < (zone === 2 ? 0.12 : 0.06)) {
          c.set(x, y, R.star);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, R["star-dim"]);
        } else c.set(x, y, kind < 0.4 ? R["star-dim"] : R.star);
      }
    }
  }

  // 3. Space: now and then a distant planet (sometimes ringed) or a
  //    satellite, one per 2,500 m at most, seeded by the looped altitude.
  for (let j = Math.max(Math.floor(SPACE_M / 2_500), Math.floor(lowest / 2_500) - 1); j * 2_500 <= highest + 2_500; j++) {
    const rnd = seeded(SEED + 9_000 + looped(j * 2_500) / 2_500);
    // Some named zones get what they're named for.
    const zoneM = j * 2_500;
    // Moonlight: its slot is the moon's (drawn with the moon, Feature 10g), with nothing beside it.
    if (zoneM === 22_500) continue;
    if (zoneM === 32_500) {
      // Asteroid belt: a clear diagonal band of rocks, some small, some lumps, lit from the upper left.
      for (let i = 0; i < 38; i++) {
        const rx = Math.round(rnd() * o.width);
        const ry = rowOf(zoneM + 600 + (rx / o.width) * 900 + (rnd() - 0.5) * 150);
        const size = rnd();
        // On Climb, clear of the ruler's ticks.
        if ((o.view ?? "world") === "world" && rx + 2 >= o.width - RULER_CLEAR_PX) continue;
        if (size < 0.35) {
          // A lump, 3 by 3 with a corner off.
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (dx + dy < 4) c.set(rx + dx, ry + dy, dx + dy < 2 ? R.planet : R["planet-shade"]);
        } else {
          c.set(rx, ry, R.planet);
          c.set(rx + 1, ry, R["planet-shade"]);
          c.set(rx, ry + 1, R["planet-shade"]);
          if (size < 0.6) c.set(rx + 1, ry + 1, R["planet-shade"]);
        }
      }
      continue;
    }
    if (zoneM === 27_500) {
      // Satellites: three, at different heights, spread across the width.
      for (const [i, share] of [0.12, 0.74, 0.28].entries()) {
        let sx = Math.round(o.width * (share + rnd() * 0.08));
        // Never behind the balloon (it floats at the centre up here), as with the planets.
        if (Math.abs(sx - o.width * CONE_CENTRE) < 20) sx = Math.round(o.width * CONE_CENTRE + (sx < o.width * CONE_CENTRE ? -20 : 20));
        satellite(c, sx, rowOf(zoneM + 400 + i * 650 + rnd() * 300));
      }
      continue;
    }
    if (zoneM === 37_500) {
      // Nebula: a soft, stepped smudge in two tones, behind the stars.
      const nx = o.width * (0.3 + rnd() * 0.4);
      const ny = rowOf(zoneM + 1_200);
      for (let y = ny - 18; y <= ny + 18; y++) {
        for (let x = Math.floor(nx - 40); x <= nx + 40; x++) {
          const dx = (x - nx) / 40;
          const dy = (y - ny) / 18;
          const v = 1 - Math.sqrt(dx * dx + dy * dy) + (noise1(x / 6 + y / 9, SEED + 77) - 0.5) * 0.6;
          if (v > 0.15 && isSky(c.get(x, y))) c.set(x, y, v > 0.45 ? R["nebula-light"] : R.nebula);
        }
      }
      continue;
    }
    const named = zoneM === 35_000 ? 0.1 : null;
    const roll = rnd();
    const kind = named ?? roll;
    const a = j * 2_500 + 500 + rnd() * 1_500;
    let cx = Math.round(o.width * (0.12 + rnd() * 0.76));
    // Never behind the balloon (it floats at the centre up here): an object there would weaken its ring.
    const clear = 20; // a ringed planet reaches 11 px from its centre; the balloon and its ring 5
    if (Math.abs(cx - o.width * CONE_CENTRE) < clear) cx = Math.round(o.width * CONE_CENTRE + (cx < o.width * CONE_CENTRE ? -clear : clear));
    const cy = rowOf(a);
    if (cy < -12 || cy > o.height + 12) continue;
    if (kind < 0.45) {
      // A planet, lit from the upper left; sometimes ringed.
      const r = j * 2_500 === 35_000 ? 6 : 3.5 + rnd() * 3;
      const ringedRoll = rnd();
      const ringed = j * 2_500 === 35_000 || ringedRoll < 0.4;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          if (inCircle(x, y, cx + 0.5, cy + 0.5, r)) c.set(x, y, inCircle(x, y, cx - 0.5, cy - 0.5, r) ? R.planet : R["planet-shade"]);
        }
      }
      if (ringed) {
        // A flat ellipse: its lower arc in front of the planet, its upper arc hidden behind it.
        const rx = r + 3.5;
        const ry = 1.6;
        for (let t = 0; t < 360; t += 3) {
          const x = Math.round(cx + 0.5 + rx * Math.cos((t * Math.PI) / 180) - 0.5);
          const y = Math.round(cy + 0.5 + ry * Math.sin((t * Math.PI) / 180) - 0.5);
          const front = t < 180;
          if (front || !inCircle(x, y, cx + 0.5, cy + 0.5, r)) c.set(x, y, R.satellite);
        }
      }
    } else if (kind < 0.8) satellite(c, cx, cy);
    // Else: nothing here (space is mostly empty).
  }

  // 4. Cloud banks behind everything, about every 1,500 m, alternating far
  //    and near, each reaching in from one side.

  BANKS.forEach(([centre, height, near, reach, side], i) => {
    const baseRow = rowOf(centre - height / 2);
    const topRow = rowOf(centre + height / 2);
    if (baseRow < -10 || topRow > o.height + 10) return;
    const rnd = seeded(SEED + 200 + i);
    const bumps: Bump[] = [];
    const span = o.width * reach;
    const from = side === "left" ? -10 : o.width - span;
    const to = side === "left" ? span : o.width + 10;
    for (let x = from; x < to; ) {
      const edge = side === "left" ? (to - x) / span : (x - from) / span;
      const taper = Math.max(0.3, Math.min(1, edge * 2.5));
      const r = (6 + rnd() * 9) * taper;
      // Towards the open end the lobes get smaller and sit lower, so the bank
      // ends in a rounded tail, not a wall.
      const sink = (1 - taper) * (baseRow - topRow) * 0.7;
      bumps.push({ x, y: topRow + r + sink + rnd() * Math.max(1, (baseRow - topRow) * 0.4), r });
      // Never further than the next (possibly small) lobe's body reaches: no one-column gap of sky.
      x += Math.min(r * (0.85 + rnd() * 0.5), r * 0.9 + 1.5);
    }
    bumps.sort((a, b) => a.y - b.y);
    drawCloud(
      c,
      0,
      0,
      bumps,
      baseRow,
      dark && centre < SUMMIT_M
        ? cloudShades(true, dark)
        : {
            base: near ? R["bank-near"] : R["bank-far"],
            light: near ? R["bank-near-light"] : R["bank-far-light"],
            shade: R["bank-shade"],
            deep: R["bank-shade"],
            rim: dark && near ? R["bank-edge"] : undefined,
          },
      SEED + 300 + i,
    );
  });

  // 5. Far ridges, hazy, across the width.
  const ridge = (peakAlt: number, seed: number, role: number) => {
    for (let x = 0; x < o.width; x++) {
      const h = peakAlt * (0.5 + 0.5 * noise1(x / 14, seed)) * (0.9 + 0.1 * noise1(x / 5, seed + 1));
      for (let y = Math.max(0, rowOf(h)); y < o.height; y++) if (alt(y) <= h) c.set(x, y, role);
    }
  };
  ridge(2_400, SEED + 5, R["ridge-far"]);
  ridge(1_400, SEED + 6, R["ridge-near"]);

  // 5b. The cloud sea at about 5,000 m ("Above the clouds"), behind the
  //     mountain: it shows beside the slopes, never across them.
  {
    const topRow = rowOf(5_250);
    const baseRow = rowOf(4_650);
    if (baseRow >= -10 && topRow <= o.height + 10) {
      const rnd = seeded(SEED + 8);
      const bumps: Bump[] = [];
      for (let x = -6; x < o.width + 6; ) {
        const r = 4 + rnd() * 8;
        bumps.push({ x, y: topRow + r * 0.7 + rnd() * 5, r });
        x += r * (0.8 + rnd() * 0.6);
      }
      bumps.sort((a, b) => a.y - b.y);
      drawCloud(c, 0, 0, bumps, baseRow, cloudShades(false, dark), SEED + 80);
    }
  }

  // 6. The mountain: a broad cone, lit on the left, shaded on the right;
  //    pines up to the treeline, rock, then snow from the snowline, up to
  //    its flat top at the Summit with a crater's dip in the middle.
  const apex = SUMMIT_M;
  // Climb's wide Fuji (its flat top a third of the window): the crater and the face's details scale with it.
  const wide = (o.view ?? "world") === "world";
  const dip = coneHalfWidth(apex - 1, o.width, o.you, o.view) * 0.5;
  for (let y = 0; y < o.height; y++) {
    const a = alt(y);
    const span = mountainSpan(a, o.width, o.you, o.view);
    if (!span) continue;
    const ridgeX = ridgeAt(a, o.width, o.you, o.view);
    // The crater: on the strip a bowl two rows deep, about 7 px across, a
    // shaded lip either side; on Climb a bowl about half its flat top across, three rows deep.
    const rim = mountainSpan(a + o.metresPerRow, o.width, o.you, o.view) === null ? 1 : mountainSpan(a + 2 * o.metresPerRow, o.width, o.you, o.view) === null ? 2 : mountainSpan(a + 3 * o.metresPerRow, o.width, o.you, o.view) === null ? 3 : 0;
    const half = coneHalfWidth(a, o.width, o.you, o.view);
    const kRow = Math.round(a / o.metresPerRow);
    let ripple = -1;
    for (let x = Math.max(0, span.left); x <= Math.min(o.width - 1, span.right); x++) {
      if (x === ripple) continue;
      const fromCentre = Math.abs(x + 0.5 - o.width * CONE_CENTRE);
      if (wide && rim) {
        // Climb's broad top: a bowl about half the flat top across, three rows deep, its floor uneven.
        const floor = (noise1(x / 3, 68) - 0.5) * 2;
        // The rim's outer corners rounded off: shoulders, not a table's edge.
        if (rim === 1 && (x === span.left || x === span.right)) continue;
        if (rim === 1 && fromCentre < dip) continue;
        if (rim === 1 && fromCentre < dip + 1.5) {
          c.set(x, y, R["snow-shade"]);
          continue;
        }
        if (rim === 2 && fromCentre < dip - 3 + floor) continue;
        if (rim === 2 && fromCentre < dip) {
          c.set(x, y, R["snow-gully"]);
          continue;
        }
        if (rim === 3 && fromCentre < dip - 3 + floor) {
          c.set(x, y, R["snow-gully"]);
          continue;
        }
      } else if (rim && rim < 3 && a > apex - 3 * o.metresPerRow) {
        // The top row: open sky in the dip, a shaded lip either side; the row below: the bowl in shadow.
        if (rim === 1 && fromCentre < 3.5) continue;
        if (fromCentre < 3.5) {
          c.set(x, y, R["snow-gully"]);
          continue;
        }
        if (fromCentre < 4.5) {
          c.set(x, y, R["snow-shade"]);
          continue;
        }
      }
      const lit = x + 0.5 < ridgeX;
      // A gentle, wide wave (sharp teeth here read as a row of little peaks).
      const snowline = 3_000 + (noise1(x / 16, 41) - 0.5) * 260 + (noise1(x / 5, 42) - 0.5) * 60;
      const treeline = 1_500 + (noise1(x / 5, 43) - 0.5) * 300;
      const ground = groundAt(a, snowline, treeline);
      let role: number;
      // The snowcap's lower edge is ragged: tapering fingers of rock reach up
      // into the snow from the snowline, fanning with the slope (a few
      // hundred metres to about 1,400 m long on the strip; short teeth on
      // Climb), so the white reads as a cap.
      const share = (x + 0.5 - o.width * CONE_CENTRE) / Math.max(1, wide ? Math.min(half, o.width * FACE_MAX) : half);
      const q = share * (wide ? 14 : 14) + (noise1(a / 700, 64) - 0.5) * 0.6;
      const rib = Math.floor(q);
      const reach = wide ? 50 + hash01(SEED + 64, rib) * 110 : 250 + hash01(SEED + 64, rib) * 1_150;
      const above = a - snowline;
      // On Climb: short teeth (2–6 rows) of varied height, side by side, each
      // a triangle centred in its slot (tall thin fingers read as a far range;
      // blunt ones as a skyline).
      const ribs = wide
        ? ground === "snow" && hash01(SEED + 63, rib) < 0.85 && above < reach && Math.abs(q - rib - 0.5) < 0.42 * (1 - above / reach)
        : ground === "snow" && hash01(SEED + 63, rib) < 0.4 && above < reach && q - rib < 0.5 * (1 - above / reach);
      if (ground === "snow" && !ribs) role = lit ? (dark || x > span.left ? R.snow : R["snow-shade"]) : R["snow-shade"];
      else if (ground === "rock" || ribs) {
        role = lit ? R.rock : R["rock-shade"];
        // A sparse speckle, so a rock face isn't a flat slab.
        if (hash01(SEED + 62 + kRow, x) < 0.04) role = lit ? R["rock-shade"] : R.rock;
      }
      else if (ground === "pine") role = lit ? R.pine : R["pine-dark"];
      else role = R.valley;
      // Wind ripples on the lit snow in light: now and then a 2 px dash of shade, so it reads as snow, not a blank card.
      if (!dark && role === R.snow && x > span.left + 1 && x < ridgeX - 2 && hash01(SEED + 66 + kRow, x) < (wide ? 0.0025 : 0.006)) {
        role = R["snow-shade"];
        c.set(x + 1, y, R["snow-shade"]);
        ripple = x + 1;
      }
      // In dark the rock and forest flanks are near the night sky's tone: a 1 px moonlit edge keeps the silhouette.
      if (dark && ground !== "snow" && (x === span.left || x === span.right)) role = R["snow-shade"];
      c.set(x, y, role);
    }
  }
  // Gullies: thin streaks fanning down the snowcap from the crater, each at a
  // fixed share of the cone's half-width, so they lean out with the slope
  // ("/" on the lit face, "\\" on the shaded one). Shade on the lit face,
  // rock on the shaded one. Only in the snow.
  // Streak pixels drawn in each row (so no two run side by side), and each streak's last x (so a diagonal is continuous).
  const streaked = new Map<number, number[]>();
  const lastX = new Map<string, number>();
  const streakAt = (id: string, x: number, y: number, wideEdge: boolean) => {
    const row = streaked.get(y) ?? [];
    if (wide && row.some((other) => Math.abs(other - x) < STREAK_GAP)) return;
    // Never down the centre column on Climb: a streak there runs straight down and, under the flat top, reads as a road's centre line.
    if (wide && Math.abs(x + 0.5 - o.width * CONE_CENTRE) < STREAK_CENTRE_PX) return;
    const prev = lastX.get(id);
    lastX.set(id, x);
    const mark = (px: number) => {
      const here = c.get(px, y);
      if (here === R.snow) c.set(px, y, R["snow-shade"]);
      else if (here === R["snow-shade"]) c.set(px, y, R["snow-gully"]);
      else return;
      row.push(px);
    };
    mark(x);
    // A streak that moved more than a pixel since the row above fills the gap, so a diagonal never reads as stitching.
    if (wide && prev !== undefined && Math.abs(x - prev) > 1 && Math.abs(x - prev) < 6) for (let px = Math.min(x, prev) + 1; px < Math.max(x, prev); px++) mark(px);
    // The ones from the rim are 2 px wide for their first ~150 m (only where they're steep enough not to read as a double line).
    else if (wideEdge) mark(x + (x >= o.width * CONE_CENTRE ? 1 : -1));
    streaked.set(y, row);
  };
  {
    const rnd = seeded(SEED + 60);
    // On Climb, off-centre (two framing a lit band under the flat top read as a road), the inner two short.
    const shares = (wide ? [-0.58, -0.36, 0.12, 0.6] : [-0.66, -0.24, 0.27, 0.64]).map((f) => f + (rnd() - 0.5) * 0.08);
    // On each face one long streak and one short one.
    const runs = wide ? [1, 0.225, 0.25, 1] : [1, 0.45, 0.5, 1];
    for (let y = 0; y < o.height; y++) {
      const a = alt(y);
      const top = SUMMIT_M;
      if (a >= top || a < 3_300) continue;
      const half = coneHalfWidth(a, o.width, o.you, o.view);
      shares.forEach((f, i) => {
        // Staggered: two start at the crater's rim, two a little below; each
        // runs a long way down, unbroken, breaking into dashes only at its tail.
        const startBelow = [0, 320, 120, 450][i];
        const length = (1_800 + Math.abs(f) * 2_400) * runs[i];
        const fromTop = top - startBelow - a;
        if (fromTop < 0 || fromTop > length) return;
        const k = Math.round(a / 25) + i * 7;
        // The last 40%: scattered pixels, sparser further down (gaps of 2, 3, 5, 8… rows, jittered).
        const tail = (fromTop - length * 0.6) / (length * 0.4);
        if (tail > 0 && hash01(SEED + 67 + i, k) < tail) return;
        const x = Math.round(o.width * CONE_CENTRE + f * half);
        streakAt(`rim ${i}`, x, y, startBelow < 150 && fromTop < 150);
      });
    }
  }
  // On Climb's wide slope, more streaks branch in lower down. Each level of
  // streaks has slots at shares (j + ½ ± jitter)·½^level of the half-width
  // (so they run up toward the summit), STREAK_KEEP of them filled, and
  // lives while its spacing on screen is born…4·born (STREAK_PX): two
  // interleaved levels are always in view, so a window anywhere on the snow
  // shows a few. Each thins out into scattered pixels as it's born and as it
  // dies. Only in the snow (in rock, long seams read as planks).
  if (wide) {
    const centre = o.width * CONE_CENTRE;
    const born = Math.min(STREAK_PX, o.width / 6);
    for (let y = 0; y < o.height; y++) {
      const a = alt(y);
      if (a >= SUMMIT_M - 400 || a < 2_700) continue;
      const half = coneHalfWidth(a, o.width, o.you, o.view);
      for (let level = 1; level < 14; level++) {
        const step = Math.pow(0.5, level);
        const spacing = half * step;
        if (spacing >= 4 * born) continue;
        if (spacing < born) break;
        // 0 at its birth, 1 at its end.
        const life = Math.log2(spacing / born) / 2;
        const k = Math.round(a / 25);
        for (let j = Math.floor(-centre / spacing) - 1; j <= Math.ceil((o.width - centre) / spacing); j++) {
          if (hash01(SEED + 94 + level, j + 8_192) >= STREAK_KEEP) continue;
          const r = hash01(SEED + 90 + level, j + 8_192);
          const thin = life < 0.08 ? 1 - life / 0.08 : life > 0.8 ? (life - 0.8) / 0.2 : 0;
          if (thin > 0 && hash01(SEED + 92 + level, k * 31 + j) < thin) continue;
          // Shifted by a share of a slot that differs per level: no level has a pair mirrored about the centre.
          const x = Math.round(centre + (j + 0.5 + 0.2 + 0.15 * (level % 3) + (r - 0.5) * 0.4) * spacing + (noise1(a / 300, 93 + j) - 0.5) * 2);
          streakAt(`${level} ${j}`, x, y, false);
        }
      }
    }
  }

  // The valley floor: flat meadow with a few tufts, and a lake.
  for (let y = 0; y < o.height; y++) {
    const a = alt(y);
    if (a > 400) continue;
    for (let x = 0; x < o.width; x++) if (a < 180 + noise1(x / 8, 51) * 160) c.set(x, y, R.valley);
  }
  {
    const rnd = seeded(SEED + 52);
    for (let i = 0; i < o.width / 4; i++) {
      const x = Math.floor(rnd() * o.width);
      const y = rowOf(rnd() * 300);
      if (c.get(x, y) === R.valley && c.get(x + 1, y) === R.valley) {
        c.set(x, y, R["valley-dark"]);
        c.set(x + 1, y, R["valley-dark"]);
      }
    }
  }
  const lakeY = rowOf(120);
  const lakeX = Math.round(o.width * 0.26);
  for (let y = lakeY - 3; y <= lakeY + 3; y++) {
    for (let x = lakeX - 12; x <= lakeX + 12; x++) {
      const dx = (x - lakeX) / 12;
      const dy = (y - lakeY) / 3;
      if (dx * dx + dy * dy <= 1) c.set(x, y, y === lakeY - 1 && x % 5 < 2 ? R["lake-light"] : R.lake);
    }
  }

  // Pine trees: little lit-and-shaded triangles in staggered rows along the
  // forest, from the valley sides up to the treeline.
  for (let row = 0; row < o.height; row++) {
    const a = alt(row);
    // Keyed by altitude (not the row), so the forest never moves as the world grows.
    const k = Math.round(a / o.metresPerRow);
    if (a < 250 || a > 1_650 || k % 2 !== 0) continue;
    const span = mountainSpan(a, o.width, o.you, o.view);
    for (let x = k % 4 === 0 ? 1 : 3; x < o.width; x += 4) {
      const px = x + Math.floor(hash01(SEED + 70 + k, x) * 3) - 1;
      const onMountain = span !== null && px >= span.left + 1 && px <= span.right - 1;
      const treeline = 1_500 + (noise1(px / 5, 43) - 0.5) * 300;
      if (!(onMountain && a < treeline) && !(a < 420 && hash01(SEED + 71, px) < 0.35)) continue;
      // A triangle (1, 3, 5 wide…) on a one-pixel trunk; on the shaded face, in the shade's darker pair.
      const shaded = onMountain && px + 0.5 >= ridgeAt(a, o.width, o.you, o.view);
      const h = 4 + Math.floor(hash01(SEED + 72 + k, px) * 3);
      for (let j = 0; j < h; j++) {
        const trunk = j === h - 1;
        const half = trunk ? 0 : Math.min(2, j);
        for (let dx = -half; dx <= half; dx++) c.set(px + dx, row - h + 1 + j, shaded ? (trunk || dx > 0 ? R["pine-shade"] : R["pine-dark"]) : trunk || dx > 0 ? R["pine-dark"] : R.pine);
      }
    }
  }

  // 8. The stratosphere's own touch: wisps of cirrus, two shades paler than
  //    the sky they're in, three tapered rows, 2–3 every 500 m (until 18 km).
  const moonUp = o.moon !== null && moonShows(o.theme, alt(o.moon.y));
  const paled = new Set<number>();
  for (let k = Math.max(25, Math.floor(lowest / 500) - 1); k * 500 <= Math.min(highest, CIRRUS_END_M - 500); k++) {
    const rnd = seeded(SEED + 4_000 + k);
    const n = rnd() < 0.5 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const y = rowOf(k * 500 + rnd() * 500);
      const x0 = Math.floor(rnd() * o.width);
      const length = 12 + Math.floor(rnd() * 12);
      // Not across the moon and its glow.
      if (o.moon && moonUp && Math.abs(y - o.moon.y) < 11 && x0 < o.moon.x + 10 && x0 + length > o.moon.x - 10) continue;
      for (const [dy, from, to] of [[0, 0, length], [-1, 3, length - 5], [1, 6, length - 2]] as const) {
        for (let x = x0 + from; x < x0 + to; x++) {
          const here = c.get(x % o.width, y + dy);
          const key = (y + dy) * o.width + (x % o.width);
          if (isSky(here) && !paled.has(key)) {
            c.set(x % o.width, y + dy, paler(paler(here)));
            paled.add(key);
          }
        }
      }
    }
  }
  return c;
}

function cloudShades(far: boolean, dark: boolean, rimmed = false): CloudShades {
  return far
    ? { base: R["cloud-far"], light: R["cloud-far"], shade: R["cloud-far-shade"], deep: R["cloud-far-shade"], plain: true }
    : { base: R.cloud, light: R["cloud-light"], shade: R["cloud-shade"], deep: R["cloud-deep"], rim: dark && rimmed ? R.rim : undefined };
}

/** A cloud's coral rim with fewer pixels than this left showing (other clouds over it, the sky's edge) is put back: a fragment reads as a stray pixel, not light (Feature 10g). */
export const RIM_MIN_PX = 5;

/**
 * Put back the pieces of each cloud's rim that are left as fragments: its
 * pixels still showing rim, in pieces (touching, diagonals included: what
 * the eye sees as one line), and any piece under RIM_MIN_PX goes back to
 * the cloud under it. Whole arcs stay.
 */
function tidyRims(c: Canvas, rims: readonly number[][]) {
  for (const cloud of rims) {
    const left: number[] = [];
    for (let i = 0; i < cloud.length; i += 3) if (c.get(cloud[i], cloud[i + 1]) === R.rim) left.push(i);
    const piece = left.map((_, k) => k);
    const find = (k: number): number => (piece[k] === k ? k : (piece[k] = find(piece[k])));
    for (let a = 0; a < left.length; a++) {
      for (let b = a + 1; b < left.length; b++) {
        const near = Math.abs(cloud[left[a]] - cloud[left[b]]) <= 1 && Math.abs(cloud[left[a] + 1] - cloud[left[b] + 1]) <= 1;
        if (near) piece[find(a)] = find(b);
      }
    }
    const size = new Map<number, number>();
    left.forEach((_, k) => size.set(find(k), (size.get(find(k)) ?? 0) + 1));
    left.forEach((i, k) => {
      if ((size.get(find(k)) ?? 0) < RIM_MIN_PX) c.set(cloud[i], cloud[i + 1], cloud[i + 2]);
    });
  }
}

/** Moonlight's own moon on Climb (Feature 10g): its zone (22,500 m) has a moon whoever scrolls there. */
export const MOONLIGHT_MOON_M = 23_600;
/** …left out when your own moon shows this close to it, so two moons are never in one window (at most 900 px, 7,500 m). */
const MOONLIGHT_APART_M = 8_000;

/** Where Moonlight's moon is drawn in this view of the world (right of centre, clear of the zone chips at the left), or null. Climb only. */
export function moonlightMoon(o: Pick<WorldOptions, "width" | "height" | "metresPerRow" | "bottom" | "theme" | "moon" | "view">): { x: number; y: number } | null {
  if ((o.view ?? "world") !== "world") return null;
  const { alt, rowOf } = rows(o);
  const y = rowOf(MOONLIGHT_MOON_M);
  if (y < -10 || y > o.height + 10) return null;
  if (o.moon && moonShows(o.theme, alt(o.moon.y)) && Math.abs(alt(o.moon.y) - MOONLIGHT_MOON_M) < MOONLIGHT_APART_M) return null;
  return { x: Math.round(o.width * 0.62), y };
}

/**
 * The moving layer, over a copy of the base: the drifting clouds, then you.
 * `rims`: a caller drawing more clouds after this (the strip) collects the
 * coral rims and tidies them itself; otherwise they're tidied here.
 */
export function drawWorldMoving(c: Canvas, o: WorldOptions, rims?: number[][]) {
  const { alt, rowOf } = rows(o);
  const dark = o.theme === "dark";
  // Clouds seeded per 500 m band (fixed in metres), two tiers: small far
  // ones tinted toward the sky, nearer white ones (some medium) in front.
  const ownX = o.altitude !== null ? balloonX(o.altitude, o.width, o.you, o.balloonMinX, o.view) : o.clearOf?.x;
  const ownRims = rims ?? [];
  const around: { clear: Box[]; balloon?: number; rims?: number[][] } = {
    balloon: ownX,
    rims: o.keepRimFragments ? undefined : ownRims,
    // Only its own balloon (the strip's far layer has none: its clouds pass behind the strip's balloon, as before).
    clear: keepClear(
      o,
      rowOf,
      o.altitude !== null ? { x: balloonX(o.altitude, o.width, o.you, o.balloonMinX, o.view), y: balloonRow(rowOf(o.altitude), o.height), inBand: inCloudBand(o.altitude) } : null,
    ),
  };
  // The moon first, with its glow; drifting clouds keep clear of it (one passing
  // in front would leave a stray gold speck, not a moon).
  const moonUp = o.moon !== null && moonShows(o.theme, alt(o.moon.y));
  drawMoon(c, o, moonUp);
  if (o.moon && moonUp) around.clear.push({ x0: o.moon.x - 8, x1: o.moon.x + 9, y0: o.moon.y - 8, y1: o.moon.y + 9 });
  // Moonlight's moon (no cloud reaches that high).
  const moonlight = moonlightMoon(o);
  if (moonlight) drawMoon(c, { theme: o.theme, moon: moonlight }, true, MOONLIGHT_MOON_R);
  for (let k = Math.max(1, Math.floor(alt(o.height - 1) / 500) - 1); k * 500 <= Math.min(alt(0) + 500, CLOUDS_END_M - 500); k++) {
    const band = inCloudBand(k * 500);
    drawDriftingClouds(c, o, rowOf, SEED + 3_000 + k, k * 500, (k + 1) * 500, band ? 3 : 2, "far", dark, 0.25, around);
    const near = band ? 3 : 1 + (hash01(SEED + 1, k) < 0.5 ? 1 : 0);
    drawDriftingClouds(c, o, rowOf, SEED + 5_000 + k, k * 500, (k + 1) * 500, near, "near", dark, band ? 0.5 : 0.25, around);
  }
  // Thin high clouds in the stratosphere: long low streaks in quiet tones,
  // now and then, spread across the width; up to HIGH_CLOUDS_END_M. On the
  // strip (no balloon of its own) they keep clear of the strip's balloon.
  const highClear = o.altitude === null && o.clearOf ? keepClear(o, rowOf, { ...o.clearOf, inBand: false }) : around.clear;
  for (let k = Math.max(CLOUDS_END_M / 500, Math.floor(alt(o.height - 1) / 500) - 1); k * 500 <= Math.min(alt(0) + 500, HIGH_CLOUDS_END_M - 500); k++) {
    if (hash01(SEED + 2, k) >= 0.6) continue;
    const rnd = seeded(SEED + 6_000 + k);
    const length = 14 + Math.floor(rnd() * 14);
    const y = rowOf(k * 500 + 100 + rnd() * 300);
    // Golden-ratio spacing by band, so a still frame never stacks them in one column.
    const x0 = (((k * 0.618) % 1) * 0.8 + rnd() * 0.2) * (c.width + length);
    const speed = 0.3 + rnd() * 0.3;
    const shift = o.time > 0 && o.driftMs > 0 ? Math.floor((o.time * speed) / o.driftMs) : 0;
    const x = Math.round(((x0 + shift) % (c.width + length)) - length);
    if (highClear.some((b) => x < b.x1 && x + length > b.x0 && y - 1 < b.y1 && y + 2 > b.y0)) continue;
    for (const [dy, from, to, r] of [[-1, 4, length - 6, R["cloud-high"]], [0, 1, length - 1, R["cloud-high"]], [1, 3, length - 2, R["cloud-high-shade"]]] as const) {
      for (let px = x + from; px < x + to; px++) if (isSky(c.get(px, y + dy))) c.set(px, y + dy, r);
    }
  }
  if (!rims) tidyRims(c, ownRims);
  if (o.altitude !== null) {
    const bx = balloonX(o.altitude, o.width, o.you, o.balloonMinX, o.view);
    const by = balloonRow(rowOf(o.altitude), o.height);
    if ((o.view ?? "world") === "world") unstreak(c, bx, by);
    drawBalloon(c, bx, by, o.theme, bob(o));
  }
}

/** Around Climb's balloon (basket at x, y), lift any streak back into the snow: a line running to it reads as a string. */
function unstreak(c: Canvas, x: number, y: number) {
  for (let py = y - 16; py <= y + 4; py++) {
    for (let px = x - 6; px <= x + 6; px++) {
      const here = c.get(px, py);
      const left = c.get(px - 1, py);
      const right = c.get(px + 1, py);
      if (here === R["snow-shade"] && left === R.snow && right === R.snow) c.set(px, py, R.snow);
      else if (here === R["snow-gully"] && left === R["snow-shade"] && right === R["snow-shade"]) c.set(px, py, R["snow-shade"]);
    }
  }
}

/** The band of cloud above the Summit that you rise through ("Into the clouds"), in metres. */
export const CLOUD_BAND = [10_000, 11_500] as const;
/** No clouds above this: the stratosphere, then space. */
export const CLOUDS_END_M = 12_000;
/** Thin high clouds go on to here (the stratosphere); none above, in space. */
export const HIGH_CLOUDS_END_M = 16_500;

/** In the band of cloud above the Summit? */
function inCloudBand(altitude: number): boolean {
  return altitude >= CLOUD_BAND[0] && altitude < CLOUD_BAND[1];
}

/** The balloon's basket row, kept off the very bottom (at Base camp it rests on the grass, ring and all). */
function balloonRow(row: number, height: number): number {
  return Math.min(row, height - 3);
}

/** The balloon's gentle bob: up a pixel and back, slowly; none when still (time 0, as with Reduce Motion). */
function bob(o: { time: number; driftMs: number }): number {
  return o.time > 0 && o.driftMs > 0 ? Math.floor(o.time / (o.driftMs * 3)) % 2 : 0;
}

/**
 * The moon: gold, shaded at the lower right. In dark, always (in two stepped
 * rings of moonlit navy); in light, once the sky is deep enough (moonShows).
 * Drawn over the clouds, so it's always seen.
 */
function drawMoon(c: Canvas, o: Pick<WorldOptions, "theme" | "moon">, shows: boolean, r = 3.6) {
  if (o.moon && shows) {
    const glow = o.theme === "dark";
    const { x: mx, y: my } = o.moon;
    const reach = Math.ceil(r + 6);
    for (let y = my - reach; y <= my + reach; y++) {
      for (let x = mx - reach; x <= mx + reach; x++) {
        if (inCircle(x, y, mx + 0.5, my + 0.5, r)) {
          // Behind anything that isn't sky (a bank, the mountain): only its open part shows.
          const back = c.get(x, y);
          if (isSky(back) || back === R.star || back === R["star-dim"] || back === R.cirrus) c.set(x, y, inCircle(x, y, mx - 0.6, my - 0.6, r) ? R.moon : R["moon-shade"]);
          continue;
        }
        // The glow lifts the sky, and cloud around it (moonlight through a gap); never a star or the mountain.
        const here = c.get(x, y);
        if (!glow || !(isSky(here) || GLOWS_ON.has(here))) continue;
        if (inCircle(x, y, mx + 0.5, my + 0.5, r + 1.9)) c.set(x, y, R["moon-glow"]);
        else if (inCircle(x, y, mx + 0.5, my + 0.5, r + 3.9)) c.set(x, y, R["moon-glow-2"]);
      }
    }
    // A large moon gets craters on its lit face, so it reads as a moon, not a
    // sun, and no star touching its rim (it reads as a nick): those become
    // glow in dark, the sky of its height in light.
    if (r > 4) {
      for (const [dx, dy] of [[-2, -1], [1, 1], [2, 1]]) if (c.get(mx + dx, my + dy) === R.moon) c.set(mx + dx, my + dy, R["moon-shade"]);
      const sky = skyBand(MOONLIGHT_MOON_M);
      for (let y = my - reach; y <= my + reach; y++) {
        for (let x = mx - reach; x <= mx + reach; x++) {
          const here = c.get(x, y);
          if ((here === R.star || here === R["star-dim"]) && inCircle(x, y, mx + 0.5, my + 0.5, r + 2.5)) c.set(x, y, glow ? R["moon-glow"] : sky);
        }
      }
    }
  }
}

/** Moonlight's moon is larger than the one you pass: its zone is named for it. */
export const MOONLIGHT_MOON_R = 5.2;

/** A satellite: a small body between two gold panels, centred on x, y. */
function satellite(c: Canvas, cx: number, cy: number) {
  for (let dx = -4; dx <= 4; dx++) {
    if (Math.abs(dx) <= 1) {
      c.set(cx + dx, cy, R.satellite);
      c.set(cx + dx, cy + 1, R.satellite);
    } else {
      c.set(cx + dx, cy, R["moon-shade"]);
      c.set(cx + dx, cy + 1, Math.abs(dx) === 2 ? R.satellite : R["moon-shade"]);
    }
  }
  c.set(cx, cy - 1, R.satellite);
}

/** What a drifting cloud may be drawn over: the sky and what's in it (never the mountain, the valley, the lake or the trees). */
const CLOUDS_OVER = new Set<number>([
  ...ROLES.filter((r) => r.startsWith("sky-") || r.startsWith("space-")).map((r) => R[r]),
  ...(["star", "star-dim", "moon-glow", "moon-glow-2", "bank-far", "bank-far-light", "bank-near", "bank-near-light", "bank-edge", "bank-shade", "ridge-far", "ridge-near"] as const).map((r) => R[r]),
  ...(["cloud", "cloud-light", "cloud-shade", "cloud-deep", "cloud-far", "cloud-far-shade", "cirrus", "cloud-high", "cloud-high-shade", "rim"] as const).map((r) => R[r]),
]);

/** Cloud the dark moon's glow lights up (moonlight through a gap). */
const GLOWS_ON = new Set<number>([R.cloud, R["cloud-light"], R["cloud-shade"], R["cloud-deep"]]);

/** In light, the moon shows once the sky at its height is this deep (about 14,750 m up). */
export const LIGHT_MOON_FROM_M = SPACE_BANDS[2];

/** Does the moon show at this height? Always in dark; in light once the sky is deep enough (the stratosphere and space). */
export function moonShows(theme: Theme, moonAltitude: number): boolean {
  return theme === "dark" || moonAltitude >= LIGHT_MOON_FROM_M;
}

/** A box of logical pixels: x0 ≤ x < x1, y0 ≤ y < y1. */
type Box = { x0: number; x1: number; y0: number; y1: number };

/** Where clouds never drift: around your balloon (basket at x, y), and around the peak. */
function keepClear(o: { width: number; you: number; view?: View }, rowOf: (a: number) => number, balloon: { x: number; y: number; inBand: boolean } | null): Box[] {
  const boxes: Box[] = [];
  // In the cloud band, clouds may brush the balloon (you're in cloud): only its envelope stays clear.
  if (balloon) boxes.push(balloon.inBand ? { x0: balloon.x - 4, x1: balloon.x + 5, y0: balloon.y - 13, y1: balloon.y - 4 } : { x0: balloon.x - 7, x1: balloon.x + 7, y0: balloon.y - 16, y1: balloon.y + 3 });
  {
    // On Climb the slope 500 m down is most of the window (and past both edges a little lower): size the box from just under its broad top instead.
    const half = coneHalfWidth(SUMMIT_M - ((o.view ?? "world") === "world" ? 100 : 500), o.width, o.you, o.view) + 3;
    boxes.push({ x0: o.width * CONE_CENTRE - half, x1: o.width * CONE_CENTRE + half, y0: rowOf(SUMMIT_M + 350), y1: rowOf(SUMMIT_M - 500) });
  }
  return boxes;
}

/** Scattered clouds between two altitudes; drifting sideways with time, wrapping. */
function drawDriftingClouds(
  c: Canvas,
  o: Pick<WorldOptions, "time" | "driftMs">,
  rowOf: (a: number) => number,
  seed: number,
  from: number,
  to: number,
  count: number,
  tier: "far" | "near",
  dark: boolean,
  mediumShare = 0.25,
  /** Keep clear of these boxes (the balloon, the peak in view), and no coral rim within a few px of the balloon's x. */
  around?: { clear: readonly Box[]; balloon?: number; rims?: number[][] },
) {
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const medium = tier === "near" && rnd() < mediumShare;
    const set = medium ? MEDIUM_CLOUDS : SMALL_CLOUDS;
    const shape = set[Math.floor(rnd() * set.length)];
    const a = from + rnd() * (to - from);
    const x0 = rnd() * (c.width + shape.width);
    // Nearer clouds drift faster: 1 px per driftMs, ×0.6–1.4; far ones half that.
    const speed = (0.6 + rnd() * 0.8) * (tier === "far" ? 0.5 : 1);
    const shift = o.time > 0 && o.driftMs > 0 ? Math.floor((o.time * speed) / o.driftMs) : 0;
    const span = c.width + shape.width;
    const x = Math.round(((x0 + shift) % span) - shape.width);
    const y = rowOf(a) - shape.base;
    if (y > c.height || y + shape.base < 0) continue;
    // Far clouds are drawn at half size.
    const bumps = tier === "far" ? shape.bumps.map((b) => ({ x: b.x / 2, y: b.y / 2, r: b.r / 2 + 0.4 })) : shape.bumps;
    const base = tier === "far" ? Math.ceil(shape.base / 2) : shape.base;
    const w = tier === "far" ? Math.ceil(shape.width / 2) : shape.width;
    const top = y + (shape.base - base);
    // Never over the balloon or the peak in view.
    if (around?.clear.some((b) => x < b.x1 && x + w > b.x0 && top < b.y1 && top + base > b.y0)) continue;
    // The coral rim: on medium clouds wholly in frame, dark only.
    const inFrame = x >= 0 && x + w <= c.width && (around?.balloon === undefined || x > around.balloon + 9 || x + w < around.balloon - 9);
    // Behind the mountain: drawn only over the sky (and what's in it).
    const behind = {
      get: (px: number, py: number) => c.get(px, py),
      set: (px: number, py: number, r: number) => {
        if (CLOUDS_OVER.has(c.get(px, py))) c.set(px, py, r);
      },
    };
    const rimmed = medium && inFrame;
    const rims: number[] | undefined = rimmed && around?.rims ? [] : undefined;
    drawCloud(behind, x, top, bumps, base, cloudShades(tier === "far", dark, rimmed), undefined, rims);
    if (rims?.length) around?.rims?.push(rims);
  }
}

/**
 * Your marker: a small hot-air balloon in Ascend's accent (an accent-lip
 * stripe and shade, a basket), centred on `x` with its basket's bottom on
 * `y`. A one-pixel ring takes whichever of two colours (light or dark)
 * stands out more from what's under it, so it reads 3:1 on every sky,
 * cloud, slope and bit of space (lib/palette.test.ts).
 */
export function drawBalloon(c: Canvas, x: number, y: number, theme: Theme, lift = 0) {
  const palette = SCENE_PALETTE[theme];
  // Rows from the top; columns -3…3. h: highlight, e: envelope, s: shade, r: rope, b: basket, o: open (backdrop, no ring).
  const art = [
    "  eee  ",
    " eheee ",
    "eheeees",
    "eheeess",
    "eeeeess",
    "eeeeess",
    " eeess ",
    "  ess  ",
    "  sss  ",
    "  ror  ",
    "  ror  ",
    "  bbb  ",
    "  bbb  ",
  ];
  const roles: Record<string, number> = { h: R["balloon-light"], e: R.marker, s: R["balloon-shade"], r: R.basket, b: R.basket };
  const cells: [number, number, number][] = [];
  const open = new Set<string>();
  const ropes = new Set<string>();
  art.forEach((row, i) =>
    [...row].forEach((ch, j) => {
      const key = `${j - 3},${i - art.length + 1}`;
      if (ch === "o") open.add(key);
      else if (ch !== " ") cells.push([j - 3, i - art.length + 1, roles[ch]]);
      if (ch === "r") ropes.add(key);
    }),
  );
  const shape = new Set(cells.map(([dx, dy]) => `${dx},${dy}`));
  // The ring's pixels, and what's under each (at rest, before the bob, so
  // its colour never flips as the balloon bobs).
  const ring = new Map<string, Role>();
  for (const [dx, dy] of cells) {
    // The ropes go unringed (a ring around two one-pixel ropes reads as a solid stem): the sky shows around them.
    if (ropes.has(`${dx},${dy}`)) continue;
    for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${dx + ex},${dy + ey}`;
      if (shape.has(k) || ring.has(k) || open.has(k) || ropes.has(`${dx + ex},${dy + ey + 1}`) || ropes.has(`${dx + ex},${dy + ey - 1}`)) continue;
      ring.set(k, ROLES[c.get(x + dx + ex, y + dy + ey)]);
    }
  }
  // One colour for the whole ring: whichever stands out more against the
  // worst of what it sits on (a mixed ring looks like a glitch). Specks (a
  // star, a bit of a planet) don't count: one would hide it in all of space.
  const worst = (colour: "marker-ring" | "marker-edge") =>
    Math.min(...[...ring.values()].filter((u) => palette[u] && !SPECKS.has(u)).map((u) => contrast(palette[colour], palette[u])));
  const colour = worst("marker-ring") >= worst("marker-edge") ? R["marker-ring"] : R["marker-edge"];
  // Stars a pixel off the ring would make its edge ragged: they make way for the sky.
  const sky = [...ring.values()].map((u) => R[u]).find(isSky);
  if (sky !== undefined) {
    for (const k of ring.keys()) {
      const [dx, dy] = k.split(",").map(Number);
      for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = c.get(x + dx + ex, y + dy + ey - lift);
        if (v === R.star || v === R["star-dim"]) c.set(x + dx + ex, y + dy + ey - lift, sky);
      }
    }
  }
  for (const k of ring.keys()) {
    const [dx, dy] = k.split(",").map(Number);
    c.set(x + dx, y + dy - lift, colour);
  }
  for (const [dx, dy, role] of cells) c.set(x + dx, y + dy - lift, role);
}

/** Small things the balloon's ring ignores when it picks its colour. */
const SPECKS = new Set<Role>(["star", "star-dim", "planet", "planet-shade", "satellite", "moon-shade", "cirrus"]);

/** A bird's shade: whichever of the two stands out more from what's behind it. */
export function birdFor(palette: Record<string, string>, under: Role): "bird" | "bird-light" {
  const bg = palette[under];
  if (!bg) return "bird";
  return contrast(palette.bird, bg) >= contrast(palette["bird-light"], bg) ? "bird" : "bird-light";
}

/** Birds fly in the strip's near layer up to here, a flock about every BIRD_BAND_M (70% of bands). */
const BIRDS_END_M = 6_000;
const BIRD_BAND_M = 120;

/** The ring colour that stands out more from a backdrop role. */
export function ringFor(palette: Record<string, string>, under: Role): "marker-ring" | "marker-edge" {
  const bg = palette[under];
  if (!bg) return "marker-ring";
  return contrast(palette["marker-ring"], bg) >= contrast(palette["marker-edge"], bg) ? "marker-ring" : "marker-edge";
}

export type CloseOptions = {
  width: number;
  height: number;
  theme: Theme;
  time: number;
  /** Your altitude: two thirds of the way down the strip. */
  altitude: number;
  /**
   * The altitude the mountain is shaped around: on Today, the day's start
   * (before today), so the slope stays still while your balloon climbs it
   * during the day (at most 150 m).
   */
  you: number;
  driftMs: number;
  /** As WorldOptions.balloonMinX. */
  balloonMinX?: number;
  /** As WorldOptions.keepRimFragments. */
  keepRimFragments?: boolean;
  /** The zone celebration (Feature 10h, lib/celebration.ts): the balloon this many rows above its resting row. */
  rise?: number;
  /** … and this many px right of it (the sway). */
  sway?: number;
  /** … and its confetti, relative to the balloon's envelope at rest at `anchor` (never over the balloon). */
  confetti?: readonly Bit[];
  /** The height the confetti's burst is anchored at (the zone's new height), so it doesn't step with the view. Default: altitude. */
  anchor?: number;
  /**
   * Streaks rushing past in the near layer while the view climbs (0–1: how
   * many show, with its speed), so the climb shows where there's no near
   * cloud: short upright streaks, seeded by height (5 m a row, like the
   * near clouds), on the sky only.
   */
  streaks?: number;
  /** Reduce Motion's still sparkles instead (centres, relative to the envelope at rest): small gold crosses. */
  sparkles?: readonly { dx: number; dy: number }[];
};

/** The celebration's streaks: one chance every STREAK_M metres of the near layer, at most STREAK_SHARE of them showing. */
const STREAK_M = 12;
const STREAK_SHARE = 0.55;

/** The balloon's envelope centre, in rows above its basket's bottom row (the confetti's origin). */
export const ENVELOPE_ABOVE = 8;

const NEAR_M = 5;
const FAR_M = 40;
/** Where you stand in the strip, from the top: below the middle, so the balloon is clear of the Altitude chip, with more of the climb above. */
export const YOU_FROM_TOP = 0.66;

/**
 * Today's strip: a close-up around your altitude: near clouds (5 m a row)
 * in front of the world at 40 m a row, so a completion lifts the near
 * clouds past you while the far world barely moves.
 */
export function drawClose(o: CloseOptions): Canvas {
  const c = drawWorldBase(closeFarOptions(o));
  drawCloseMoving(c, o);
  return c;
}

/** Where the strip draws your balloon (its centre, and its basket's bottom row, at rest): for tests that keep labels off it. */
export function closeBalloonAt(o: { width: number; height: number; altitude: number; you: number; balloonMinX?: number }): { x: number; y: number } {
  return { x: balloonX(o.altitude, o.width, o.you, o.balloonMinX, "close"), y: Math.min(o.height - 3, Math.round(o.height - 1 - o.height * (1 - YOU_FROM_TOP)) + closeFrame(o).shift) };
}

/** The strip never shows more than this below the valley floor: near the ground it looks up instead. */
const STRIP_FLOOR_M = -4 * FAR_M;

/** The strip's far view: its bottom (whole rows, so the cached base is reused between small lifts), and how many rows lower you are drawn because of the floor. */
function closeFrame(o: { height: number; altitude: number }): { bottom: number; shift: number } {
  const raw = Math.round((o.altitude - o.height * (1 - YOU_FROM_TOP) * FAR_M) / FAR_M) * FAR_M;
  const bottom = Math.max(raw, STRIP_FLOOR_M);
  return { bottom, shift: Math.round((bottom - raw) / FAR_M) };
}

/** Where Climb's world draws your balloon (as closeBalloonAt). */
export function worldBalloonAt(o: Pick<WorldOptions, "width" | "height" | "metresPerRow" | "bottom" | "you" | "balloonMinX">, altitude: number): { x: number; y: number } {
  return { x: balloonX(altitude, o.width, o.you, o.balloonMinX), y: balloonRow(rows(o).rowOf(altitude), o.height) };
}

/** The strip's far layer (its still base can be cached). The moon sits high on the right (beside the cone, or above it), never on the mountain. */
export function closeFarOptions(o: Omit<CloseOptions, "time" | "driftMs" | "balloonMinX">): BaseOptions {
  return {
    width: o.width,
    height: o.height,
    metresPerRow: FAR_M,
    bottom: closeFrame(o).bottom,
    top: worldTop(o.altitude),
    you: o.you,
    theme: o.theme,
    moon: closeMoon(o),
    view: "close",
  };
}

/** The strip's moon: high up on the right, beside the cone or above it, never on the mountain, inside the strip's rounded corners; on a row clear of cloud if there's one, else behind the cloud (only its open part shows). None while the strip's top is slope nearly edge to edge (below about 1,300 m). */
function closeMoon(o: Omit<CloseOptions, "time" | "driftMs">): { x: number; y: number } | null {
  const bottom = closeFrame(o).bottom;
  let fallback: { x: number; y: number } | null = null;
  for (const y of [7, 6, 8, 5, 9, 10]) {
    const a = bottom + (o.height - 1 - y + 0.5) * FAR_M;
    // In light, decided by the day's start (the shape's height), so it never appears mid-lift.
    if (!moonShows(o.theme, a - (o.altitude - o.you))) return null;
    // Above the top: high on the right; else beside the cone, judged where it's widest under the disc and its glow (the cone is symmetric: the left has no more room).
    const x = a - 9 * FAR_M >= SUMMIT_M ? Math.round(o.width * 0.82) : Math.round(o.width * CONE_CENTRE + coneHalfWidth(Math.min(a - 4 * FAR_M, SUMMIT_M), o.width, o.you, "close") + 11);
    if (x > o.width - 9) continue;
    fallback ??= { x, y };
    if (!cloudyAt(a, x, o.width, 6 * FAR_M)) return { x, y };
  }
  return fallback;
}

/** The strip's moving layer over its far base: the far world's clouds, the near clouds, and you. */
export function drawCloseMoving(c: Canvas, o: CloseOptions) {
  const rims: number[][] = [];
  drawWorldMoving(c, { ...closeFarOptions(o), time: o.time, altitude: null, driftMs: o.driftMs * 2, clearOf: closeBalloonAt(o), keepRimFragments: o.keepRimFragments }, rims);
  const dark = o.theme === "dark";
  // Near the ground you're drawn lower (the far view stops at its floor): the near layer moves with you.
  const bottom = o.altitude - o.height * (1 - YOU_FROM_TOP) * NEAR_M + closeFrame(o).shift * NEAR_M;
  const rowOf = (a: number) => Math.round(o.height - 1 - (a - bottom) / NEAR_M);
  // Near clouds: about one every 200 m (2–3 in view), seeded by altitude so
  // they're always in the same places on the climb; mostly small.
  const band = 200;
  const far = closeFarOptions(o);
  const farRows = rows(far);
  const stripX = balloonX(o.altitude, o.width, o.you, o.balloonMinX, "close");
  const around = {
    // The peak is in the far world: its box in the far world's rows.
    clear: keepClear({ ...o, view: "close" }, farRows.rowOf, { x: stripX, y: rowOf(o.altitude), inBand: inCloudBand(o.altitude) }),
    balloon: stripX,
    rims: o.keepRimFragments ? undefined : rims,
  };
  if (far.moon && moonShows(o.theme, farRows.alt(far.moon.y))) around.clear.push({ x0: far.moon.x - 8, x1: far.moon.x + 9, y0: far.moon.y - 8, y1: far.moon.y + 9 });
  for (let k = Math.floor(bottom / band) - 3; k <= Math.ceil((bottom + o.height * NEAR_M) / band) + 1; k++) {
    if (k < 0 || (k + 1) * band > CLOUDS_END_M) continue;
    // In the band above the Summit you pass through more of them.
    const inBand = k * band >= CLOUD_BAND[0] && k * band < CLOUD_BAND[1];
    drawDriftingClouds(c, o, rowOf, 777_000 + k, k * band, (k + 1) * band, inBand ? 2 : 1, "near", dark, inBand ? 0.4 : 0.15, around);
  }
  // Both layers' coral rims, now that every cloud is drawn.
  tidyRims(c, rims);
  // Low down, small flocks of birds in the near layer: in front (they're
  // near, and never read as a cloud layer), so a lift still shows something
  // passing you where the mountain fills the strip. Seeded per BIRD_BAND_M;
  // each bird takes the shade that stands out from what's behind it; wings
  // flap a pixel and the flock drifts with time (still at time 0).
  const palette = SCENE_PALETTE[o.theme];
  let flocks = 0;
  for (let k = Math.max(0, Math.floor(bottom / BIRD_BAND_M) - 1); k * BIRD_BAND_M < Math.min(bottom + o.height * NEAR_M, BIRDS_END_M) && flocks < 1; k++) {
    const rnd = seeded(SEED + 14_000 + k);
    if (rnd() < 0.3) continue;
    const n = 1 + Math.floor(rnd() * 3);
    const span = o.width + 24;
    const x0 = rnd() * span;
    const y0 = rowOf(k * BIRD_BAND_M + rnd() * BIRD_BAND_M);
    const speed = 0.3 + rnd() * 0.3;
    const moving = o.time > 0 && o.driftMs > 0;
    const shift = moving ? Math.floor((o.time * speed) / o.driftMs) : 0;
    let drawn = false;
    for (let i = 0; i < n; i++) {
      const x = Math.round(((x0 + shift + i * 7) % span) - 12);
      const y = y0 + (i % 2) * 2 - (i === 2 ? 1 : 0);
      // Inside the strip's rounded corners, off the balloon, never on the grass.
      if (x < 6 || x > o.width - 7 || y < 3 || y > o.height - 6) continue;
      if (around.clear.some((b) => x + 3 > b.x0 && x - 2 < b.x1 && y + 2 > b.y0 && y < b.y1)) continue;
      // Well clear of the balloon (they'd compete with it).
      if (Math.abs(x - stripX) < 12 && Math.abs(y - (rowOf(o.altitude) - 6)) < 14) continue;
      const behind = ROLES[c.get(x, y + 1)];
      if (behind.startsWith("valley") || behind.startsWith("lake")) continue;
      const up = !moving || (Math.floor(o.time / (o.driftMs * 2)) + i + k) % 2 === 0;
      // A small gull: wings raised; then gliding, wings out.
      const rowsOf = up ? [".x.x.", "x.x.x"] : ["xx.xx", "..x.."];
      const r = birdFor(palette, behind as Role);
      rowsOf.forEach((line, dy) => [...line].forEach((ch, dx) => ch === "x" && c.set(x - 2 + dx, y + dy, R[r])));
      drawn = true;
    }
    if (drawn) flocks++;
  }
  // Above the clouds, the near layer is specks (ice in the stratosphere, dust
  // in space), about one every 25 m, seeded by the looped height, so a lift
  // still shows things passing you.
  for (let k = Math.max(Math.floor(CLOUDS_END_M / 25), Math.floor(bottom / 25) - 1); k * 25 <= bottom + o.height * NEAR_M; k++) {
    const a = k * 25;
    const rnd = seeded(SEED + 12_000 + looped(a) / 25);
    if (rnd() < 0.35) continue;
    const x = Math.floor(rnd() * o.width);
    const y = rowOf(a + rnd() * 25);
    const role = a >= NIGHT_M ? R["star-dim"] : R.cirrus;
    if (isSky(c.get(x, y))) c.set(x, y, role);
    if (rnd() < 0.3 && isSky(c.get(x + 1, y))) c.set(x + 1, y, role);
  }
  // The celebration's streaks, behind you (on the sky only).
  if (o.streaks) {
    const streak = R["cloud-light"];
    const length = 2 + Math.round(2 * o.streaks);
    for (let k = Math.floor(bottom / STREAK_M) - 1; k * STREAK_M <= bottom + o.height * NEAR_M; k++) {
      const rnd = seeded(SEED + 31_000 + looped(k * STREAK_M) / STREAK_M);
      if (rnd() >= o.streaks * STREAK_SHARE) continue;
      const x = 2 + Math.floor(rnd() * (o.width - 4));
      const y = rowOf(k * STREAK_M + rnd() * STREAK_M);
      // Off the balloon and its ring.
      if (Math.abs(x - stripX) < 6) continue;
      // Longer as the view speeds up (2 to 4 rows: a motion blur, unlike a falling bit).
      for (let dy = 0; dy < length; dy++) if (isSky(c.get(x, y + dy))) c.set(x, y + dy, streak);
    }
  }
  // You, just off the slope of the far world (the moon is drawn with the far
  // layer, behind the clouds); in a celebration, risen and swaying (its ring
  // judged where it's drawn, before any confetti is there).
  const rest = Math.min(o.height - 3, rowOf(o.altitude));
  drawBalloon(c, stripX + (o.sway ?? 0), rest - (o.rise ?? 0), o.theme, bob(o));
  // The celebration's confetti and Reduce Motion's sparkles, around the
  // envelope at rest (at the anchor's height: the burst stays where it
  // popped), over the scene but never over the balloon.
  if (o.confetti?.length || o.sparkles?.length) {
    const at = o.anchor === undefined ? { x: stripX, y: rest } : closeBalloonAt({ ...o, altitude: o.anchor });
    const ox = at.x;
    const oy = at.y - ENVELOPE_ABOVE;
    // Each bit keeps its own shape: one that lands on another (or touches it) waits a frame.
    const taken = new Set<number>();
    const put = (x: number, y: number, role: number) => {
      if (!BALLOON_ROLES.has(c.get(x, y))) c.set(x, y, role);
    };
    for (const bit of o.confetti ?? []) {
      const x = ox + bit.dx;
      const y = oy + bit.dy;
      let free = true;
      for (let dy = -1; dy <= bit.h && free; dy++) for (let dx = -1; dx <= bit.w && free; dx++) if (taken.has((y + dy) * o.width + x + dx)) free = false;
      if (!free) continue;
      for (let dy = 0; dy < bit.h; dy++) {
        for (let dx = 0; dx < bit.w; dx++) {
          put(x + dx, y + dy, R[bit.role]);
          taken.add((y + dy) * o.width + x + dx);
        }
      }
    }
    for (const { dx, dy } of o.sparkles ?? []) {
      for (const [ex, ey] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(ox + dx + ex, oy + dy + ey, R.moon);
    }
  }
}

/** The balloon's own pixels (and its ring): confetti never covers them. */
const BALLOON_ROLES = new Set<number>([R.marker, R["balloon-light"], R["balloon-shade"], R.basket, R["marker-ring"], R["marker-edge"]]);

/**
 * Above the Summit by at least this much, Climb's moon clears the mountain
 * and the "Summit" zone chip just above 8,848 m: the chip is about 24 css px
 * tall (about 200 m) at normal text, 48 px (400 m) at 200%; the moon's glow
 * reaches about 175 m below its centre.
 */
const WORLD_MOON_FLOOR_M = SUMMIT_M + 700;

/**
 * Would Climb's moon, centred at this altitude at the left, touch a zone's
 * chip? Each chip sits just above where its zone starts, at the left, up to
 * about 400 m tall at 200% text; one on a ruler mark (every 2,500 m) sits
 * above the mark's chip too and may wrap at 200% text on a narrow phone,
 * reaching about 1,000 m (Feature 10g). The glow reaches about 175 m each way.
 */
export function chipReach(from: number): number {
  return from % 2_500 === 0 ? 925 : 400;
}

function underChip(a: number): boolean {
  for (let i = 0; ; i++) {
    const from = zoneByIndex(i).from;
    if (from > a + 300) return false;
    if (a > from - 300 && a < from + chipReach(from) + 175) return true;
  }
}

/** Dark mode's moon on the Climb screen: at the left, at least 1,600 m above you and above WORLD_MOON_FLOOR_M (below the Summit Climb's window is slope edge to edge), clear of the zones' chips, and of cloud where it can be. */
export function worldMoon(width: number, height: number, metresPerRow: number, altitude: number, top: number): { x: number; y: number } {
  const x = Math.round(width * 0.1);
  const floor = WORLD_MOON_FLOOR_M;
  const start = Math.min(top - 400, Math.max(altitude + 1_600, floor));
  // Clear of banks, the cloud sea and the band above the Summit if there's a
  // spot in the window as it opens; else where it was, behind the cloud.
  const highest = Math.min(top - 400, climbWindowTop(altitude, WORLD_WINDOW_M, top) - 300);
  const lowest = Math.max(floor, altitude + 600);
  const bad = (h: number) => cloudyAt(h, x, width, 200) || underChip(h);
  let a = start;
  while (a <= highest && bad(a)) a += 50;
  // None above: try below (down to the floor, and at least 600 m above you).
  if (a > highest) for (a = start; a >= lowest && bad(a); a -= 50);
  // None in the window: where it was (behind a cloud if need be), but never under a zone's chip.
  if (a < lowest || a > highest) for (a = start; underChip(a) && a < top - 400; a += 50);
  return { x, y: Math.round(height - 1 - a / metresPerRow) };
}

/**
 * Where Climb's window opens (the altitude at its top), for a window
 * `windowMetres` tall: you 63% of the way down, as before; but below about
 * 7,000 m the window's top stays 250 m under the Summit (the peak not yet
 * in view), let up 3.5 m a metre from 6,900 m, so the peak comes into the
 * window from its top. You stay at least 20% below the top; clamped to the
 * world (its floor and top).
 */
export function climbWindowTop(altitude: number, windowMetres: number, top: number): number {
  const held = SUMMIT_M - 250 + 3.5 * Math.max(0, altitude - 6_900);
  const want = Math.max(altitude + 0.2 * windowMetres, Math.min(altitude + 0.63 * windowMetres, held));
  return Math.max(Math.min(windowMetres, top), Math.min(top, want));
}
