// The Climb's pixel-art world (plans/habit-tracker.md, Features 10, 10b, 10c).
//
// The journey (10c): a broad, Fuji-like mountain whose top hides in cloud
// above you until you're close; the Summit at 8,848 m, which you pass; a
// band of cloud; the stratosphere darkening; then space, which repeats every
// LOOP_M from LOOP_FROM_M up, so it looks the same forever. Your marker is a
// small hot-air balloon.
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

import { CM, SUMMIT_M, nextZone } from "../altitude";
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
      if (!drawn.has(key(x, y - 1)) && isSky(c.get(ox + x, oy + y - 1))) c.set(ox + x, oy + y, shades.rim);
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
  /** Your altitude, which shapes the mountain (its cone and its cloud cap). */
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
};

export type BaseOptions = Omit<WorldOptions, "time" | "altitude" | "driftMs" | "balloonMinX">;

const SEED = 20261125;

/**
 * The mountain (Features 10b, 10c): a broad, Fuji-like cone with concave
 * flanks: gentle and wide low down (sweeping past the edges), steeper near
 * its small flat top. Its top is the Summit (8,848 m).
 *
 * While you're far below, the top hides in a cloud cap MIST_ABOVE_M above
 * you (never below CAP_MIN_M), and the cone is drawn as if its top were
 * APEX_ABOVE_CAP_M above that cap (in the cloud), so the slopes run past
 * both edges where you are and are still broad (~75% of the width) where
 * they meet the cloud's drawn underside: never a point (Feature 10d). From APEX_ABOVE_CAP_M +
 * MIST_ABOVE_M below the Summit the cone is the real one. In the last
 * stretch the cap thins (CAP_THINS_FROM_M to CAP_GONE_M below the Summit)
 * and you see the peak; then you pass it and the mountain falls away below.
 */
const CONE_CENTRE = 0.5;
/** Half-width of the flat top, as a share of the width. */
const CONE_TOP = 0.085;
/** Near the top the flanks widen at least this much per metre down (share of the width): about 45° on Climb, so the summit is broad, not a plug. It fades out lower down. */
const CONE_SHOULDER = 0.00034;
const CONE_SHOULDER_M = 400;
/** How fast the flanks widen going down (share of the width, scaled by the curve below). */
const CONE_SPREAD = 0.168;
/** The flanks' curve: the widening grows by e every this many metres down (concave, like Fuji). */
const CONE_FOLD_M = 1_500;
/** The cloud cap's underside: this far above you. */
export const MIST_ABOVE_M = 700;
/** While far below, the (hidden) top of the cone is this far above the cloud cap. */
const APEX_ABOVE_CAP_M = 1_200;
/** The cap's drawn underside sits this far below the mist line (its body overlaps the slope). */
export const CAP_UNDERSIDE_M = 260;
/** The cloud cap is never lower than this: at Base camp you see the mountain rise out of the forest into it. */
const CAP_MIN_M = 2_000;
/** The cap thins from this far below the Summit… */
export const CAP_THINS_FROM_M = 1_100;
/** …and is gone from this far below it: the peak in view. */
export const CAP_GONE_M = 700;

/** The top of the cone drawn for you at `you`: the Summit, or (far below) a hidden top in the cloud above you. */
export function apexFor(you: number): number {
  return Math.min(SUMMIT_M, mistLine(you) + APEX_ABOVE_CAP_M);
}

/** How solid the cloud cap is, for you at `you`: 1 far below the Summit, thinning to 0 near it, 0 above. */
export function capStrength(you: number): number {
  const below = SUMMIT_M - you;
  return Math.max(0, Math.min(1, (below - CAP_GONE_M) / (CAP_THINS_FROM_M - CAP_GONE_M)));
}

/** The mountain's half-width (logical px, smooth) at an altitude, for you at `you`; 0 above its top. */
export function coneHalfWidth(altitude: number, width: number, you: number): number {
  const apex = apexFor(you);
  if (altitude > apex) return 0;
  const d = apex - altitude;
  return width * (CONE_TOP + CONE_SPREAD * (Math.exp(d / CONE_FOLD_M) - 1) + CONE_SHOULDER * d * Math.exp(-d / CONE_SHOULDER_M));
}

