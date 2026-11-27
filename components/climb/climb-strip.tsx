"use client";

// Today's scene strip (plans/habit-tracker.md, Feature 10): a close-up of the
// climb around your altitude, and the way into the Climb screen. Completing
// a habit lifts the view (over MOTION.lift; at once with Reduce Motion).
// A new zone's moment is a celebration (Feature 10h, lib/celebration.ts):
// a bigger lift with a surge, sway and pixel confetti, the card landing as
// the balloon settles; with Reduce Motion, still sparkles and a fade.
//
// The link's name is its visible words ("Altitude 7,113 m, Above the
// clouds, Climb"), so Voice Control's "Tap Altitude" works (WCAG 2.5.3).
// The zone moment's card sits beside the link, never inside it.

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { SceneCanvas, type Celebration } from "@/components/climb/scene-canvas";
import { balloonRise, balloonSway, confetti, confettiRoles, confettiSeed, flightAt, liftSpeed, nextRun, sparkles, type Run } from "@/lib/celebration";
import { CM, metres, metresText, type Zone, zoneAt } from "@/lib/altitude";
import { NIGHT_M } from "@/lib/climb-scene/scene";
import { MOTION } from "@/lib/motion";

export type ZoneMoment = { id: number; zone: Zone; gainedCm: number; altitudeCm: number };

type Props = {
  altitudeCm: number;
  /** The day's start (before today), which shapes the mountain: it stays still while you climb it. */
  shapeCm: number;
  moment: ZoneMoment | null;
  onDismissMoment: () => void;
};

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** A media query, followed live (false on the server). Its subscribe is stable, so it's subscribed once, not per render. */
function mediaStore(query: string) {
  return {
    subscribe(changed: () => void) {
      const list = window.matchMedia(query);
      list.addEventListener("change", changed);
      return () => list.removeEventListener("change", changed);
    },
    snapshot: () => window.matchMedia(query).matches,
    server: () => false,
  };
}
const REDUCE = mediaStore(MOTION_QUERY);
const DARK = mediaStore(DARK_QUERY);

/** Reduce Motion's still sparkles (one array, so the scene isn't redrawn for a new one each render). */
const STILL: Celebration = { sparkles: sparkles() };

type Motion = {
  /** The view's altitude, in metres. */
  shownM: number;
  /** The celebration playing: ms since it began, its zone's height (the confetti's seed and colours), the height its burst is anchored at, and whether the view travels (its streaks). */
  playing: { t: number; zoneFrom: number; anchorM: number; travels: boolean } | null;
  /** Celebrations started since the strip mounted (a test hook). */
  count: number;
};

/**
 * The view's altitude in metres, easing to a new one (or jumping, with
 * Reduce Motion), and the zone celebration: what plays is nextRun's call
 * (lib/celebration.ts): a new moment plays once, from where the view is to
 * the live height, its surge, sway and confetti on the same clock; a new
 * height mid-flight re-aims it; closing the card doesn't stop it. One
 * requestAnimationFrame loop, stopped when it's over, when the strip hides,
 * or when Reduce Motion comes on (it then jumps to the end).
 */
