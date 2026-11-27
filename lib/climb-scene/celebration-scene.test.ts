// The zone celebration in Today's strip (Feature 10h): the scene draws the
// balloon where the celebration says, its confetti never over the balloon,
// and confetti colours that stand out from what's behind it.
import { describe, expect, it } from "vitest";
import { ZONES } from "../altitude";
import { confetti, confettiRoles, confettiSeed, sparkles } from "../celebration";
import { SCENE_PALETTE, contrast } from "../palette";
import { ENVELOPE_ABOVE, ROLES, closeBalloonAt, drawClose, type CloseOptions, type Role } from "./scene";

const BALLOON: Role[] = ["marker", "balloon-light", "balloon-shade", "basket", "marker-ring", "marker-edge"];
const role = (r: Role) => ROLES.indexOf(r);

const at = (altitude: number, theme: "light" | "dark" = "light"): CloseOptions => ({ width: 117, height: 47, theme, time: 0, altitude, you: altitude - 70, driftMs: 700 });

/** The basket's box (its role's pixels). */
function basket(px: Uint8Array, width: number) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  px.forEach((v, i) => {
    if (v !== role("basket")) return;
    const x = i % width, y = Math.floor(i / width);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  return { x0, x1, y0, y1 };
}

describe("the celebration in the strip", () => {
  it("streaks the sky while the view climbs: more with speed, sky only, never on the balloon, moving down as you rise", () => {
    for (const theme of ["light", "dark"] as const) {
      const o = at(8_870, theme);
      const plain = drawClose(o).px;
      const changedAt = (streaks: number, altitude = 8_870) => {
        const a = drawClose({ ...o, altitude });
        const b = drawClose({ ...o, altitude, streaks });
        const out: number[] = [];
        for (let i = 0; i < a.px.length; i++) {
          if (a.px[i] !== b.px[i]) {
            out.push(i);
            expect(ROLES[b.px[i]]).toBe("cloud-light");
            expect(ROLES[a.px[i]].startsWith("sky") || ROLES[a.px[i]].startsWith("space")).toBe(true);
          }
        }
        return out;
      };
      expect(drawClose({ ...o, streaks: 0 }).px).toEqual(plain);
      const few = changedAt(0.3).length;
      const many = changedAt(1).length;
      expect(many).toBeGreaterThan(20);
      expect(few).toBeLessThan(many);
      // Seeded by height in the near layer: 10 m up, the same streaks 2 rows lower.
      const here = new Set(changedAt(1, 8_870));
      const up = changedAt(1, 8_880);
      const lower = up.filter((i) => here.has(i - 2 * o.width)).length;
      expect(lower / up.length).toBeGreaterThan(0.5);
    }
  });
  it("draws the balloon risen and swayed by exactly what it's told", () => {
    const o = at(8_870);
    const rest = basket(drawClose(o).px, o.width);
    for (const [rise, sway] of [[7, 2], [3, -2], [-1, 1]]) {
      const moved = basket(drawClose({ ...o, rise, sway }).px, o.width);
      expect(moved).toEqual({ x0: rest.x0 + sway, x1: rest.x1 + sway, y0: rest.y0 - rise, y1: rest.y1 - rise });
    }
  });
  it("never draws confetti over the balloon or its ring, and only in its own colours", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const altitude of [1_520, 5_020, 8_870, 12_520, 20_020]) {
        const colours = confettiRoles(altitude - 20, theme);
        const roles = [...colours.warm, ...colours.zone];
        for (const t of [300, 600, 1_000, 1_500]) {
          const o = { ...at(altitude, theme), rise: 3, sway: 1, anchor: altitude };
          const plain = drawClose(o).px;
          const bits = confetti(confettiSeed(altitude), t, colours);
          const party = drawClose({ ...o, confetti: bits }).px;
          let changed = 0;
          for (let i = 0; i < plain.length; i++) {
            if (BALLOON.includes(ROLES[plain[i]])) expect(party[i], `${altitude} m ${theme} t ${t}`).toBe(plain[i]);
            if (party[i] !== plain[i]) {
              changed++;
              expect(roles).toContain(ROLES[party[i]]);
            }
          }
          expect(changed, `${altitude} m ${theme} t ${t}: some confetti shows`).toBeGreaterThan(5);
        }
      }
    }
  });
  it("anchors the burst at the zone's height: it doesn't step as the view settles", () => {
    // Near the floor the balloon's resting row moves with the view (Forest at 500 m).
    const bits = confetti(1, 400, { warm: ["moon"], zone: [] });
    const a = drawClose({ ...at(480), you: 400, confetti: bits, anchor: 520 }).px;
    const b = drawClose({ ...at(520), you: 400, confetti: bits, anchor: 520 }).px;
    const moons = (px: Uint8Array) => [...px.keys()].filter((i) => px[i] === role("moon"));
    expect(moons(a)).toEqual(moons(b));
  });
  it("Reduce Motion's sparkles: four gold crosses beside the balloon, nothing else", () => {
    const o = at(8_870);
    const plain = drawClose(o).px;
    const still = drawClose({ ...o, sparkles: sparkles() }).px;
    const changed = [...still.keys()].filter((i) => still[i] !== plain[i]);
    expect(changed.length).toBeGreaterThanOrEqual(16);
    expect(changed.length).toBeLessThanOrEqual(20);
    for (const i of changed) expect(ROLES[still[i]]).toBe("moon");
  });
  it("each zone's confetti stands out from what's behind the balloon there (1.8:1, light and dark), and none looks like a star", () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const apart = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    for (const z of ZONES.slice(1)) {
      for (const theme of ["light", "dark"] as const) {
        const colours = confettiRoles(z.from, theme);
        const o = at(z.from + 20, theme);
        const c = drawClose(o);
        const b = closeBalloonAt(o);
        // The backdrop: the commonest role where the burst flies (the balloon aside).
        const counts = new Map<Role, number>();
        for (let y = b.y - ENVELOPE_ABOVE - 16; y <= b.y - ENVELOPE_ABOVE + 10; y++) {
          for (let x = b.x - 19; x <= b.x + 19; x++) {
            const r = ROLES[c.get(x, y)];
            if (!BALLOON.includes(r)) counts.set(r, (counts.get(r) ?? 0) + 1);
          }
        }
        const backdrop = [...counts].sort((p, q) => q[1] - p[1])[0][0];
        const p = SCENE_PALETTE[theme];
        // The zone's two, each; of the warm ones, at least one (persimmon or gold).
        for (const r of colours.zone) expect(contrast(p[r], p[backdrop]), `${z.name}, ${theme}: ${r} on ${backdrop}`).toBeGreaterThanOrEqual(1.8);
        expect(Math.max(...colours.warm.map((r) => contrast(p[r], p[backdrop]))), `${z.name}, ${theme}: warm on ${backdrop}`).toBeGreaterThanOrEqual(1.8);
        // Not star-coloured: well apart from both star shades (RGB distance).
        for (const r of [...colours.warm, ...colours.zone]) {
          expect(Math.min(apart(p[r], p.star), apart(p[r], p["star-dim"])), `${z.name}, ${theme}: ${r} vs the stars`).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });
});
