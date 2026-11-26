"use client";

// Today's scene strip (plans/habit-tracker.md, Feature 10): a close-up of the
// climb around your altitude, and the way into the Climb screen. Completing
// a habit lifts the view (over MOTION.lift; at once with Reduce Motion).
//
// The link's name is its visible words ("Altitude 7,113 m, Above the
// clouds, Climb"), so Voice Control's "Tap Altitude" works (WCAG 2.5.3).
// The zone moment's card sits beside the link, never inside it.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { SceneCanvas } from "@/components/climb/scene-canvas";
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

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The view's altitude in metres, easing to a new one (or jumping, with Reduce Motion). */
function useLift(targetM: number): number {
  const [shown, setShown] = useState(targetM);
  const from = useRef(targetM);
  useEffect(() => {
    const start = from.current;
    if (start === targetM) return;
    let frame = 0;
    const began = performance.now();
    // With Reduce Motion the first frame lands straight on the new height.
    const duration = reducedMotion() ? 0 : MOTION.lift;
    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - began) / duration);
      // Ease out: quick to start, gentle to land.
      const eased = 1 - Math.pow(1 - t, 3);
      const value = start + (targetM - start) * eased;
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [targetM]);
  return shown;
}

export function ClimbStrip({ altitudeCm, shapeCm, moment, onDismissMoment }: Props) {
  const shownM = useLift(altitudeCm / CM);
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
    <div className="relative mt-3">
      {/* At least 8.75rem (140 px at normal text); the chips are in the flow
          over the art, so with large text the strip grows instead of the
          chips running into each other. */}
      <Link
        ref={link}
        href="/climb"
        className={`relative flex min-h-[8.75rem] flex-col items-start justify-between gap-2 overflow-hidden rounded-key border border-line ${altitudeCm >= NIGHT_M * CM ? "bg-(--scene-space-1)" : "bg-(--scene-sky-6)"} p-3 motion-safe:transition-transform motion-safe:duration-(--motion-fast) motion-safe:active:translate-y-0.5`}
      >
        <SceneCanvas view="close" altitude={shownM} shapeAt={shapeCm / CM} className="absolute inset-0" avoid={".bg-surface"} />
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
          className="absolute inset-y-0 right-0 flex w-[42%] items-center justify-center rounded-key p-2"
        >
          <span className="flex max-w-full flex-col items-center gap-0.5 rounded-(--radius-field) border border-line bg-surface px-3 py-2.5 text-center text-balance shadow-[0_3px_0_var(--surface-sunk)] motion-safe:animate-[card-in_var(--motion-base)_var(--ease-out)_both]">
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