/** Where the mountain disappears into the cloud cap (when there is one). */
export function mistLine(you: number): number {
  return Math.max(you + MIST_ABOVE_M, CAP_MIN_M);
}

/** The highest altitude the mountain is drawn to: the cap's underside while it's solid, else the cone's top. */
export function mountainTop(you: number): number {
  return capStrength(you) >= 1 ? Math.min(mistLine(you), apexFor(you)) : apexFor(you);
}

/** The mountain's left and right edges (logical x) at an altitude, or null where there's none (above its top, or in the cap). */
export function mountainSpan(altitude: number, width: number, you: number): { left: number; right: number } | null {
  if (altitude >= mountainTop(you) || altitude > apexFor(you)) return null;
  const half = coneHalfWidth(altitude, width, you);
  const centre = width * CONE_CENTRE;
  // A little roughness on the edges, so the slopes step like rock, not a ruler.
  const roughL = (noise1(altitude / 160, 11) - 0.5) * 3;
  const roughR = (noise1(altitude / 190, 23) - 0.5) * 3;
  return { left: Math.floor(centre - half + roughL), right: Math.ceil(centre + half + roughR) };
}

/** The line between the lit face (left) and the shaded one (right): a little right of the centre, ragged like a real ridge. */
function ridgeAt(altitude: number, width: number, you: number): number {
  return width * CONE_CENTRE + coneHalfWidth(altitude, width, you) * 0.12 + (noise1(altitude / 110, 29) - 0.5) * 4;
}

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
export function balloonX(altitude: number, width: number, you: number, minX = Math.round(width * BALLOON_MIN_X)): number {
  const apex = apexFor(you);
  // The slope two rows below the basket: where it's widest under the balloon.
  const at = Math.min(altitude, apex) - 60;
  const centre = Math.round(width * CONE_CENTRE);
  const beside = Math.max(minX, Math.min(centre - BALLOON_HALF - 2, Math.round(width * CONE_CENTRE - coneHalfWidth(at, width, you) - BALLOON_GAP - BALLOON_HALF)));
  // Past the top, it drifts over the crater: a pixel every 15 m, so it never jumps.
  const past = Math.max(0, altitude - apex);
  const x = beside >= centre ? beside : Math.min(centre, beside + Math.floor(past / 15));
  // At most at the right edge (its envelope in view; at large text sizes the page's chips can push it there).
  return Math.min(width - BALLOON_HALF - 1, x);
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
      const count = Math.round(o.width / (k * 1_000 >= SPACE_M ? 6 : 8));
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rnd() * o.width);
        const a = k * 1_000 + rnd() * 1_000;
        const kind = rnd();
        const y = rowOf(a);
        if (a < from) continue;
        let crowded = false;
        for (let dy = -2; dy <= 2 && !crowded; dy++) {
          for (let dx = -2; dx <= 2; dx++) if (placed.has(`${x + dx},${y + dy}`)) crowded = true;
        }
        if (crowded) continue;
        placed.add(`${x},${y}`);
        if (kind < 0.06) {
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
    // Some named zones get what they're named for (Moonlight's moon is drawn with the moon).
    const zoneM = j * 2_500;
    if (zoneM === 32_500) {
      // Asteroid belt: a loose diagonal band of small rocks.
      for (let i = 0; i < 14; i++) {
        const rx = Math.round(rnd() * o.width);
        const ry = rowOf(zoneM + 600 + (rx / o.width) * 900 + (rnd() - 0.5) * 300);
        const big = rnd() < 0.4;
        c.set(rx, ry, R.planet);
        c.set(rx + 1, ry, R["planet-shade"]);
        c.set(rx, ry + 1, R["planet-shade"]);
        if (big) {
          c.set(rx + 1, ry + 1, R["planet-shade"]);
          c.set(rx + 2, ry + 1, R["planet-shade"]);
        }
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
    const named = zoneM === 27_500 ? 0.6 : zoneM === 35_000 ? 0.1 : null;
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
    } else if (kind < 0.8) {
      // A satellite: a small body between two gold panels.
      for (let dx = -4; dx <= 4; dx++) {
        if (Math.abs(dx) <= 1) {
          c.set(cx + dx, cy, R.satellite);
          c.set(cx + dx, cy + 1, R.satellite);
        } else if (Math.abs(dx) >= 2) {
          c.set(cx + dx, cy, R["moon-shade"]);
          c.set(cx + dx, cy + 1, Math.abs(dx) === 2 ? R.satellite : R["moon-shade"]);
        }
      }
      c.set(cx, cy - 1, R.satellite);
    }
    // Else: nothing here (space is mostly empty).
  }

  // 4. Cloud banks behind everything, about every 1,500 m, alternating far
  //    and near, each reaching in from one side.
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
      {
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
      // Never above a solid cloud cap: no tops in sight, even far ones.
      const h = Math.min(capStrength(o.you) >= 1 ? mistLine(o.you) - 150 : Infinity, peakAlt * (0.5 + 0.5 * noise1(x / 11, seed)) * (0.8 + 0.2 * noise1(x / 4, seed + 1)));
      for (let y = Math.max(0, rowOf(h)); y < o.height; y++) if (alt(y) <= h) c.set(x, y, role);
    }
  };
  ridge(3_400, SEED + 5, R["ridge-far"]);
  ridge(1_900, SEED + 6, R["ridge-near"]);

  // 6. The mountain: a broad cone, lit on the left, shaded on the right;
  //    pines up to the treeline, rock, then snow from the snowline. It ends
  //    in the cloud cap (below), or, near the Summit, in its small flat top
  //    with a crater's dip in the middle.
  const apex = apexFor(o.you);
  for (let y = 0; y < o.height; y++) {
    const a = alt(y);
    const span = mountainSpan(a, o.width, o.you);
    if (!span) continue;
    const ridgeX = ridgeAt(a, o.width, o.you);
    const crater = mountainSpan(a + o.metresPerRow, o.width, o.you) === null;
    for (let x = Math.max(0, span.left); x <= Math.min(o.width - 1, span.right); x++) {
      if (crater && Math.abs(x + 0.5 - o.width * CONE_CENTRE) < 2.5 && a > apex - 2 * o.metresPerRow) continue;
      const lit = x + 0.5 < ridgeX;
      // A gentle, wide wave (sharp teeth here read as a row of little peaks).
      const snowline = 3_000 + (noise1(x / 16, 41) - 0.5) * 260 + (noise1(x / 5, 42) - 0.5) * 60;
      const treeline = 1_500 + (noise1(x / 5, 43) - 0.5) * 300;
      const ground = groundAt(a, snowline, treeline);
      let role: number;
      if (ground === "snow") role = lit ? R.snow : R["snow-shade"];
      else if (ground === "rock") role = lit ? R.rock : R["rock-shade"];
      else if (ground === "pine") role = R.pine;
      else role = R.valley;
      c.set(x, y, role);
    }
  }
  // Gullies: thin lines fanning down the snow from the cloud cap, each at a
  // fixed share of the cone's half-width, so they lean out with the slope
  // ("/" on the lit face, "\\" on the shaded one). Shade on the lit face,
  // rock on the shaded one. Only in the snow.
  {
    const rnd = seeded(SEED + 60);
    const shares = [-0.78, -0.55, -0.3, 0.28, 0.5, 0.74].map((f) => f + (rnd() - 0.5) * 0.08);
    for (let y = 0; y < o.height; y++) {
      const a = alt(y);
      const top = mountainTop(o.you);
      if (a >= top || a < 3_300) continue;
      const half = coneHalfWidth(a, o.width, o.you);
      shares.forEach((f, i) => {
        // Staggered: most start a little below the cap (only one or two reach
        // it), each runs down a while, in dashes of 4–8 pixels.
        const startBelow = [0, 260, 520, 120, 400, 650][i];
        const fromTop = top - startBelow - a;
        if (fromTop < 0 || fromTop > 1_100 + Math.abs(f) * 1_800) return;
        const k = Math.round(a / o.metresPerRow) + i * 5;
        if (k % 10 >= 4 + (i % 3) * 2) return;
        const x = Math.round(o.width * CONE_CENTRE + f * half);
        const here = c.get(x, y);
        if (here === R.snow) c.set(x, y, R["snow-shade"]);
        else if (here === R["snow-shade"]) c.set(x, y, R["snow-gully"]);
      });
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
    const span = mountainSpan(a, o.width, o.you);
    for (let x = k % 4 === 0 ? 1 : 3; x < o.width; x += 4) {
      const px = x + Math.floor(hash01(SEED + 70 + k, x) * 3) - 1;
      const onMountain = span !== null && px >= span.left + 1 && px <= span.right - 1;
      const treeline = 1_500 + (noise1(px / 5, 43) - 0.5) * 300;
      if (!(onMountain && a < treeline) && !(a < 420 && hash01(SEED + 71, px) < 0.35)) continue;
      // A triangle (1, 3, 5 wide…) on a one-pixel trunk.
      const h = 4 + Math.floor(hash01(SEED + 72 + k, px) * 3);
      for (let j = 0; j < h; j++) {
        const trunk = j === h - 1;
        const half = trunk ? 0 : Math.min(2, j);
        for (let dx = -half; dx <= half; dx++) c.set(px + dx, row - h + 1 + j, trunk || dx > 0 ? R["pine-dark"] : R.pine);
      }
    }
  }

  // 7. The cloud sea at about 5,000 m, in front of the mountain's waist.
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

  // 7b. The cloud cap: the mountain disappears into a dense band of cloud
  //     above you (its underside overlaps the mountain's last rows). Near
  //     the Summit it thins smoothly: fewer, smaller lobes in a lower band,
  //     the real peak showing through the gaps, until it's gone.
  const strength = capStrength(o.you);
  if (strength > 0) {
    const mist = mistLine(o.you);
    const baseRow = rowOf(mist - CAP_UNDERSIDE_M);
    const topRow = rowOf(mist - CAP_UNDERSIDE_M + 1_160 * strength);
    if (baseRow >= -10 && topRow <= o.height + 10) {
      // The same lobes at every strength (drawn from the same rolls), so it thins without jumping.
      const rnd = seeded(SEED + 90 + Math.round(o.you / 100));
      const bumps: Bump[] = [];
      for (let x = -8; x < o.width + 8; ) {
        const r0 = 5 + rnd() * 9;
        const lift = rnd();
        const keep = rnd();
        const r = r0 * (0.45 + 0.55 * strength);
        // Below about 0.9 it breaks into separate banks: sky opens at a third and two thirds across, wider as it goes.
        const gap = Math.max(0, 0.9 - strength) * o.width * 0.35;
        const inGap = Math.abs(x - o.width / 3) < gap || Math.abs(x - (2 * o.width) / 3) < gap;
        if (!inGap && keep < 0.15 + 0.85 * strength) bumps.push({ x, y: topRow + r * 0.6 + lift * 6 * strength, r });
        x += r0 * (0.75 + (keep % 0.5));
      }
      bumps.sort((a, b) => a.y - b.y);
      if (strength >= 1) drawCloud(c, 0, 0, bumps, baseRow, cloudShades(false, dark), SEED + 91);
      else {
        // Thinning: each lobe its own puff, its body shortening from the band's
        // underside up to the lobe as the cap goes (no ragged fence of gaps).
        for (const b of bumps) {
          const own = b.y + b.r * 0.6;
          drawCloud(c, 0, 0, [b], Math.round(baseRow - (baseRow - own) * (1 - strength)), cloudShades(false, dark), SEED + 91);
        }
      }
      // Over the mountain the cloud hangs lower: three lobes 3–6 rows below the underside.
      const half = coneHalfWidth(Math.min(mist, apexFor(o.you)), o.width, o.you);
      for (let k = 0; k < 3; k++) {
        const r = (4 + rnd() * 2.5) * (0.45 + 0.55 * strength);
        const cx = o.width * CONE_CENTRE + (k - 1) * 0.6 * half + (rnd() - 0.5) * 6;
        const cy = baseRow + 1 + rnd() * 2;
        if (strength > 0.5) drawCloud(c, 0, 0, [{ x: cx, y: cy + 2 * (1 - strength), r }], Math.round(cy + 2 + rnd() * 2 + 3 * (1 - strength)), cloudShades(false, dark));
      }
      // A row of mist where the snow meets the cloud: the slope fades into it.
      for (let x = 0; x < o.width && strength >= 1; x++) {
        for (let y = baseRow + 8; y > baseRow - 12; y--) {
          const here = c.get(x, y);
          if (here === R.snow || here === R["snow-shade"] || here === R.rock || here === R["rock-shade"]) {
            const above = c.get(x, y - 1);
            if (above === R.cloud || above === R["cloud-shade"] || above === R["cloud-deep"] || above === R["cloud-light"]) c.set(x, y, R["cloud-shade"]);
            break;
          }
        }
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

/** The moving layer, over a copy of the base: the drifting clouds, then you. */
export function drawWorldMoving(c: Canvas, o: WorldOptions) {
  const { alt, rowOf } = rows(o);
  const dark = o.theme === "dark";
  // Clouds seeded per 500 m band (fixed in metres), two tiers: small far
  // ones tinted toward the sky, nearer white ones (some medium) in front.
  const around: { clear: Box[] } = {
    // Only its own balloon (the strip's far layer has none: its clouds pass behind the strip's balloon, as before).
    clear: keepClear(
      o,
      rowOf,
      o.altitude !== null ? { x: balloonX(o.altitude, o.width, o.you, o.balloonMinX), y: balloonRow(rowOf(o.altitude), o.height), inBand: inCloudBand(o.altitude) } : null,
    ),
  };
  // The moon first, with its glow; drifting clouds keep clear of it (one passing
  // in front would leave a stray gold speck, not a moon).
  const moonUp = o.moon !== null && moonShows(o.theme, alt(o.moon.y));
  drawMoon(c, o, moonUp);
  if (o.moon && moonUp) around.clear.push({ x0: o.moon.x - 8, x1: o.moon.x + 9, y0: o.moon.y - 8, y1: o.moon.y + 9 });
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
  if (o.altitude !== null) drawBalloon(c, balloonX(o.altitude, o.width, o.you, o.balloonMinX), balloonRow(rowOf(o.altitude), o.height), o.theme, bob(o));
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
function drawMoon(c: Canvas, o: Pick<WorldOptions, "theme" | "moon">, shows: boolean) {
  if (o.moon && shows) {
    const glow = o.theme === "dark";
    const { x: mx, y: my } = o.moon;
    for (let y = my - 9; y <= my + 9; y++) {
      for (let x = mx - 9; x <= mx + 9; x++) {
        if (inCircle(x, y, mx + 0.5, my + 0.5, 3.6)) {
          c.set(x, y, inCircle(x, y, mx - 0.6, my - 0.6, 3.6) ? R.moon : R["moon-shade"]);
          continue;
        }
        // The glow lifts the sky, and the cap's cloud around it (moonlight through a gap); never a star or the mountain.
        const here = c.get(x, y);
        if (!glow || !(isSky(here) || GLOWS_ON.has(here))) continue;
        if (inCircle(x, y, mx + 0.5, my + 0.5, 5.5)) c.set(x, y, R["moon-glow"]);
        else if (inCircle(x, y, mx + 0.5, my + 0.5, 7.5)) c.set(x, y, R["moon-glow-2"]);
      }
    }
  }
}

/** The mountain's own colours (far clouds pass behind it). */
const MOUNTAIN_ROLES = new Set<number>([R.snow, R["snow-shade"], R["snow-gully"], R.rock, R["rock-shade"], R.pine, R["pine-dark"]]);

/** The snow (a cloud over it is drawn a shade paler, as mist). */
const SNOWY = new Set<number>([R.snow, R["snow-shade"], R["snow-gully"]]);
const MIST: Record<number, number> = {
  [R.cloud]: R["cloud-light"],
  [R["cloud-light"]]: R["cloud-light"],
  [R["cloud-shade"]]: R["snow-shade"],
  [R["cloud-deep"]]: R["snow-shade"],
  // No coral rim on a slope (it reads as a scratch).
  [R.rim]: R["cloud-light"],
};

/** Cloud the dark moon's glow lights up (so on the cap it reads as a gap in the cloud). */
const GLOWS_ON = new Set<number>([R.cloud, R["cloud-light"], R["cloud-shade"], R["cloud-deep"]]);

/** In light, the moon shows once the sky at its height is this deep (about 14,750 m up). */
export const LIGHT_MOON_FROM_M = SPACE_BANDS[2];

/** Does the moon show at this height? Always in dark; in light once the sky is deep enough (the stratosphere and space). */
export function moonShows(theme: Theme, moonAltitude: number): boolean {
  return theme === "dark" || moonAltitude >= LIGHT_MOON_FROM_M;
}

/** A box of logical pixels: x0 ≤ x < x1, y0 ≤ y < y1. */
type Box = { x0: number; x1: number; y0: number; y1: number };

/** Where clouds never drift: around your balloon (basket at x, y), and around the peak while it's in view. */
function keepClear(o: { width: number; you: number }, rowOf: (a: number) => number, balloon: { x: number; y: number; inBand: boolean } | null): Box[] {
  const boxes: Box[] = [];
  // In the cloud band, clouds may brush the balloon (you're in cloud): only its envelope stays clear.
  if (balloon) boxes.push(balloon.inBand ? { x0: balloon.x - 4, x1: balloon.x + 5, y0: balloon.y - 13, y1: balloon.y - 4 } : { x0: balloon.x - 7, x1: balloon.x + 7, y0: balloon.y - 16, y1: balloon.y + 3 });
  if (capStrength(o.you) >= 1 && mistLine(o.you) <= CAP_MIN_M) {
    const under = rowOf(mistLine(o.you) - CAP_UNDERSIDE_M);
    boxes.push({ x0: -100, x1: o.width + 100, y0: under - 1, y1: under + 9 });
  }
  if (capStrength(o.you) < 1) {
    const half = coneHalfWidth(SUMMIT_M - 500, o.width, o.you) + 3;
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
  /** Keep clear of these boxes (the balloon, the peak in view). */
  around?: { clear: readonly Box[] },
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
    const inFrame = x >= 0 && x + w <= c.width;
    // Over the snow: a far cloud passes behind the mountain (not drawn there);
    // a near one is mist, in tones never darker than the shaded snow (a
    // darker cloud on a pale slope reads as a hole), its shape kept.
    const misty = {
      get: (px: number, py: number) => c.get(px, py),
      set: (px: number, py: number, r: number) => {
        const under = c.get(px, py);
        if (tier === "far" && MOUNTAIN_ROLES.has(under)) return;
        c.set(px, py, SNOWY.has(under) ? (MIST[r] ?? r) : r);
      },
    };
    drawCloud(misty, x, top, bumps, base, cloudShades(tier === "far", dark, medium && inFrame));
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
   * (before today), so the slope and its cloud cap stay still while your
   * flag climbs it during the day (at most 150 m: the cap stays above you).
   */
  you: number;
  driftMs: number;
  /** As WorldOptions.balloonMinX. */
  balloonMinX?: number;
};

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
  return { x: balloonX(o.altitude, o.width, o.you, o.balloonMinX), y: Math.min(o.height - 3, Math.round(o.height - 1 - o.height * (1 - YOU_FROM_TOP)) + closeFrame(o).shift) };
}

/** The strip never shows more than this below the valley floor: near the ground it looks up instead (at Base camp, up to the cap). */
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

/** The strip's far layer (its still base can be cached). The moon sits high on the right (over the cloud cap, or beside the cone), never on the mountain. */
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
  };
}

/** The strip's moon: high up, over or beside the cone (right, else left), never on the mountain; on a solid cap its glow makes a gap in the cloud; none if there's no room (at Base camp the top of the strip is all mountain under the cap). */
function closeMoon(o: Omit<CloseOptions, "time" | "driftMs">): { x: number; y: number } | null {
  const y = 7;
  const a = closeFrame(o).bottom + (o.height - 1 - y + 0.5) * FAR_M;
  // In light, decided by the day's start (the shape's height), so it never appears mid-lift.
  if (!moonShows(o.theme, a - (o.altitude - o.you))) return null;
  // No mountain in sight at its disc's rows (above the top, or hidden in a solid cap's cloud): high on the right.
  const hidden = (h: number) => mountainSpan(h, o.width, o.you) === null || (capStrength(o.you) >= 1 && h >= mistLine(o.you) - CAP_UNDERSIDE_M);
  // (Five rows below its disc too: the cap's underside is ragged, a few rows up and down.)
  if (hidden(a + 4 * FAR_M) && hidden(a - 9 * FAR_M)) return { x: Math.round(o.width * 0.82), y };
  const half = coneHalfWidth(Math.min(a - 4 * FAR_M, apexFor(o.you)), o.width, o.you);
  const right = Math.round(o.width * CONE_CENTRE + half + 11);
  if (right <= o.width - 5) return { x: right, y };
  const left = Math.round(o.width * CONE_CENTRE - half - 11);
  return left >= 5 ? { x: left, y } : null;
}

/** The strip's moving layer over its far base: the far world's clouds, the near clouds, and you. */
export function drawCloseMoving(c: Canvas, o: CloseOptions) {
  drawWorldMoving(c, { ...closeFarOptions(o), time: o.time, altitude: null, driftMs: o.driftMs * 2, clearOf: closeBalloonAt(o) });
  const dark = o.theme === "dark";
  // Near the ground you're drawn lower (the far view stops at its floor): the near layer moves with you.
  const bottom = o.altitude - o.height * (1 - YOU_FROM_TOP) * NEAR_M + closeFrame(o).shift * NEAR_M;
  const rowOf = (a: number) => Math.round(o.height - 1 - (a - bottom) / NEAR_M);
  // Near clouds: about one every 200 m (2–3 in view), seeded by altitude so
  // they're always in the same places on the climb; mostly small.
  const band = 200;
  const far = closeFarOptions(o);
  const farRows = rows(far);
  const around = {
    // The peak is in the far world: its box in the far world's rows.
    clear: keepClear(o, farRows.rowOf, { x: balloonX(o.altitude, o.width, o.you, o.balloonMinX), y: rowOf(o.altitude), inBand: inCloudBand(o.altitude) }),
  };
  for (let k = Math.floor(bottom / band) - 3; k <= Math.ceil((bottom + o.height * NEAR_M) / band) + 1; k++) {
    if (k < 0 || (k + 1) * band > CLOUDS_END_M) continue;
    // In the band above the Summit you pass through more of them.
    const inBand = k * band >= CLOUD_BAND[0] && k * band < CLOUD_BAND[1];
    drawDriftingClouds(c, o, rowOf, 777_000 + k, k * band, (k + 1) * band, inBand ? 2 : 1, "near", dark, inBand ? 0.4 : 0.15, around);
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
  // The moon over the near clouds too, then you, just off the slope of the far world.
  // (The moon is drawn with the far layer, behind the clouds.)
  drawBalloon(c, balloonX(o.altitude, o.width, o.you, o.balloonMinX), Math.min(o.height - 3, rowOf(o.altitude)), o.theme, bob(o));
}

/** Dark mode's moon on the Climb screen: high on the left, around the top of the cloud cap, so it's in view when the screen opens. */
export function worldMoon(width: number, height: number, metresPerRow: number, altitude: number, top: number): { x: number; y: number } {
  // About the top of the cloud cap, and above the mountain's top; at the
  // left, clear of the cone (it's never wider than the view up there).
  const a = Math.min(top - 400, Math.max(2_600, mistLine(altitude) + 900, Math.min(apexFor(altitude) + 300, top - 400)));
  return { x: Math.round(width * 0.14), y: Math.round(height - 1 - a / metresPerRow) };
}
