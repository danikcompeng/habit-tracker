import { describe, expect, it } from "vitest";
import { SUMMIT_M, liftHoldFor, zoneMomentAfterSave } from "./altitude";
import {
  CONFETTI_BITS,
  RISE_ROWS,
  balloonRise,
  balloonSway,
  celebrating,
  confetti,
  confettiRoles,
  confettiSeed,
  flightAt,
  holdOnSave,
  holdReleased,
  liftProgress,
  liftSpeed,
  momentMayShow,
  nextRun,
  retarget,
  sparkles,
  stripAltitude,
} from "./celebration";
import { MOTION } from "./motion";

/** t every 10 ms across the celebration (and a little past it). */
const TIMES = Array.from({ length: 241 }, (_, i) => i * 10);

describe("the view's lift", () => {
  it("waits a moment for the balloon to lead, then eases in and out to exactly 1 at MOTION.celebrate", () => {
    expect(liftProgress(0)).toBe(0);
    expect(liftProgress(100)).toBe(0);
    expect(liftProgress(MOTION.celebrate)).toBe(1);
    expect(liftProgress(MOTION.celebrate + 500)).toBe(1);
  });
  it("only ever climbs, never past the new height (the overshoot is the balloon's)", () => {
    const values = TIMES.map(liftProgress);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(Math.max(...values)).toBe(1);
  });
  it("its speed (the streaks) rises and falls: 0 at both ends, 1 at its fastest", () => {
    expect(liftSpeed(0)).toBe(0);
    expect(liftSpeed(MOTION.celebrate)).toBe(0);
    const speeds = TIMES.map(liftSpeed);
    expect(Math.max(...speeds)).toBeCloseTo(1, 2);
    for (const v of speeds) expect(v).toBeLessThanOrEqual(1 + 1e-9);
  });
  it("lasts about 1–1.5 s", () => {
    expect(MOTION.celebrate).toBeGreaterThanOrEqual(1_000);
    expect(MOTION.celebrate).toBeLessThanOrEqual(1_500);
  });
});

describe("the balloon's surge", () => {
  const rises = TIMES.map(balloonRise);
  it("is whole rows, from rest and back to rest, never below it (no dip onto the slope)", () => {
    for (const r of rises) {
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
    }
    expect(balloonRise(0)).toBe(0);
    expect(balloonRise(MOTION.celebrate)).toBe(0);
  });
  it("leads by RISE_ROWS, with a small overshoot (a row past it) before 500 ms", () => {
    const peak = Math.max(...rises);
    expect(peak).toBe(RISE_ROWS + 1);
    expect(rises.indexOf(peak) * 10).toBeLessThan(500);
  });
  it("in the world it only climbs for the Summit's +70 m: never more than its one-row overshoot down from its best", () => {
    const world = TIMES.map((t) => 70 * liftProgress(t) + 5 * balloonRise(t));
    let best = -Infinity;
    for (const w of world) {
      best = Math.max(best, w);
      expect(w).toBeGreaterThanOrEqual(best - 5 - 1e-9);
    }
    expect(world[world.length - 1]).toBeCloseTo(70, 9);
  });
  it("is home by the time the card has landed (MOTION.land + its 250 ms wipe)", () => {
    expect(balloonRise(MOTION.land + MOTION.pop)).toBe(0);
    expect(balloonRise(MOTION.land)).toBeLessThanOrEqual(1);
  });
});

describe("the sway", () => {
  const sways = TIMES.map(balloonSway);
  it("is whole px, within 2 of centre, still at the start and the end", () => {
    for (const s of sways) {
      expect(Number.isInteger(s)).toBe(true);
      expect(Math.abs(s)).toBeLessThanOrEqual(2);
    }
    expect(balloonSway(0)).toBe(0);
    expect(balloonSway(MOTION.confetti)).toBe(0);
  });
  it("swings gently, 2 swings, damped, never a shake", () => {
    const sides = sways.filter((s) => s !== 0).map(Math.sign);
    const changes = sides.filter((s, i) => i > 0 && s !== sides[i - 1]).length;
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(changes).toBeLessThanOrEqual(4);
    const early = Math.max(...sways.slice(0, 90).map(Math.abs));
    const late = Math.max(...sways.slice(90).map(Math.abs));
    expect(early).toBe(2);
    expect(late).toBeLessThan(early);
    // Each position held at least 20 ms, a frame or more (whole-pixel steps, not a jitter).
    const runs: number[] = [];
    let run = 1;
    for (let i = 1; i < sways.length; i++) {
      if (sways[i] === sways[i - 1]) run++;
      else {
        runs.push(run);
        run = 1;
      }
    }
    expect(Math.min(...runs.slice(1)) * 10).toBeGreaterThanOrEqual(20);
  });
});

