// The press-and-hold gesture on a habit key, as one pure state machine
// (plans/habit-tracker.md, Feature 3, "The gesture").
//
// The component (components/habit-key.tsx) turns browser events into
// HoldEvents, feeds them to next(), and carries out the effects it returns
// (start or cancel the fill animation, complete, undo, show the hint).
// Everything that decides WHAT happens lives here, so it can be tested
// sequence by sequence: auto-repeating keys, a click after a long press, a
// finish that arrives after the finger has gone.

import { MOTION } from "./motion";

/** How long a press has to last to complete a habit. */
export const HOLD_MS = MOTION.hold;
/** How far a finger may drift during a hold before it counts as a scroll. */
export const MOVE_TOLERANCE_PX = 10;
/** A click this soon after a pointer or key sequence belongs to it, not to assistive tech. */
export const CLICK_AFTER_SEQUENCE_MS = 1000;
/** How long "Keep holding…" stays up. */
export const HINT_MS = 1500;

export type Point = { x: number; y: number };

export type HoldState =
  | { kind: "idle" }
  /** A finger or mouse is holding a not-done key; the fill is growing. */
  | { kind: "pointer-hold"; pointerId: number; origin: Point; startedAt: number }
  /**
   * A short tap is expected: the key was done when the press began (a tap
   * undoes), or "Tap to complete" is on (a tap completes).
   */
  | { kind: "pointer-tap"; pointerId: number; origin: Point; wasDone: boolean; startedAt: number }
  /** A pointer press that has been decided (completed, cancelled): wait for it to lift. */
  | { kind: "pointer-spent"; pointerId: number }
  /** Space or Enter is holding a not-done key. */
  | { kind: "key-hold"; key: string; startedAt: number }
  /** The key press has been decided: wait for keyup. */
  | { kind: "key-spent"; key: string };

export type HoldEvent =
  /** Points are in viewport coordinates (clientX/Y), so the key moving under the finger isn't a "move". `time`: ms. */
  | { type: "pointerdown"; pointerId: number; button: number; isPrimary: boolean; point: Point; done: boolean; time: number }
  | { type: "pointermove"; pointerId: number; point: Point }
  | { type: "pointerup"; pointerId: number; point: Point; time: number }
  | { type: "pointercancel"; pointerId: number }
  | { type: "keydown"; key: string; repeat: boolean; done: boolean; time: number }
  | { type: "keyup"; key: string; time: number }
  /** A click. `msSinceSequence`: time since the last pointer or key sequence on this key ended (Infinity if none). */
  | { type: "click"; msSinceSequence: number; done: boolean }
  /** The fill animation reached the end. */
  | { type: "finish" }
  /** Focus left, the page was hidden, or the pointer capture was lost: stop whatever is going on. */
  | { type: "interrupt" };

export type HoldEffect =
  | { type: "start-fill"; origin: Point | null }
  | { type: "cancel-fill" }
  /**
   * `held`: the hold itself finished (a finger, mouse, or Space / Enter
   * held to the end), so this person can hold. False for a tap in "Tap to
   * complete" mode and for a lone click from assistive tech.
   */
  | { type: "complete"; held: boolean }
  | { type: "undo" }
  /**
   * Let go before the hold finished: show "Keep holding…". `by`: a short
   * tap with a finger or mouse ("pointer"), or Space / Enter let go
   * ("key"), after `heldMs`. Only quick ones count toward the Tap to
   * complete hint (lib/tap-hint.ts).
   */
  | { type: "hint"; by: "pointer" | "key"; heldMs: number };

export type HoldMode = "hold" | "tap";

export type Step = { state: HoldState; effects: HoldEffect[] };

export const IDLE: HoldState = { kind: "idle" };

const ACTIVATION_KEYS = new Set([" ", "Enter"]);

