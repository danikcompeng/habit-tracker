// The Climb's pixel-art world (plans/habit-tracker.md, Feature 10).
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

import { SUMMIT_M } from "../altitude";
import { SCENE_PALETTE, contrast } from "../palette";

/** Sky bands, highest (1) to lowest (12). */
const SKY = Array.from({ length: 12 }, (_, i) => `sky-${i + 1}` as const);

/** Colour roles. Index = the byte in the buffer. 0 is "nothing drawn". */
export const ROLES = [
  "none",
  ...SKY,
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
  "rim",
  "marker",
  "marker-ring",
  "marker-edge",
] as const;

export type Role = (typeof ROLES)[number];
const R = Object.fromEntries(ROLES.map((role, i) => [role, i])) as Record<Role, number>;

export type Theme = "light" | "dark";

/** The world's top: 12,000 m, or higher once you are (your altitude + 1,500 m, in 2,500 m steps). */
export function worldTop(altitude: number): number {
  return Math.max(12_000, Math.ceil((altitude + 1_500) / 2_500) * 2_500);
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
  c: Canvas,
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
      if (!drawn.has(key(x, y - 1))) c.set(ox + x, oy + y, shades.rim);
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
export const SKY_BANDS = [700, 1_500, 2_400, 3_400, 4_500, 5_700, 7_000, 8_400, 9_900, 11_500, 13_500] as const;

/** The sky band (sky-1 darkest … sky-12 palest) at an altitude: fixed in metres, so the sky never shifts as the world grows. */
export function skyBand(altitude: number): number {
  return R["sky-12"] - SKY_BANDS.filter((b) => altitude >= b).length;
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
  theme: Theme;
  /** Dark mode's moon, in logical pixels of this view (so it's always in sight), or null. */
  moon: { x: number; y: number } | null;
  /** ms, for drift; 0 for a still scene. */
  time: number;
  /** Your altitude: the marker. null for none. */
  altitude: number | null;
  /** ms per pixel of cloud drift (MOTION.drift). */
  driftMs: number;
};

export type BaseOptions = Omit<WorldOptions, "time" | "altitude" | "driftMs">;

const SEED = 20261125;

/** Where the main peak is, as a fraction of the width. */
const PEAK_X = 0.6;
/** The flanks' slope: logical pixels of half-width per metre below the summit (left, right). */
const FLANK_L = 0.0125;
const FLANK_R = 0.0105;

/** A few deliberate crags on each flank: [altitude, pixels out, metres wide]. */
const CRAGS_L = [
  [6_300, 3, 500],
  [3_800, 4, 700],
  [1_600, 3, 600],
] as const;
const CRAGS_R = [
  [7_400, 2, 400],
  [4_900, 3, 600],
  [2_200, 4, 800],
] as const;

function crag(altitude: number, crags: readonly (readonly [number, number, number])[]): number {
  let out = 0;
  for (const [a, px, w] of crags) out += px * Math.max(0, 1 - Math.abs(altitude - a) / w);
  return out;
}

/** The main mountain's left and right edges (logical x) at an altitude, for a width: straight flanks, stepped. */
export function mountainSpan(altitude: number, width: number): { left: number; right: number } | null {
  if (altitude >= SUMMIT_M) return null;
  const peak = width * PEAK_X;
  const below = SUMMIT_M - altitude;
  return {
    left: Math.floor(peak - below * FLANK_L - crag(altitude, CRAGS_L)),
    right: Math.ceil(peak + below * FLANK_R + crag(altitude, CRAGS_R)),
  };
}

/** The ridge splitting the lit face (left) from the shaded one (right): from the summit down and to the right. */
function ridgeAt(altitude: number, width: number): number {
  return width * PEAK_X + (SUMMIT_M - altitude) * FLANK_R * 0.4;
}

/** The x of the climbing line on the lit face at an altitude: where your marker stands. */
export function trailX(altitude: number, width: number): number {
  const peak = width * PEAK_X;
  if (altitude >= SUMMIT_M) return Math.round(peak);
  const span = mountainSpan(altitude, width)!;
  return Math.round(span.left + (ridgeAt(altitude, width) - span.left) * 0.55);
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

  // 1. Sky, in gentle steps.
  for (let y = 0; y < o.height; y++) {
    const role = skyBand(alt(y));
    for (let x = 0; x < o.width; x++) c.set(x, y, role);
  }

  // 2. Stars (dark): seeded per kilometre above the valley haze; never two
  //    touching; some dim, a few with a small cross.
  if (dark) {
    for (let k = Math.max(2, Math.floor(lowest / 1_000)); k * 1_000 <= highest; k++) {
      const rnd = seeded(SEED + 1_000 + k);
      const count = Math.round(o.width / 8);
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rnd() * o.width);
        const a = k * 1_000 + rnd() * 1_000;
        const kind = rnd();
        const y = rowOf(a);
        if (a < 2_500 || y < 1 || y >= o.height - 1) continue;
        let crowded = false;
        for (let dy = -1; dy <= 1 && !crowded; dy++) {
          for (let dx = -1; dx <= 1; dx++) if (c.get(x + dx, y + dy) === R.star || c.get(x + dx, y + dy) === R["star-dim"]) crowded = true;
        }
        if (crowded) continue;
        if (kind < 0.06) {
          c.set(x, y, R.star);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, R["star-dim"]);
        } else c.set(x, y, kind < 0.4 ? R["star-dim"] : R.star);
      }
    }
  }

  // 4. Cloud banks behind everything, about every 1,500 m, alternating far
  //    and near, each reaching in from one side.
  const BANKS = [
    [1_300, 900, false, 0.75, "left"],
    [2_700, 1_100, true, 0.6, "right"],
    [4_100, 900, false, 0.7, "left"],
    [6_500, 1_100, true, 0.65, "right"],
    [7_900, 900, false, 0.7, "left"],
    [9_400, 1_000, true, 0.6, "right"],
    [11_100, 800, false, 0.7, "left"],
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
      x += r * (0.85 + rnd() * 0.5);
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
      const h = peakAlt * (0.5 + 0.5 * noise1(x / 11, seed)) * (0.8 + 0.2 * noise1(x / 4, seed + 1));
      for (let y = Math.max(0, rowOf(h)); y < o.height; y++) if (alt(y) <= h) c.set(x, y, role);
    }
  };
  ridge(3_400, SEED + 5, R["ridge-far"]);
  ridge(1_900, SEED + 6, R["ridge-near"]);

  // 6. The mountain: straight flanks, stepped; lit on the left, a widening
  //    shaded triangle on the right; pines up to the treeline, rock, then
  //    snow from the snowline, rock showing through in short strata.
  for (let y = 0; y < o.height; y++) {
    const a = alt(y);
    const span = mountainSpan(a, o.width);
    if (!span) continue;
    const ridgeX = ridgeAt(a, o.width);
    for (let x = Math.max(0, span.left); x <= Math.min(o.width - 1, span.right); x++) {
      const lit = x + 0.5 < ridgeX;
      const snowline = 3_000 + (noise1(x / 7, 41) - 0.5) * 500;
      const treeline = 1_500 + (noise1(x / 5, 43) - 0.5) * 300;
      const ground = a > SUMMIT_M - 250 ? "snow" : groundAt(a, snowline, treeline);
      let role: number;
      if (ground === "snow") role = lit ? R.snow : R["snow-shade"];
      else if (ground === "rock") role = lit ? R.rock : R["rock-shade"];
      else if (ground === "pine") role = R.pine;
      else role = R.valley;
      c.set(x, y, role);
    }
  }
  // Strata: rock showing through the snow in runs along the flank, clustered
  // by the crags and mostly on the shaded face (on the lit face, only a shadow).
  {
    const rnd = seeded(SEED + 60);
    const crags = [...CRAGS_L, ...CRAGS_R].map(([a]) => a).filter((a) => a > 3_300);
    for (let i = 0; i < 24; i++) {
      const near = crags[Math.floor(rnd() * crags.length)];
      const a = Math.min(SUMMIT_M - 400, Math.max(3_300, near + (rnd() - 0.5) * 1_400));
      const span = mountainSpan(a, o.width);
      const shaded = rnd() < 0.75;
      const where = rnd();
      const length = 3 + Math.floor(rnd() * 4);
      if (!span) continue;
      const ridgeX = ridgeAt(a, o.width);
      const x0 = shaded ? ridgeX + where * (span.right - ridgeX) : span.left + where * (ridgeX - span.left);
      const y0 = rowOf(a);
      // Along the flank: down the face, drifting outward by its slope.
      const slope = (shaded ? FLANK_R : -FLANK_L) * o.metresPerRow;
      for (let k = 0; k < length; k++) {
        const px = Math.round(x0 + slope * k * 1.6);
        const py = y0 + k;
        const here = c.get(px, py);
        if (here === R.snow) c.set(px, py, R["snow-shade"]);
        else if (here === R["snow-shade"]) c.set(px, py, R["rock-shade"]);
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
    const span = mountainSpan(a, o.width);
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

  // 8. The stratosphere's own touch: thin cirrus streaks.
  for (let k = Math.max(20, Math.floor(lowest / 500)); k * 500 <= highest; k++) {
    const rnd = seeded(SEED + 4_000 + k);
    for (let i = 0; i < 2; i++) {
      const y = rowOf(k * 500 + rnd() * 500);
      const x0 = Math.floor(rnd() * o.width);
      const length = 6 + Math.floor(rnd() * 10);
      for (let x = x0; x < x0 + length; x++) {
        const here = c.get(x % o.width, y);
        if (here >= R["sky-1"] && here <= R["sky-12"]) c.set(x % o.width, y, R.cirrus);
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
  for (let k = Math.max(1, Math.floor(alt(o.height - 1) / 500) - 1); k * 500 <= alt(0) + 500; k++) {
    const high = k * 500 >= 10_000;
    drawDriftingClouds(c, o, rowOf, SEED + 3_000 + k, k * 500, (k + 1) * 500, high ? 0 : 2, "far", dark);
    const near = high ? (hash01(SEED, k) < 0.4 ? 1 : 0) : 1 + (hash01(SEED + 1, k) < 0.5 ? 1 : 0);
    drawDriftingClouds(c, o, rowOf, SEED + 5_000 + k, k * 500, (k + 1) * 500, near, "near", dark);
  }
  drawMoon(c, o);
  if (o.altitude !== null) drawMarker(c, trailX(o.altitude, o.width), rowOf(o.altitude), o.theme);
}

/** Dark mode's moon: gold, shaded at the lower right, in two stepped rings of moonlit navy. Drawn over the clouds, so it's always seen. */
function drawMoon(c: Canvas, o: Pick<WorldOptions, "theme" | "moon">) {
  if (o.theme === "dark" && o.moon) {
    const { x: mx, y: my } = o.moon;
    for (let y = my - 9; y <= my + 9; y++) {
      for (let x = mx - 9; x <= mx + 9; x++) {
        if (inCircle(x, y, mx + 0.5, my + 0.5, 3.6)) {
          c.set(x, y, inCircle(x, y, mx - 0.6, my - 0.6, 3.6) ? R.moon : R["moon-shade"]);
          continue;
        }
        // The glow only lifts the sky (never paints over a cloud or a star).
        const here = c.get(x, y);
        if (here < R["sky-1"] || here > R["sky-12"]) continue;
        if (inCircle(x, y, mx + 0.5, my + 0.5, 5.5)) c.set(x, y, R["moon-glow"]);
        else if (inCircle(x, y, mx + 0.5, my + 0.5, 7.5)) c.set(x, y, R["moon-glow-2"]);
      }
    }
  }
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
    // Dark mode's coral rim: on every medium cloud, the moon-facing edge.
    drawCloud(c, x, y + (shape.base - base), bumps, base, cloudShades(tier === "far", dark, medium));
  }
}

/**
 * Your marker: an accent flag on a pole, with a one-pixel ring that takes
 * whichever of two colours (light or dark) stands out more from what's under
 * it, so it reads 3:1 on every sky, cloud and slope (lib/palette.test.ts).
 */
export function drawMarker(c: Canvas, x: number, y: number, theme: Theme) {
  const palette = SCENE_PALETTE[theme];
  const shape = new Set<string>();
  const add = (dx: number, dy: number) => shape.add(`${dx},${dy}`);
  // The pole: from the ground up 8 pixels; the pennant: 5 wide, 4 tall, notched.
  for (let dy = -8; dy <= -1; dy++) add(0, dy);
  ["xxxxx", "xxxx", "xxxxx", "xxx"].forEach((row, i) => [...row].forEach((_, dx) => add(dx + 1, i - 8)));
  const cells = [...shape].map((k) => k.split(",").map(Number) as [number, number]);
  // The ring's pixels, and what's under each.
  const ring = new Map<string, Role>();
  for (const [dx, dy] of cells) {
    for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${dx + ex},${dy + ey}`;
      if (shape.has(k) || ring.has(k)) continue;
      ring.set(k, ROLES[c.get(x + dx + ex, y + dy + ey)]);
    }
  }
  // One colour for the whole ring: whichever stands out more against the
  // worst of what it sits on (a mixed ring looks like a glitch).
  const worst = (colour: "marker-ring" | "marker-edge") =>
    Math.min(...[...ring.values()].filter((u) => palette[u]).map((u) => contrast(palette[colour], palette[u])));
  const colour = worst("marker-ring") >= worst("marker-edge") ? R["marker-ring"] : R["marker-edge"];
  for (const k of ring.keys()) {
    const [dx, dy] = k.split(",").map(Number);
    c.set(x + dx, y + dy, colour);
  }
  for (const [dx, dy] of cells) c.set(x + dx, y + dy, R.marker);
}

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
  /** Your altitude: the middle of the view. */
  altitude: number;
  driftMs: number;
};

const NEAR_M = 5;
const FAR_M = 40;

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

/** The strip's far layer (its still base can be cached). The moon sits high on the left, always in view. */
export function closeFarOptions(o: Omit<CloseOptions, "time" | "driftMs">): BaseOptions {
  return {
    width: o.width,
    height: o.height,
    metresPerRow: FAR_M,
    // Whole rows, so the cached base is reused between small lifts.
    bottom: Math.round((o.altitude - (o.height / 2) * FAR_M) / FAR_M) * FAR_M,
    top: worldTop(o.altitude),
    theme: o.theme,
    moon: { x: Math.round(o.width * 0.7), y: 11 },
  };
}

/** The strip's moving layer over its far base: the far world's clouds, the near clouds, and you. */
export function drawCloseMoving(c: Canvas, o: CloseOptions) {
  drawWorldMoving(c, { ...closeFarOptions(o), time: o.time, altitude: null, driftMs: o.driftMs * 2 });
  const dark = o.theme === "dark";
  const bottom = o.altitude - (o.height / 2) * NEAR_M;
  const rowOf = (a: number) => Math.round(o.height - 1 - (a - bottom) / NEAR_M);
  // Near clouds: about one every 200 m (2–3 in view), seeded by altitude so
  // they're always in the same places on the climb; mostly small.
  const band = 200;
  for (let k = Math.floor(bottom / band) - 3; k <= Math.ceil((bottom + o.height * NEAR_M) / band) + 1; k++) {
    if (k < 0) continue;
    drawDriftingClouds(c, o, rowOf, 777_000 + k, k * band, (k + 1) * band, 1, "near", dark, 0.15);
  }
  // The moon over the near clouds too, then you, on the climbing line of the far world.
  drawMoon(c, closeFarOptions(o));
  drawMarker(c, trailX(o.altitude, o.width), rowOf(o.altitude), o.theme);
}

/** Dark mode's moon on the Climb screen: high on the left, about 1,100 m above you, so it's in view when the screen opens. */
export function worldMoon(width: number, height: number, metresPerRow: number, altitude: number, top: number): { x: number; y: number } {
  const a = Math.min(top - 400, Math.max(2_600, altitude + 1_100));
  return { x: Math.round(width * 0.14), y: Math.round(height - 1 - a / metresPerRow) };
}
