// The zone celebration on Today's strip (plans/habit-tracker.md, Feature 10h):
// when a new zone's card is due, the balloon leads the view up (it surges in
// the strip, then the view catches up with streaks rushing past, so it never
// sinks), sways, and pops a burst of pixel confetti that rains down; the
// card lands as it settles.
//
// Pure: every curve takes `t`, milliseconds since the moment, and gives
// whole logical pixels (or a progress for the view), so the strip just reads
// them each frame (components/climb/climb-strip.tsx) and the scene draws
// them (lib/climb-scene/scene.ts). Times are MOTION.celebrate, .land and
// .confetti. None of this runs with Reduce Motion: there are still sparkles.
// What plays when (a new moment, a new height, Reduce Motion) is decided by
// nextRun, and the strip's held lift by the LiftHold functions, below.

import { SUMMIT_M } from "./altitude";
import { seeded, type Role, type Theme } from "./climb-scene/scene";
import { MOTION } from "./motion";

/** A confetti bit: its top-left corner relative to the balloon's envelope at rest, in logical px. */
export type Bit = { dx: number; dy: number; w: number; h: number; role: Role };

/** Ease out (cubic): quick, then gentle. */
function easeOut(u: number): number {
  return 1 - Math.pow(1 - u, 3);
}

/** Ease in and out (cubic). */
function easeInOut(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Ease out with a small overshoot and settle (ease-out-back); BACK sets how far past (about 13% here). */
function easeOutBack(u: number): number {
  const v = u - 1;
  return 1 + (BACK + 1) * v * v * v + BACK * v * v;
}
const BACK = 2.2;

/** The view waits this long for the balloon to lead, then follows. */
const VIEW_FROM = 120;

/**
 * The view's progress from the old height to the new one: still for
 * VIEW_FROM ms while the balloon leads, then eased in and out, exactly 1
 * from MOTION.celebrate on. It never passes 1: the overshoot is the balloon's.
 */
export function liftProgress(t: number): number {
  if (t <= VIEW_FROM) return 0;
  if (t >= MOTION.celebrate) return 1;
  return easeInOut((t - VIEW_FROM) / (MOTION.celebrate - VIEW_FROM));
}

/** How fast the view climbs at `t`, 0–1 (1 at its fastest): the streaks' density. */
export function liftSpeed(t: number): number {
  if (t <= VIEW_FROM || t >= MOTION.celebrate) return 0;
  const u = (t - VIEW_FROM) / (MOTION.celebrate - VIEW_FROM);
  // easeInOut's slope over its top slope (3, at the middle).
  return (u < 0.5 ? 12 * u * u : 3 * Math.pow(-2 * u + 2, 2)) / 3;
}

/** The balloon's lead over the view, in rows, once it has surged (before the overshoot). */
export const RISE_ROWS = 5;
/** How long its surge takes. */
const RISE_MS = 450;

/**
 * The balloon ahead of the view, in whole rows above its resting row: a
 * surge up RISE_ROWS (a row past it, then settling: an ease-out-back), held
 * while the view starts, then handed back as the view catches up (scaled by
 * what's left of the view's lift), so in the world it only ever climbs (the
 * view's travel is more than its lead) and it's home at MOTION.celebrate.
 * Never below its resting row.
 */
export function balloonRise(t: number): number {
  if (t <= 0 || t >= MOTION.celebrate) return 0;
  const surge = RISE_ROWS * easeOutBack(Math.min(1, t / RISE_MS));
  return Math.max(0, Math.round(surge * (1 - liftProgress(t)))) + 0;
}

/** The sway lasts this long (past the lift: it keeps swinging gently as it settles). */
const SWAY_MS = 1_800;
/** Swings (full side-to-side cycles), about one a second. */
const SWINGS = 2;

/** The balloon's sway, in whole px from centre: a damped swing, ±2 at first, then ±1, then still. */
export function balloonSway(t: number): number {
  if (t <= 0 || t >= SWAY_MS) return 0;
  const u = t / SWAY_MS;
  return Math.round(2.4 * Math.pow(1 - u, 0.8) * Math.sin(2 * Math.PI * SWINGS * u)) + 0;
}

/** Confetti bits in a burst. */
export const CONFETTI_BITS = 22;
/** Drag (per second): a bit's pop slows to a fall. */
const DRAG = 3;
/** Gravity (px per second²); with DRAG, a bit falls at most GRAVITY / DRAG (20 px a second): it rains down past the balloon as the card lands. */
const GRAVITY = 60;
/** Bits start on the envelope's rim (px from its centre), so all of them show from the first frame. */
const RIM = 5;

/** A burst's colours: warm ones (Ascend's persimmon and gold), and the zone's own. */
export type ConfettiColours = { warm: readonly Role[]; zone: readonly Role[] };

/**
 * The confetti at `t`, relative to the balloon's envelope at rest. Each bit
 * starts on the envelope's rim and pops up and out along its own line (a fan
 * from straight up to 75° either side), slows, then rains down, fluttering
 * a pixel side to side and tumbling (2×1, then 1×2). A third of the warm
 * ones are single pixels; the zone's colours are always bars (a single pale
 * pixel would read as a star). Each lives 1.3–1.9 s, so none is left at
 * MOTION.confetti. The same `seed` gives the same burst.
 */
export function confetti(seed: number, t: number, colours: ConfettiColours): Bit[] {
  const bits: Bit[] = [];
  const all = [...colours.warm, ...colours.zone];
  if (t < 0 || t >= MOTION.confetti || all.length === 0) return bits;
  for (let i = 0; i < CONFETTI_BITS; i++) {
    const rnd = seeded(seed * 97 + i * 7919 + 1);
    // Spread evenly across the fan (a little jitter), so neighbours start apart and all pop at once.
    const across = (i + 0.5 + (rnd() - 0.5) * 0.4) / CONFETTI_BITS;
    const angle = -Math.PI / 2 + (across * 2 - 1) * (75 * Math.PI) / 180;
    const speed = 42 + rnd() * 24;
    const life = 1_300 + rnd() * 600;
    const delay = rnd() * 60;
    const from = RIM + rnd();
    const flutterHz = 1.6 + rnd();
    const phase = rnd() * Math.PI * 2;
    const pick = Math.floor(rnd() * all.length);
    const single = pick < colours.warm.length && rnd() < 1 / 3;
    const role = all[pick];
    const s = (t - delay) / 1000;
    if (s < 0 || t - delay >= life) continue;
    // Velocity decays with drag; gravity pulls toward a steady fall.
    const decay = (1 - Math.exp(-DRAG * s)) / DRAG;
    const x = Math.cos(angle) * (from + speed * decay);
    const y = Math.sin(angle) * (from + speed * decay) + (GRAVITY / DRAG) * (s - decay);
    // The flutter grows as the pop slows.
    const flutter = Math.sin(2 * Math.PI * flutterHz * s + phase) * Math.min(1, s / 0.3);
    const flat = Math.floor(s * flutterHz * 2 + phase) % 2 === 0;
    bits.push({
      dx: Math.round(x + flutter) + 0,
      dy: Math.round(y) + 0,
      w: single || !flat ? 1 : 2,
      h: single || flat ? 1 : 2,
      role,
    });
  }
  return bits;
}

/**
 * The confetti's colours, by zone and theme. Warm: persimmon (the shade that
 * shows on that backdrop; never the envelope's own highlight in light, where
 * it melts into the sky) and gold, twice. The zone's own two: chosen to
 * stand out from what's behind the balloon there (at least 1.8:1) and never
 * star-coloured (lib/climb-scene/celebration-scene.test.ts): on the forest
 * and the rock a slate and a violet (light) or a pale blue and a rust
 * (dark); on the snow, pine and a lake blue; at the Summit a deep pine and
 * violet (light) or two rusts (dark: nothing in the streaks' slate); in the clouds a pine
 * and a rust (light); higher up a rust and a slate.
 */
export function confettiRoles(zoneFrom: number, theme: Theme): ConfettiColours {
  const light = theme === "light";
  const snowy = zoneFrom >= 3_000 && zoneFrom < SUMMIT_M;
  const persimmon: Role[] = light ? ["balloon-shade", "marker"] : snowy ? ["balloon-shade", "balloon-shade"] : ["marker", "balloon-light"];
  const zone: Role[] =
    zoneFrom < 3_000
      ? light
        ? zoneFrom < 1_500
          ? ["snow-gully", "nebula-light"]
          : ["pine-dark", "nebula-light"]
        : ["lake-light", "planet"]
      : snowy
        ? ["pine", "lake"]
        : zoneFrom < 10_000
          ? light
            ? ["pine-dark", "nebula-light"]
            : ["planet", "planet-shade"]
          : zoneFrom < 12_500 && light
            ? ["pine", "planet-shade"]
            : ["planet", "snow-gully"];
  return { warm: [...persimmon, "moon", "moon"], zone };
}

/** Reduce Motion's stand-in: four still gold sparkles around the balloon's envelope (their centres, relative to it). */
export function sparkles(): { dx: number; dy: number }[] {
  return [
    { dx: -8, dy: -5 },
    { dx: 8, dy: -8 },
    { dx: -7, dy: 4 },
    { dx: 9, dy: 2 },
  ];
}

/** A burst's seed for a zone: the same zone always pops the same way. */
export function confettiSeed(zoneFrom: number): number {
  return Math.round(zoneFrom);
}

/** Is the celebration still moving at `t` (the lift, or any confetti)? */
export function celebrating(t: number): boolean {
  return t >= 0 && t < Math.max(MOTION.celebrate, MOTION.confetti);
}

/** Ease out (cubic), clamped to [0, 1]. */
function liftEase(u: number): number {
  return easeOut(Math.min(1, Math.max(0, u)));
}

/**
 * The strip's view through a celebration: from where it was to the zone's
 * new height on liftProgress's curve, plus a shift (a normal lift, eased
 * over MOTION.lift) when the target changes on the way (another habit
 * completed or undone mid-flight), so the view never jumps and always ends
 * on the live height.
 */
export type Flight = { began: number; from: number; to: number; shift: { from: number; to: number; began: number } | null };

/** Where a flight's view is at `now` (ms, the same clock as `began`), and whether it's over (the lift, the confetti and any shift). */
export function flightAt(f: Flight, now: number): { altitude: number; t: number; done: boolean } {
  const t = Math.max(0, now - f.began);
  let altitude = f.from + (f.to - f.from) * liftProgress(t);
  let shifting = false;
  if (f.shift) {
    const u = (now - f.shift.began) / MOTION.lift;
    altitude += f.shift.from + (f.shift.to - f.shift.from) * liftEase(u);
    shifting = u < 1;
  }
  return { altitude, t, done: !celebrating(t) && !shifting };
}

/** The flight re-aimed at a new target at `now`, from exactly where its view is. */
export function retarget(f: Flight, now: number, target: number): Flight {
  const s = f.shift ? f.shift.from + (f.shift.to - f.shift.from) * liftEase((now - f.shift.began) / MOTION.lift) : 0;
  return { ...f, shift: { from: s, to: target - f.to, began: now } };
}

/** The strip's celebration under way: its moment, flight, zone (the confetti's) and whether it has been counted (a test hook). */
export type Run = { id: number; flight: Flight; zoneFrom: number; counted: boolean };

/** A flight that's over (began long ago, at the target). */
function ended(target: number): Flight {
  return { began: -Infinity, from: target, to: target, shift: null };
}

/**
 * What the strip does now, given its run so far: play the flight, or ease
 * (or, with Reduce Motion, jump) to the target as for any lift.
 * - A new moment (by id) starts a flight from where the view is, or with
 *   Reduce Motion is marked seen (still), so it never plays later.
 * - The same moment again (a re-render, Strict Mode's second run, the card
 *   closing, a new height) carries on with the same clock, re-aimed at a
 *   new target without a jump (retarget).
 * - Reduce Motion coming on mid-flight ends it: a jump to the target, and
 *   turning it off again never replays it.
 */
export function nextRun(
  run: Run | null,
  now: { momentId: number | null; zoneFrom: number; reduce: boolean; target: number; view: number; time: number },
): { run: Run | null; mode: "flight" | "lift" } {
  let r = run;
  if (now.momentId !== null && r?.id !== now.momentId) {
    r = now.reduce
      ? { id: now.momentId, flight: ended(now.target), zoneFrom: now.zoneFrom, counted: true }
      : { id: now.momentId, flight: { began: now.time, from: now.view, to: now.target, shift: null }, zoneFrom: now.zoneFrom, counted: false };
  }
  if (!r || flightAt(r.flight, now.time).done) return { run: r, mode: "lift" };
  if (now.reduce) return { run: { ...r, flight: ended(now.target) }, mode: "lift" };
  const aim = r.flight.to + (r.flight.shift?.to ?? 0);
  if (aim !== now.target) r = { ...r, flight: retarget(r.flight, now.time, now.target) };
  return { run: r, mode: "flight" };
}

/** Today's held lift: the save holding it, its day, and the height the strip stays at. */
export type LiftHold = { id: number; day: string; cm: number };

/** A save that will open a new zone (`holds`) holds the strip, unless another save already does. */
export function holdOnSave(hold: LiftHold | null, save: { id: number; day: string; cm: number; holds: boolean }): LiftHold | null {
  return hold ?? (save.holds ? { id: save.id, day: save.day, cm: save.cm } : null);
}

/** A save's answer (or the cap) ends its own hold, never another's. */
export function holdReleased(hold: LiftHold | null, id: number): LiftHold | null {
  return hold?.id === id ? null : hold;
}

/** The height the strip shows: the live one, held (never above it) on the hold's own day. */
export function stripAltitude(liveCm: number, hold: LiftHold | null, today: string): number {
  return hold && hold.day === today ? Math.min(liveCm, hold.cm) : liveCm;
}

/**
 * May a save's answer bring its zone moment? Only if no undo (of any habit)
 * started after it, since the climb it carries assumed those keys were
 * done, and only while Today is shown (else the zone would be used up
 * unseen).
 */
export function momentMayShow(save: number, lastUndo: number, shown: boolean): boolean {
  return shown && save > lastUndo;
}