function useClimbMotion(targetM: number, moment: ZoneMoment | null, reduce: boolean): Motion {
  const [motion, setMotion] = useState<Motion>({ shownM: targetM, playing: null, count: 0 });
  const from = useRef(targetM);
  // The celebration (kept across re-runs: a new target, the card closing, Strict Mode's second run).
  const run = useRef<Run | null>(null);
  const momentId = moment?.id ?? null;
  const zoneFrom = moment?.zone.from ?? 0;
  useEffect(() => {
    let frame = 0;
    const now = performance.now();
    const next = nextRun(run.current, { momentId, zoneFrom, reduce, target: targetM, view: from.current, time: now });
    run.current = next.run;
    const r = next.run;
    if (r && next.mode === "flight") {
      const step = (time: number) => {
        const at = flightAt(r.flight, time);
        from.current = at.done ? targetM : at.altitude;
        const first = !r.counted;
        r.counted = true;
        const travels = r.flight.from !== r.flight.to;
        setMotion((m) => ({
          shownM: from.current,
          playing: at.done ? null : { t: at.t, zoneFrom: r.zoneFrom, anchorM: r.flight.to, travels },
          count: m.count + (first ? 1 : 0),
        }));
        if (!at.done) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame);
    }
    const start = from.current;
    // With Reduce Motion the first frame lands straight on the new height.
    const duration = reduce || start === targetM ? 0 : MOTION.lift;
    const step = (time: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (time - now) / duration);
      // Ease out: quick to start, gentle to land.
      const value = start + (targetM - start) * (1 - Math.pow(1 - t, 3));
      from.current = value;
      setMotion((m) => (m.shownM === value && m.playing === null ? m : { ...m, shownM: value, playing: null }));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [targetM, momentId, zoneFrom, reduce]);
  return motion;
}

export function ClimbStrip({ altitudeCm, shapeCm, moment, onDismissMoment }: Props) {
  const reduce = useSyncExternalStore(REDUCE.subscribe, REDUCE.snapshot, REDUCE.server);
  const dark = useSyncExternalStore(DARK.subscribe, DARK.snapshot, DARK.server);
  const motion = useClimbMotion(altitudeCm / CM, moment, reduce);
  const shownM = motion.shownM;
  const { playing } = motion;
  const celebration: Celebration | undefined = playing
    ? {
        rise: balloonRise(playing.t),
        sway: balloonSway(playing.t),
        confetti: confetti(confettiSeed(playing.zoneFrom), playing.t, confettiRoles(playing.zoneFrom, dark ? "dark" : "light")),
        anchor: playing.anchorM,
        streaks: playing.travels ? liftSpeed(playing.t) : 0,
      }
    : moment && reduce
      ? STILL
      : undefined;
  const zone = zoneAt(altitudeCm);
  // If the card closes itself while focused, focus goes to the strip, not the page's start.
  const link = useRef<HTMLAnchorElement>(null);
  const cardFocused = useRef(false);
  useEffect(() => {
    if (!moment && cardFocused.current) {
      cardFocused.current = false;
      link.current?.focus();
    }
  }, [moment]);

  return (
    <div className="relative mt-3" data-celebrations={motion.count} data-celebrating={playing ? "" : undefined}>
      {/* At least 8.75rem (140 px at normal text); the chips are in the flow
          over the art, so with large text the strip grows instead of the
          chips running into each other. */}
      <Link
        ref={link}
        href="/climb"
        className={`relative flex min-h-[8.75rem] flex-col items-start justify-between gap-2 overflow-hidden rounded-key border border-line ${altitudeCm >= NIGHT_M * CM ? "bg-(--scene-space-1)" : "bg-(--scene-sky-6)"} p-3 motion-safe:transition-transform motion-safe:duration-(--motion-fast) motion-safe:active:translate-y-0.5`}
      >
        <SceneCanvas view="close" altitude={shownM} shapeAt={shapeCm / CM} celebration={celebration} className="absolute inset-0" avoid={".bg-surface"} />
        {/* Under the zone card, the chips step aside (the card says it all). */}
        <span className={`relative flex flex-wrap items-baseline gap-x-1.5 rounded-full bg-surface px-3 py-1 text-ink ${moment ? "invisible" : ""}`}>
          <span className="text-sm font-semibold tracking-wide text-ink-muted uppercase">Altitude</span>{" "}
          <span className="text-base font-bold">{metres(altitudeCm)}</span>
        </span>
        {/* One row that wraps, so the zone and "Climb" never overlap. */}
        <span className={`relative flex w-full flex-wrap items-end justify-between gap-2 ${moment ? "invisible" : ""}`}>
          <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-ink">{zone.name}</span>
          <span className="flex items-center gap-0.5 rounded-full bg-surface py-1 pr-1.5 pl-3 text-sm font-semibold text-ink">
            Climb
            <ChevronRightIcon size={16} />
          </span>
        </span>
      </Link>
      {moment && (
        // The zone moment, over the strip: one tap closes it (and it closes
        // itself after a few seconds). Its words are also announced.
        <button
          key={moment.id}
          type="button"
          onClick={onDismissMoment}
          onFocus={() => (cardFocused.current = true)}
          onBlur={() => (cardFocused.current = false)}
          // In the right 42%, clear of the balloon and the peak, so you see them during the moment.
          // It lands as the balloon settles (hidden until then, so a tap
          // meant for the strip still opens Climb); with Reduce Motion it fades in.
          className="absolute inset-y-0 right-0 flex w-[42%] items-center justify-center rounded-key p-2 motion-safe:animate-[card-in_var(--motion-base)_var(--ease-out)_var(--motion-land)_both] motion-reduce:animate-[fade-in_var(--motion-base)_var(--ease-out)_both]"
        >
          <span className="flex max-w-full flex-col items-center gap-0.5 rounded-(--radius-field) border border-line bg-surface px-3 py-2.5 text-center text-balance shadow-[0_3px_0_var(--surface-sunk)]">
            <span className="text-sm font-semibold tracking-wide text-accent uppercase">New zone</span>
            <span className="text-list font-bold text-ink">{moment.zone.name}</span>
            <span className="text-sm font-medium text-ink-muted">
              {/* Two lines, no dangling dot (screen readers still hear "·"). */}
              <span className="block">+{metresText(Math.floor(moment.gainedCm / CM))}</span>
              <span className="sr-only"> · </span>
              <span className="block">up to {metres(moment.altitudeCm)}</span>
            </span>
            <span className="sr-only">, close</span>
          </span>
        </button>
      )}
    </div>
  );
}
