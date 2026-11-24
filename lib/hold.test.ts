import { describe, expect, it } from "vitest";
import { IDLE, fillRadius, next, type HoldEffect, type HoldEvent, type HoldMode, type HoldState } from "./hold";

/** Runs events in order and collects every effect, like the component would. */
function run(events: HoldEvent[], options: { mode?: HoldMode; start?: HoldState } = {}) {
  let state = options.start ?? IDLE;
  const effects: HoldEffect["type"][] = [];
  for (const event of events) {
    const step = next(state, event, options.mode);
    state = step.state;
    effects.push(...step.effects.map((e) => e.type));
  }
  return { state, effects };
}

const P = { x: 100, y: 40 };
const down = (done = false, extra: Partial<Extract<HoldEvent, { type: "pointerdown" }>> = {}): HoldEvent => ({
  type: "pointerdown",
  pointerId: 1,
  button: 0,
  isPrimary: true,
  point: P,
  done,
  time: 0,
  ...extra,
});
const up = (point = P, time = 100): HoldEvent => ({ type: "pointerup", pointerId: 1, point, time });
const move = (dx: number): HoldEvent => ({ type: "pointermove", pointerId: 1, point: { x: P.x + dx, y: P.y } });
const finish: HoldEvent = { type: "finish" };
const keydown = (key: string, done: boolean, repeat = false): HoldEvent => ({ type: "keydown", key, done, repeat });
const keyup = (key: string): HoldEvent => ({ type: "keyup", key });

describe("holding with a finger or mouse", () => {
  it("completes once the fill finishes, and lifting afterwards does nothing more", () => {
    expect(run([down(), finish, up()]).effects).toEqual(["start-fill", "complete"]);
  });

  it("letting go early cancels and shows the hint", () => {
    const { effects, state } = run([down(), up()]);
    expect(effects).toEqual(["start-fill", "cancel-fill", "hint"]);
    expect(state).toEqual(IDLE);
  });

  it("moving more than 10 px is a scroll: cancelled, no hint, no completion later", () => {
    expect(run([down(), move(5), finish]).effects).toEqual(["start-fill", "complete"]);
    expect(run([down(), move(30), finish, up()]).effects).toEqual(["start-fill", "cancel-fill"]);
  });

  it("a finish that arrives after the finger lifted or the browser cancelled is ignored", () => {
    expect(run([down(), up(), finish]).effects).not.toContain("complete");
    expect(run([down(), { type: "pointercancel", pointerId: 1 }, finish]).effects).toEqual(["start-fill", "cancel-fill"]);
  });

  it("losing capture, focus or the page mid-hold cancels it", () => {
    expect(run([down(), { type: "interrupt" }, finish]).effects).toEqual(["start-fill", "cancel-fill"]);
  });

  it("ignores right-clicks and a second finger", () => {
    expect(run([down(false, { button: 2 }), finish]).effects).toEqual([]);
    expect(run([down(false, { isPrimary: false }), finish]).effects).toEqual([]);
  });

  it("ignores events from a different pointer", () => {
    const other: HoldEvent = { type: "pointerup", pointerId: 2, point: P, time: 100 };
    expect(run([down(), other, finish]).effects).toEqual(["start-fill", "complete"]);
  });
});

describe("undo by tapping a done key", () => {
  it("a short tap on a key that was done when pressed undoes it", () => {
    expect(run([down(true), up()]).effects).toEqual(["undo"]);
  });

  it("a LONG press on a done key doesn't undo it (someone checking it registered)", () => {
    expect(run([down(true), up(P, 2000)]).effects).toEqual([]);
    expect(run([down(true), up(P, 640)]).effects).toEqual(["undo"]);
  });

  it("a cancelled or interrupted tap on a done key doesn't undo", () => {
    expect(run([down(true), { type: "pointercancel", pointerId: 1 }, up()]).effects).toEqual([]);
    expect(run([down(true), { type: "interrupt" }, up()]).effects).toEqual([]);
  });

  it("a tap that drifts away (a scroll) doesn't undo", () => {
    expect(run([down(true), move(30), up({ x: P.x + 30, y: P.y })]).effects).toEqual([]);
  });

  it("finishing a hold never undoes it: lifting the same finger does nothing", () => {
    expect(run([down(false), finish, up()]).effects).toEqual(["start-fill", "complete"]);
  });

  it("nothing left over from a long press can eat the next tap (Android sends no click)", () => {
    // Long hold completes, no click arrives, then a real tap minutes later.
    const { state } = run([down(false), finish, up()]);
    expect(run([down(true), up()], { start: state }).effects).toEqual(["undo"]);
  });
});

