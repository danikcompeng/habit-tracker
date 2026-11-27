"use client";

// One habit on Today: a big key you press and hold to complete, and tap to
// undo (plans/habit-tracker.md, Feature 3). All the rules about WHAT
// happens live in lib/hold.ts; this file turns browser events into its
// events and draws the result: the fill under your finger, the pop, the dots.

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Dots } from "@/components/dots";
import { CheckIcon } from "@/components/icons";
import { HINT_MS, HOLD_MS, IDLE, fillRadius, isActivationKey, next, type HoldEvent, type HoldMode, type HoldState, type Point } from "@/lib/hold";
import { EASE_GLIDE, EASE_OUT, MOTION } from "@/lib/motion";
import type { Dot } from "@/lib/streaks";
import { dotsSummary, streakRose, streakText } from "@/lib/today";

export type KeyHabit = { id: string; name: string; done: boolean; streak: number; dots: Dot[] };

type Props = {
  habit: KeyHabit;
  mode: HoldMode;
  /** `held`: completed by holding it to the end (not a tap in Tap to complete mode, not assistive tech). */
  onComplete: (habit: KeyHabit, how: { held: boolean }) => void;
  onUndo: (habit: KeyHabit) => void;
  /** "Keep holding…": the parent announces it. */
  onHint: (habit: KeyHabit, release: { by: "pointer" | "key"; heldMs: number }) => void;
  /** A hold started or ended, so the page doesn't refresh under a finger. */
  onHoldingChange: (holding: boolean) => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HabitKey({ habit, mode, onComplete, onUndo, onHint, onHoldingChange }: Props) {
  const keyRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const state = useRef<HoldState>(IDLE);
  const fill = useRef<Animation | null>(null);
  // When this key last saw a pointer or key event: a click soon after
  // belongs to that sequence (see lib/hold.ts "click").
  const lastSequenceAt = useRef(-Infinity);
  const [hint, setHint] = useState(false);
  const [justDone, setJustDone] = useState(false);
  // While the hold fill is on the key (and while a cancelled fill shrinks
  // back), the grey streak caption turns ink: grey on the fill is 3.5:1.
  const [filled, setFilled] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Always the latest props, for event handlers and animation callbacks.
  const latest = useRef({ habit, mode, onComplete, onUndo, onHint, onHoldingChange });
  useEffect(() => {
    latest.current = { habit, mode, onComplete, onUndo, onHint, onHoldingChange };
  });

  function dispatch(event: HoldEvent) {
    const { mode: currentMode } = latest.current;
    const wasHolding = state.current.kind === "pointer-hold" || state.current.kind === "key-hold";
    const step = next(state.current, event, currentMode);
    state.current = step.state;
    const isHolding = step.state.kind === "pointer-hold" || step.state.kind === "key-hold";
    if (wasHolding !== isHolding) latest.current.onHoldingChange(isHolding);
    if (isHolding) setFilled(true);
    let shrinking = false;
    for (const effect of step.effects) {
      if (effect.type === "start-fill") startFill(effect.origin);
      else if (effect.type === "cancel-fill") shrinking = cancelFill();
      else if (effect.type === "complete") complete(effect.held);
      else if (effect.type === "undo") latest.current.onUndo(latest.current.habit);
      else if (effect.type === "hint") showHint(effect);
    }
    // The hold is over: the caption goes back to grey now, or, if the fill
    // is shrinking back, once it's gone (cancelFill).
    if (wasHolding && !isHolding && !shrinking) setFilled(false);
  }

  /** `clientOrigin`: where the finger is, in viewport coordinates (null: keyboard). */
  function startFill(clientOrigin: Point | null) {
    const key = keyRef.current;
    const el = fillRef.current;
    if (!key || !el) return;
    fill.current?.cancel();
    const { width, height, left, top } = key.getBoundingClientRect();
    const origin = clientOrigin && { x: clientOrigin.x - left, y: clientOrigin.y - top };
    let animation: Animation;
    if (prefersReducedMotion()) {
      // Reduce Motion: no growing circle; the tint fades in over the whole
      // key. It starts at about a third, so the press shows at once (from 0
      // the first half of the hold would be as faint as the old tint).
      Object.assign(el.style, { left: "0", top: "0", width: "100%", height: "100%", borderRadius: "0" });
      animation = el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: HOLD_MS, easing: "linear", fill: "forwards" });
    } else {
      // A circle centred on the finger, big enough to reach the far corner.
      const r = fillRadius(width, height, origin);
      const { x, y } = origin ?? { x: width / 2, y: height / 2 };
      Object.assign(el.style, { left: `${x - r}px`, top: `${y - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, borderRadius: "9999px" });
      animation = el.animate(
        [
          { transform: "scale(0)", opacity: 1 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: HOLD_MS, easing: "linear", fill: "forwards" },
      );
    }
    // The animation reaching its end IS the trigger, so what you see and
    // what happens can't drift apart. lib/hold.ts ignores it if the hold
    // was cancelled in the meantime.
    animation.onfinish = () => {
      if (fill.current === animation) dispatch({ type: "finish" });
    };
    fill.current = animation;
  }

  /** Shrinks the fill back; true if there was one (it's still on screen). */
  function cancelFill(): boolean {
    const animation = fill.current;
    fill.current = null;
    if (!animation) return false;
    // Shrink back from wherever it got to, quickly (150 ms for a full fill).
    animation.onfinish = () => {
      animation.cancel();
      // The fill is gone: grey is readable again, unless a new hold began.
      if (!fill.current) {
        setFilled(false);
        collapseFill();
      }
    };
    animation.updatePlaybackRate(-HOLD_MS / MOTION.fast);
    return true;
  }

  /** An unused fill takes no room: at full size, even clipped and see-through, it widened the key's scroll box. */
  function collapseFill() {
    if (fillRef.current) Object.assign(fillRef.current.style, { width: "0px", height: "0px" });
  }

  function complete(held: boolean) {
    const animation = fill.current;
    fill.current = null;
    latest.current.onComplete(latest.current.habit, { held });
    setJustDone(true);
    // The fill paints above the key's own background (a -z child of an
    // isolated button), so it goes a frame later, once the done colour has
    // been committed. Measured: the persimmon key and the fill share one
    // frame, never a frame with neither, even at 6x CPU slowdown.
    requestAnimationFrame(() => {
      animation?.cancel();
      if (!fill.current) collapseFill();
    });
    if (!prefersReducedMotion()) {
      keyRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], {
        duration: MOTION.pop,
        easing: EASE_OUT,
      });
    }
    // One short buzz where phones support it (Android; iOS ignores this).
    navigator.vibrate?.(12);
  }

  function showHint(release: { by: "pointer" | "key"; heldMs: number }) {
    setHint(true);
    latest.current.onHint(latest.current.habit, { by: release.by, heldMs: release.heldMs });
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), HINT_MS);
  }

  // Leaving the page (app switch, notification, lock) mid-hold cancels it,
  // even if the browser never sends pointercancel.
  useEffect(() => {
    const interrupt = () => dispatch({ type: "interrupt" });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") interrupt();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", interrupt);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", interrupt);
      clearTimeout(hintTimer.current);
      // Hidden or removed mid-hold: no onfinish will come, so tidy up here.
      fill.current?.cancel();
      fill.current = null;
      collapseFill();
    };
    // dispatch only reads refs, so it's safe to bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hidden routes stay alive (<Activity>): leaving Today mid-hold or just
  // after an early release must not leave the key half-way when you come
  // back (an ink caption, "Keep holding…" instead of the dots, or a hold
  // the key still thinks is going on).
  useLayoutEffect(
    () => () => {
      // Removed or hidden mid-hold (deleted elsewhere, the demo was reset,
      // another page): say the hold is over, or Today would wait for it
      // forever and stop refreshing.
      const kind = state.current.kind;
      if (kind === "pointer-hold" || kind === "key-hold") latest.current.onHoldingChange(false);
      state.current = IDLE;
      setFilled(false);
      setHint(false);
    },
    [],
  );

  // Viewport coordinates: if the key itself moves (the 2 px press, a
  // message appearing above the list), that isn't the finger moving.
  function pointFrom(event: ReactPointerEvent<HTMLButtonElement>): Point {
    return { x: event.clientX, y: event.clientY };
  }

  // The streak caption pulses when its number goes up (Feature 10i): with
  // the done pop, the key swells and the number ticks (1.08, from its right
  // edge). Never on the first render, on undo, or with Reduce Motion;
  // transform only (no reflow).
  const streakRef = useRef<HTMLSpanElement>(null);
  const shownStreak = useRef<number | null>(null);
  useEffect(() => {
    const rose = streakRose(shownStreak.current, habit.streak);
    shownStreak.current = habit.streak;
    if (rose && !prefersReducedMotion()) {
      // A tick, not a jolt: up quickly (a third of the time), down gently;
      // from the right edge, so the caption keeps its column with the check.
      streakRef.current?.animate(
        [
          { transform: "scale(1)", easing: EASE_OUT },
          { transform: "scale(1.08)", offset: 0.35, easing: EASE_GLIDE },
          { transform: "scale(1)" },
        ],
        { duration: MOTION.pop },
      );
    }
  }, [habit.streak]);

  const ids = { streak: `${habit.id}-streak`, week: `${habit.id}-week`, how: `${habit.id}-how` };
  const instruction = habit.done
    ? "Done today. Tap to undo."
    : mode === "tap"
      ? "Tap to complete."
      : "Press and hold to complete.";

  return (
    <button
      ref={keyRef}
      type="button"
      aria-pressed={habit.done}
      aria-label={habit.name}
      aria-describedby={`${ids.streak} ${ids.week} ${ids.how}`}
      onPointerDown={(e) => {
        lastSequenceAt.current = performance.now();
        if (e.button === 0 && e.isPrimary) e.currentTarget.setPointerCapture(e.pointerId);
        dispatch({
          type: "pointerdown",
          pointerId: e.pointerId,
          button: e.button,
          isPrimary: e.isPrimary,
          point: pointFrom(e),
          done: habit.done,
          // The event's own time, not the handler's: a busy main thread
          // (a refresh rendering) mustn't make a press look shorter.
          time: e.timeStamp,
        });
      }}
      onPointerMove={(e) => dispatch({ type: "pointermove", pointerId: e.pointerId, point: pointFrom(e) })}
      onPointerUp={(e) => {
        lastSequenceAt.current = performance.now();
        dispatch({ type: "pointerup", pointerId: e.pointerId, point: pointFrom(e), time: e.timeStamp });
      }}
      onPointerCancel={(e) => {
        lastSequenceAt.current = performance.now();
        dispatch({ type: "pointercancel", pointerId: e.pointerId });
      }}
      onLostPointerCapture={() => dispatch({ type: "interrupt" })}
      onKeyDown={(e) => {
        if (!isActivationKey(e.key)) return;
        // The button's own click (Enter on keydown, Space on keyup) would
        // double up with ours.
        e.preventDefault();
        lastSequenceAt.current = performance.now();
        dispatch({ type: "keydown", key: e.key, repeat: e.repeat, done: habit.done, time: e.timeStamp });
      }}
      onKeyUp={(e) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        lastSequenceAt.current = performance.now();
        dispatch({ type: "keyup", key: e.key, time: e.timeStamp });
      }}
      onClick={() => dispatch({ type: "click", msSinceSequence: performance.now() - lastSequenceAt.current, done: habit.done })}
      onBlur={() => dispatch({ type: "interrupt" })}
      // No iOS/Android long-press menu or text selection on a key.
      onContextMenu={(e) => e.preventDefault()}
      className={
        "@container relative isolate mb-1 flex min-h-24 w-full touch-pan-y flex-col justify-between gap-3 overflow-hidden rounded-key px-[min(1.25rem,20px)] py-5 text-left select-none [-webkit-touch-callout:none] " +
        "motion-safe:active:translate-y-[2px] focus-visible:outline-offset-[6px] border " +
        // Completing SNAPS to persimmon (no colour transition into the done
        // state); undoing fades back over 200 ms (the not-done state carries
        // the transition). With Reduce Motion, both are instant.
        (habit.done
          ? "border-transparent bg-accent-key text-on-accent shadow-[0_4px_0_var(--accent-lip)] active:shadow-[0_2px_0_var(--accent-lip)] " +
            "motion-safe:transition-[box-shadow,transform] motion-safe:duration-(--motion-fast)"
          : "border-line bg-surface text-ink shadow-[0_4px_0_var(--surface-sunk)] active:shadow-[0_2px_0_var(--surface-sunk)] " +
            "motion-safe:transition-[background-color,color,border-color,box-shadow,transform] motion-safe:duration-(--motion-base) motion-safe:ease-(--ease-out)")
      }
    >
      {/* The hold fill: grows from the finger (or fades in, with Reduce Motion). */}
      <span ref={fillRef} aria-hidden="true" className="pointer-events-none absolute -z-10 bg-accent-tint opacity-0" />

      {/* With large text the key gets narrow for its name (under 10rem
          inside, which normal text never reaches, even at 320 px): the check
          moves above the name, so words keep the key's full width instead of
          breaking in the middle (Feature 9). The key's side padding is
          capped at 20 px for the same reason (at 200% on a 320 px phone a
          rem padding left "minutes" no room). break-words stays as the last
          resort for one very long word. */}
      <span className="flex items-start justify-between gap-3 @max-[10rem]:flex-col-reverse @max-[10rem]:items-end">
        <span className="min-w-0 flex-1 text-habit font-semibold break-words text-pretty @max-[10rem]:self-stretch">{habit.name}</span>
        <CheckCircle done={habit.done} animate={justDone} />
      </span>

      {/* flex-wrap: with large text the streak drops below the dots instead of
          being cut off at the key's edge. */}
      <span className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* "Keep holding…" takes the dots' place, at the left: away from a
            right thumb resting on the key, and in ink, as an instruction. */}
        {hint ? (
          <span className="text-sm font-semibold text-ink">Keep holding…</span>
        ) : (
          <Dots dots={habit.dots} onAccent={habit.done} />
        )}
        {/* Proportional figures (Feature 9, the user's call): Manrope's
            tabular "1" sits alone in a wide slot ("1 2-day streak"). */}
        <span ref={streakRef} id={ids.streak} data-streak={habit.streak} className={`origin-right text-sm font-medium ${habit.done ? "" : filled ? "text-ink" : "text-ink-muted"}`}>
          {streakText(habit.streak)}
        </span>
      </span>

      <span id={ids.week} className="sr-only">
        {dotsSummary(habit.dots)}
      </span>
      <span id={ids.how} className="sr-only">
        {instruction}
      </span>
    </button>
  );
}

/**
 * The key's check (Feature 10i): the empty ring and the filled disc with its
 * check, drawn on top of each other; the one showing is sharp and whole, the
 * other faded, blurred and a little smaller, and they crossfade over
 * --motion-base, completing and undoing alike (the check still draws itself
 * in on completion, 60 ms in, so its stroke shows once the disc has come
 * through). With Reduce Motion the swap is instant.
 */
function CheckCircle({ done, animate }: { done: boolean; animate: boolean }) {
  const layer =
    "absolute inset-0 flex items-center justify-center rounded-full border-2 motion-safe:transition-[opacity,filter,scale] motion-safe:duration-(--motion-base) motion-safe:ease-(--ease-out)";
  const shown = "opacity-100 blur-none scale-100";
  const hidden = "opacity-0 blur-[2px] scale-85";
  return (
    <span aria-hidden="true" data-check={done ? "done" : "open"} className="relative size-8 shrink-0">
      {/* The empty ring is ink-muted (6:1), so "not done, press me" is visible. */}
      <span className={`${layer} border-ink-muted bg-transparent ${done ? hidden : shown}`} />
      <span className={`${layer} border-on-accent bg-on-accent text-accent-key ${done ? shown : hidden}`}>
        <CheckIcon size={20} strokeWidth={2.5} className={done && animate ? "motion-safe:animate-[draw-check_200ms_ease-out_60ms_both]" : ""} />
      </span>
    </span>
  );
}