describe("the confetti", () => {
  const colours = confettiRoles(SUMMIT_M, "light");
  const seed = confettiSeed(SUMMIT_M);
  it("starts on the envelope's rim, outside it (so every bit shows at once)", () => {
    const first = confetti(seed, 70, colours);
    expect(first).toHaveLength(CONFETTI_BITS);
    for (const b of first) {
      expect(Math.hypot(b.dx, b.dy)).toBeGreaterThanOrEqual(4);
      expect(Math.hypot(b.dx, b.dy)).toBeLessThanOrEqual(10);
    }
  });
  it("pops up and out: by 400 ms the burst has risen and none has fallen, spread wider than the balloon", () => {
    const start = confetti(seed, 70, colours);
    const later = confetti(seed, 400, colours);
    expect(later).toHaveLength(CONFETTI_BITS);
    for (let i = 0; i < later.length; i++) expect(later[i].dy).toBeLessThanOrEqual(start[i].dy);
    const mean = (bits: { dy: number }[]) => bits.reduce((a, b) => a + b.dy, 0) / bits.length;
    expect(mean(later)).toBeLessThan(mean(start) - 4);
    const xs = later.map((b) => b.dx);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(16);
  });
  it("then rains down as the card lands", () => {
    const top = confetti(seed, 700, colours);
    const fall = confetti(seed, 1_300, colours);
    const mean = (bits: { dy: number }[]) => bits.reduce((a, b) => a + b.dy, 0) / bits.length;
    expect(mean(fall)).toBeGreaterThan(mean(top) + 6);
  });
  it("thins out and is all gone by MOTION.confetti (1.5–2 s), after the lift", () => {
    const counts = TIMES.map((t) => confetti(seed, t, colours).length);
    const peak = counts.indexOf(CONFETTI_BITS);
    for (let i = peak + 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    expect(confetti(seed, MOTION.confetti, colours)).toHaveLength(0);
    expect(confetti(seed, MOTION.confetti - 300, colours).length).toBeLessThan(CONFETTI_BITS);
    expect(confetti(seed, MOTION.celebrate, colours).length).toBeGreaterThan(CONFETTI_BITS / 2);
    expect(MOTION.confetti).toBeGreaterThanOrEqual(1_500);
    expect(MOTION.confetti).toBeLessThanOrEqual(2_000);
  });
  it("is crisp: whole pixels, 1×1 / 2×1 / 1×2, in its colours only; the zone's colours never single pixels (they'd read as stars)", () => {
    const shapes = new Set<string>();
    for (const theme of ["light", "dark"] as const) {
      for (const from of [1_500, 3_000, SUMMIT_M, 10_000, 12_500, 20_000, 45_000]) {
        const c = confettiRoles(from, theme);
        for (const t of TIMES) {
          for (const b of confetti(confettiSeed(from), t, c)) {
            expect(Number.isInteger(b.dx) && Number.isInteger(b.dy)).toBe(true);
            shapes.add(`${b.w}x${b.h}`);
            expect([...c.warm, ...c.zone]).toContain(b.role);
            if (b.w * b.h === 1) expect(c.warm).toContain(b.role);
          }
        }
      }
    }
    expect([...shapes].sort()).toEqual(["1x1", "1x2", "2x1"]);
  });
  it("tumbles: a bit turns from 2×1 to 1×2", () => {
    const tumbles = Array.from({ length: CONFETTI_BITS }, (_, i) => new Set(TIMES.map((t) => confetti(seed, t, colours)[i]).filter(Boolean).map((b) => `${b.w}x${b.h}`)));
    expect(tumbles.some((s) => s.has("2x1") && s.has("1x2"))).toBe(true);
  });
  it("is the same for the same seed, and nothing before the start", () => {
    expect(confetti(seed, 500, colours)).toEqual(confetti(seed, 500, colours));
    expect(confetti(seed, 500, colours)).not.toEqual(confetti(seed + 1, 500, colours));
    expect(confetti(seed, -1, colours)).toEqual([]);
  });
  it("is Ascend's persimmon and gold plus two of the zone's own; never the envelope's highlight in light", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const from of [500, 3_000, SUMMIT_M, 12_500, 20_000, 45_000]) {
        const c = confettiRoles(from, theme);
        expect(c.warm).toContain("moon");
        expect(c.warm.some((r) => ["marker", "balloon-shade", "balloon-light"].includes(r))).toBe(true);
        expect(c.zone).toHaveLength(2);
        if (theme === "light") expect(c.warm).not.toContain("balloon-light");
      }
    }
  });
});