export function isActivationKey(key: string): boolean {
  return ACTIVATION_KEYS.has(key);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * What happens next. `mode` is "hold" normally, or "tap" when "Tap to
 * complete" is switched on (then a short tap completes, no fill).
 */
export function next(state: HoldState, event: HoldEvent, mode: HoldMode = "hold"): Step {
  const stay: Step = { state, effects: [] };

  switch (event.type) {
    case "pointerdown": {
      // Only the main button of the main pointer (no right-clicks, no
      // second finger). Any new press starts fresh, so nothing left over
      // from an earlier gesture can affect it.
      if (event.button !== 0 || !event.isPrimary) return stay;
      if (state.kind === "key-hold") return stay; // keyboard is already holding
      if (event.done || mode === "tap") {
        return {
          state: { kind: "pointer-tap", pointerId: event.pointerId, origin: event.point, wasDone: event.done, startedAt: event.time },
          effects: [],
        };
      }
      return {
        state: { kind: "pointer-hold", pointerId: event.pointerId, origin: event.point, startedAt: event.time },
        effects: [{ type: "start-fill", origin: event.point }],
      };
    }

    case "pointermove": {
      if (state.kind !== "pointer-hold" && state.kind !== "pointer-tap") return stay;
      if (state.pointerId !== event.pointerId) return stay;
      if (distance(state.origin, event.point) <= MOVE_TOLERANCE_PX) return stay;
      // Moved too far: they're scrolling, not pressing.
      const effects: HoldEffect[] = state.kind === "pointer-hold" ? [{ type: "cancel-fill" }] : [];
      return { state: { kind: "pointer-spent", pointerId: state.pointerId }, effects };
    }

    case "pointerup": {
      if (!("pointerId" in state) || state.pointerId !== event.pointerId) return stay;
      if (state.kind === "pointer-hold") {
        // Let go far from where it started (moves can arrive merged into
        // the release): a scroll, not a press.
        if (distance(state.origin, event.point) > MOVE_TOLERANCE_PX) return { state: IDLE, effects: [{ type: "cancel-fill" }] };
        // Let go before the fill finished: not done. Teach the gesture.
        const heldMs = Math.max(0, event.time - state.startedAt);
        return { state: IDLE, effects: [{ type: "cancel-fill" }, { type: "hint", by: "pointer", heldMs }] };
      }
      if (state.kind === "pointer-tap") {
        if (distance(state.origin, event.point) > MOVE_TOLERANCE_PX) return { state: IDLE, effects: [] };
        // In hold mode, undo is a TAP. Someone who has learned "hold to
        // complete" and holds a done key again (to check it registered)
        // mustn't undo it by letting go.
        if (mode === "hold" && event.time - state.startedAt >= HOLD_MS) return { state: IDLE, effects: [] };
        // A short tap: undo a key that was done, or complete one in "Tap to
        // complete" mode (the only way pointer-tap starts on a not-done key).
        return { state: IDLE, effects: [state.wasDone ? { type: "undo" } : { type: "complete", held: false }] };
      }
      return { state: IDLE, effects: [] }; // pointer-spent: the press was already decided
    }

    case "pointercancel": {
      if (!("pointerId" in state) || state.pointerId !== event.pointerId) return stay;
      return { state: IDLE, effects: state.kind === "pointer-hold" ? [{ type: "cancel-fill" }] : [] };
    }

    case "keydown": {
      if (!isActivationKey(event.key)) return stay;
      // Auto-repeat while a key is held down is ignored: holding Space
      // completes once and stays done.
      if (event.repeat) return stay;
      if (state.kind !== "idle") return stay;
      if (event.done) return { state: { kind: "key-spent", key: event.key }, effects: [{ type: "undo" }] };
      if (mode === "tap") return { state: { kind: "key-spent", key: event.key }, effects: [{ type: "complete", held: false }] };
      return { state: { kind: "key-hold", key: event.key, startedAt: event.time }, effects: [{ type: "start-fill", origin: null }] };
    }

    case "keyup": {
      if (state.kind === "key-hold" && state.key === event.key) {
        const heldMs = Math.max(0, event.time - state.startedAt);
        return { state: IDLE, effects: [{ type: "cancel-fill" }, { type: "hint", by: "key", heldMs }] };
      }
      if (state.kind === "key-spent" && state.key === event.key) return { state: IDLE, effects: [] };
      return stay;
    }

    case "finish": {
      // Only a hold that's still going completes. A finish that arrives
      // after the finger lifted or the page was hidden is ignored.
      if (state.kind === "pointer-hold") {
        return { state: { kind: "pointer-spent", pointerId: state.pointerId }, effects: [{ type: "complete", held: true }] };
      }
      if (state.kind === "key-hold") return { state: { kind: "key-spent", key: state.key }, effects: [{ type: "complete", held: true }] };
      return stay;
    }

    case "click": {
      // Clicks that belong to a pointer or key sequence were already
      // handled (or deliberately not). A click on its own, with nothing
      // before it, comes from assistive tech (VoiceOver double-tap, Switch
      // Control), which can't hold: it completes, or undoes a done key.
      if (state.kind !== "idle" || event.msSinceSequence < CLICK_AFTER_SEQUENCE_MS) return stay;
      return { state, effects: [event.done ? { type: "undo" } : { type: "complete", held: false }] };
    }

    case "interrupt": {
      if (state.kind === "pointer-hold" || state.kind === "key-hold") return { state: IDLE, effects: [{ type: "cancel-fill" }] };
      return state.kind === "idle" ? stay : { state: IDLE, effects: [] };
    }
  }
}

/**
 * The radius the fill needs to cover the whole key from `point` (the
 * distance to the farthest corner). `point` is relative to the key's
 * top-left; null (keyboard) grows from the centre.
 */
export function fillRadius(width: number, height: number, point: Point | null): number {
  const { x, y } = point ?? { x: width / 2, y: height / 2 };
  const dx = Math.max(x, width - x);
  const dy = Math.max(y, height - y);
  return Math.ceil(Math.hypot(dx, dy));
}