describe("clicks", () => {
  it("a click right after a pointer or key sequence belongs to it and does nothing", () => {
    expect(run([{ type: "click", msSinceSequence: 30, done: true }]).effects).toEqual([]);
    expect(run([{ type: "click", msSinceSequence: 30, done: false }]).effects).toEqual([]);
  });

  it("a click on its own (VoiceOver double-tap, Switch Control) completes, or undoes a done key", () => {
    expect(run([{ type: "click", msSinceSequence: Infinity, done: false }]).effects).toEqual(["complete"]);
    expect(run([{ type: "click", msSinceSequence: 5000, done: true }]).effects).toEqual(["undo"]);
  });

  it("a click during a hold does nothing", () => {
    expect(run([down(), { type: "click", msSinceSequence: Infinity, done: false }, up()]).effects).toEqual([
      "start-fill",
      "cancel-fill",
      "hint",
    ]);
  });
});

describe("keyboard", () => {
  it("holding Space completes once and stays done, despite auto-repeat", () => {
    const repeats = Array.from({ length: 20 }, () => keydown(" ", true, true));
    const { effects } = run([keydown(" ", false), finish, ...repeats, keyup(" ")]);
    expect(effects).toEqual(["start-fill", "complete"]);
  });

  it("releasing Space early cancels and hints", () => {
    expect(run([keydown(" ", false), keyup(" ")]).effects).toEqual(["start-fill", "cancel-fill", "hint"]);
  });

  it("Enter or Space on a done key undoes on keydown, and the keyup does nothing more", () => {
    expect(run([keydown("Enter", true), keyup("Enter")]).effects).toEqual(["undo"]);
    expect(run([keydown(" ", true, false), keydown(" ", false, true), keyup(" ")]).effects).toEqual(["undo"]);
  });

  it("the keyup that ends a completed hold does nothing", () => {
    expect(run([keydown("Enter", false), finish, keyup("Enter")]).effects).toEqual(["start-fill", "complete"]);
  });

  it("a pointer press during a keyboard hold is ignored, and a different key's keyup doesn't end it", () => {
    expect(run([keydown("Enter", false), down(false), keyup(" "), finish]).effects).toEqual(["start-fill", "complete"]);
  });

  it("a finish after the press was already decided is ignored", () => {
    expect(run([keydown("Enter", false), finish, finish, keyup("Enter")]).effects).toEqual(["start-fill", "complete"]);
    expect(run([down(), finish, finish, up()]).effects).toEqual(["start-fill", "complete"]);
  });

  it("other keys are ignored", () => {
    expect(run([keydown("a", false), keydown("Tab", false), finish]).effects).toEqual([]);
  });

  it("focus leaving mid-hold cancels it", () => {
    expect(run([keydown(" ", false), { type: "interrupt" }, finish, keyup(" ")]).effects).toEqual([
      "start-fill",
      "cancel-fill",
    ]);
  });
});

describe("Tap to complete mode", () => {
  it("a short tap completes, and a tap on a done key undoes", () => {
    expect(run([down(false), up()], { mode: "tap" }).effects).toEqual(["complete"]);
    expect(run([down(true), up()], { mode: "tap" }).effects).toEqual(["undo"]);
  });
  it("no fill, no hint; a scroll still doesn't count", () => {
    expect(run([down(false), move(30), up({ x: P.x + 30, y: P.y })], { mode: "tap" }).effects).toEqual([]);
  });
  it("Space or Enter completes straight away", () => {
    expect(run([keydown(" ", false), keyup(" ")], { mode: "tap" }).effects).toEqual(["complete"]);
  });
});

describe("fillRadius", () => {
  it("reaches the farthest corner from the touch point", () => {
    expect(fillRadius(300, 100, { x: 0, y: 0 })).toBe(Math.ceil(Math.hypot(300, 100)));
    expect(fillRadius(300, 100, { x: 300, y: 100 })).toBe(Math.ceil(Math.hypot(300, 100)));
    expect(fillRadius(300, 100, { x: 100, y: 50 })).toBe(Math.ceil(Math.hypot(200, 50)));
  });
  it("grows from the centre for the keyboard", () => {
    expect(fillRadius(300, 100, null)).toBe(Math.ceil(Math.hypot(150, 50)));
  });
});