describe("Reduce Motion's sparkles", () => {
  it("are four, still (no time in them), clear of the balloon's 7 px envelope", () => {
    const s = sparkles();
    expect(s).toHaveLength(4);
    expect(sparkles()).toEqual(s);
    for (const { dx } of s) expect(Math.abs(dx)).toBeGreaterThanOrEqual(6);
  });
});

describe("the timeline", () => {
  it("the card starts landing in the lift's last third and has landed (MOTION.land + its 250 ms wipe) by its end", () => {
    expect(MOTION.land).toBeGreaterThan((MOTION.celebrate * 2) / 3);
    expect(MOTION.land + MOTION.pop).toBeLessThanOrEqual(MOTION.celebrate);
    expect(liftProgress(MOTION.land)).toBeGreaterThan(0.8);
  });
  it("runs until the last bit is gone, then stops", () => {
    expect(celebrating(0)).toBe(true);
    expect(celebrating(MOTION.confetti - 1)).toBe(true);
    expect(celebrating(MOTION.confetti)).toBe(false);
    expect(celebrating(-1)).toBe(false);
  });
});

describe("what plays (nextRun)", () => {
  const base = { momentId: null as number | null, zoneFrom: SUMMIT_M, reduce: false, target: 8_873, view: 8_803, time: 10_000 };
  it("no moment: a normal lift", () => {
    expect(nextRun(null, base)).toEqual({ run: null, mode: "lift" });
  });
  it("a new moment starts a flight from where the view is, to the live height", () => {
    const { run, mode } = nextRun(null, { ...base, momentId: 1 });
    expect(mode).toBe("flight");
    expect(run!.flight).toEqual({ began: 10_000, from: 8_803, to: 8_873, shift: null });
    expect(run!.counted).toBe(false);
  });
  it("the same moment again carries on with the same clock (a re-render, Strict Mode, the card closing)", () => {
    const first = nextRun(null, { ...base, momentId: 1 }).run!;
    const again = nextRun(first, { ...base, momentId: 1, time: 10_300, view: 8_850 });
    expect(again.mode).toBe("flight");
    expect(again.run).toBe(first);
    expect(nextRun(first, { ...base, momentId: null, time: 10_600 })).toEqual({ run: first, mode: "flight" });
  });
  it("a new height mid-flight re-aims it without a jump; the same height changes nothing", () => {
    const first = nextRun(null, { ...base, momentId: 1 }).run!;
    const moved = nextRun(first, { ...base, momentId: 1, target: 8_943, time: 10_500 });
    expect(moved.mode).toBe("flight");
    expect(flightAt(moved.run!.flight, 10_500).altitude).toBeCloseTo(flightAt(first.flight, 10_500).altitude, 9);
    expect(flightAt(moved.run!.flight, 14_000).altitude).toBeCloseTo(8_943, 9);
    expect(nextRun(moved.run, { ...base, momentId: 1, target: 8_943, time: 10_600 }).run).toBe(moved.run);
  });
  it("once over, a normal lift: the same moment never replays", () => {
    const first = nextRun(null, { ...base, momentId: 1 }).run!;
    expect(nextRun(first, { ...base, momentId: 1, time: 10_000 + MOTION.confetti + 1 }).mode).toBe("lift");
  });
  it("with Reduce Motion a new moment is seen still, and never plays when motion comes back", () => {
    const still = nextRun(null, { ...base, momentId: 1, reduce: true });
    expect(still.mode).toBe("lift");
    expect(still.run!.counted).toBe(true);
    expect(nextRun(still.run, { ...base, momentId: 1, reduce: false, time: 10_100 }).mode).toBe("lift");
  });
  it("Reduce Motion coming on mid-flight jumps to the end, and turning it off doesn't replay it", () => {
    const first = nextRun(null, { ...base, momentId: 1 }).run!;
    const cut = nextRun(first, { ...base, momentId: 1, reduce: true, time: 10_400 });
    expect(cut.mode).toBe("lift");
    expect(nextRun(cut.run, { ...base, momentId: 1, reduce: false, time: 10_500 }).mode).toBe("lift");
  });
  it("a second moment starts its own flight from where the view is", () => {
    const first = nextRun(null, { ...base, momentId: 1 }).run!;
    const second = nextRun(first, { ...base, momentId: 2, time: 10_200, view: 8_820 });
    expect(second.run!.id).toBe(2);
    expect(second.run!.flight.from).toBe(8_820);
  });
});

describe("the held lift's rules", () => {
  const hold = { id: 3, day: "2026-11-26", cm: 880_300 };
  it("a crossing save holds the strip, unless one already does", () => {
    expect(holdOnSave(null, { id: 3, day: "2026-11-26", cm: 880_300, holds: true })).toEqual(hold);
    expect(holdOnSave(null, { id: 3, day: "2026-11-26", cm: 880_300, holds: false })).toBeNull();
    expect(holdOnSave(hold, { id: 4, day: "2026-11-26", cm: 887_300, holds: true })).toBe(hold);
  });
  it("only its own answer (or the cap, by its id) releases it", () => {
    expect(holdReleased(hold, 3)).toBeNull();
    expect(holdReleased(hold, 4)).toBe(hold);
    expect(holdReleased(null, 3)).toBeNull();
  });
  it("the strip shows the held height, never above the live one, and only on the hold's day", () => {
    expect(stripAltitude(887_300, hold, "2026-11-26")).toBe(880_300);
    expect(stripAltitude(870_000, hold, "2026-11-26")).toBe(870_000);
    expect(stripAltitude(887_300, hold, "2026-11-27")).toBe(887_300);
    expect(stripAltitude(887_300, null, "2026-11-26")).toBe(887_300);
  });
  it("a moment shows only if no undo (of any habit) came after its save, and Today is shown", () => {
    expect(momentMayShow(5, 0, true)).toBe(true);
    expect(momentMayShow(5, 4, true)).toBe(true);
    expect(momentMayShow(5, 6, true)).toBe(false);
    expect(momentMayShow(5, 0, false)).toBe(false);
  });
});

describe("the flight (the view through a celebration)", () => {
  const flight = { began: 1_000, from: 8_800, to: 8_870, shift: null };
  it("goes from where the view was to the zone's height, and is over once the confetti is", () => {
    expect(flightAt(flight, 1_000).altitude).toBe(8_800);
    expect(flightAt(flight, 1_000 + MOTION.celebrate).altitude).toBe(8_870);
    expect(flightAt(flight, 1_000 + MOTION.confetti - 1).done).toBe(false);
    expect(flightAt(flight, 1_000 + MOTION.confetti).done).toBe(true);
  });
  it("re-aimed mid-flight (a habit completed or undone): no jump, and it ends on the new target", () => {
    for (const target of [8_940, 8_800, 8_870]) {
      for (const at of [1_100, 1_500, 2_000, 2_250, 2_900]) {
        const before = flightAt(flight, at).altitude;
        const moved = retarget(flight, at, target);
        expect(flightAt(moved, at).altitude).toBeCloseTo(before, 9);
        // Then smoothly: no frame more than a normal lift's step away from the last.
        let last = before;
        for (let t = at; t <= at + 3_000; t += 16) {
          const a = flightAt(moved, t).altitude;
          expect(Math.abs(a - last)).toBeLessThan(15);
          last = a;
        }
        expect(flightAt(moved, at + 3_000).altitude).toBeCloseTo(target, 9);
        expect(flightAt(moved, at + 3_000).done).toBe(true);
        // Not over while it's still easing to the new target.
        expect(flightAt(moved, at + MOTION.lift - 20).done).toBe(false);
      }
    }
  });
  it("re-aimed twice: still continuous, and on the last target", () => {
    const once = retarget(flight, 1_400, 8_940);
    const mid = flightAt(once, 1_600).altitude;
    const twice = retarget(once, 1_600, 8_800);
    expect(flightAt(twice, 1_600).altitude).toBeCloseTo(mid, 9);
    expect(flightAt(twice, 5_000).altitude).toBeCloseTo(8_800, 9);
  });
});

describe("the held lift (liftHoldFor)", () => {
  it("holds exactly when an ok save would be a moment", () => {
    for (const celebrated of [-1, 4, 5, 6]) {
      for (const [beforeCm, afterCm] of [[880_000, 887_000], [870_000, 880_000], [887_000, 894_000], [887_000, 880_000], [149_000, 150_000]]) {
        const climb = { beforeCm, afterCm };
        expect(liftHoldFor(climb, celebrated)).toBe(zoneMomentAfterSave(climb, { ok: true }, celebrated) !== null);
      }
    }
  });
  it("never for an undo or a step inside a zone", () => {
    expect(liftHoldFor({ beforeCm: 887_000, afterCm: 880_000 }, -1)).toBe(false);
    expect(liftHoldFor({ beforeCm: 870_000, afterCm: 880_000 }, -1)).toBe(false);
    expect(liftHoldFor({ beforeCm: 880_000, afterCm: 887_000 }, 4)).toBe(true);
    expect(liftHoldFor({ beforeCm: 880_000, afterCm: 887_000 }, 5)).toBe(false);
  });
});
