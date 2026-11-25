"use client";

// The Climb screen's scene (plans/habit-tracker.md, Feature 10): the world
// from the valley to the top, in a scrolling window that opens on your
// marker. The ruler (every 2,500 m, your height highlighted) and the zone
// labels are text over the art, in token chips; the zones are a list for
// screen readers, the ruler is decoration (your height is in the readout).

import { useLayoutEffect, useRef } from "react";
import { SCENE_SCALE, SceneCanvas, WORLD_METRES_PER_ROW } from "@/components/climb/scene-canvas";
import { CM, metres, metresText, wholeMetres, zonesBelow } from "@/lib/altitude";
import { worldTop } from "@/lib/climb-scene/scene";

/** CSS px from the world's top to an altitude. */
function yOf(altitudeM: number, top: number): number {
  return ((top - altitudeM) / WORLD_METRES_PER_ROW) * SCENE_SCALE;
}

export function ClimbWorld({ altitudeCm }: { altitudeCm: number }) {
  const altitudeM = altitudeCm / CM;
  const top = worldTop(altitudeM);
  const height = (top / WORLD_METRES_PER_ROW) * SCENE_SCALE;
  const box = useRef<HTMLDivElement>(null);
  const ticks = Array.from({ length: Math.floor(top / 2_500) }, (_, i) => (i + 1) * 2_500);
  /** A ruler chip at or near this height (yours, or a tick's that's shown)? */
  const rulerNear = (m: number) => Math.abs(m - altitudeM) < 700 || ticks.some((t) => Math.abs(t - altitudeM) >= 700 && Math.abs(t - m) < 700);

  // Open on your marker, a little below the middle of the window, so the
  // next zone up (and its label) is in view (no animation).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollTop = Math.max(0, yOf(altitudeM, top) - el.clientHeight * 0.63);
  }, [altitudeM, top]);

  return (
    <div
      ref={box}
      // A window onto the climb, down to the bottom of the screen, scrolling inside.
      className="relative mt-5 min-h-[24rem] flex-1 basis-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-key border border-line bg-(--scene-sky-6)"
      tabIndex={0}
      aria-label={`The climb, from the valley to ${metresText(top)}`}
      role="region"
    >
      <div className="relative" style={{ height }}>
        <SceneCanvas view="world" altitude={altitudeM} top={top} className="absolute inset-0" />

        {/* The ruler down the right: one scene pixel wide (on the pixel grid),
            a tick and a chip every 2,500 m, your height in the accent. */}
        <div aria-hidden="true" className="absolute top-0 bottom-0 bg-(--scene-ruler)" style={{ right: SCENE_SCALE * 4, width: SCENE_SCALE }} />
        {ticks.map((m) => (
          <span key={m} aria-hidden="true">
            <span
              className="absolute bg-(--scene-ruler)"
              style={{ right: SCENE_SCALE * 4, width: SCENE_SCALE * 3, height: SCENE_SCALE, top: yOf(m, top) - SCENE_SCALE / 2 }}
            />
            {/* Near you, your own chip says where you are: the tick keeps only its mark. */}
            {Math.abs(m - altitudeM) >= 700 && (
              <span
                className="absolute right-6 -translate-y-1/2 rounded-full border border-line bg-surface px-2 py-0.5 text-sm font-semibold text-ink-muted"
                style={{ top: yOf(m, top) }}
              >
                {metresText(m)}
              </span>
            )}
          </span>
        ))}
        <span
          aria-hidden="true"
          className="absolute bg-accent"
          style={{ right: SCENE_SCALE * 3, width: SCENE_SCALE * 3, height: SCENE_SCALE, top: yOf(altitudeM, top) - SCENE_SCALE / 2 }}
        />
        <span
          aria-hidden="true"
          data-testid="ruler-you"
          className="absolute right-6 z-10 -translate-y-1/2 rounded-full bg-accent px-2 py-0.5 text-sm font-bold text-on-accent"
          style={{ top: yOf(wholeMetres(altitudeCm), top) }}
        >
          {metres(altitudeCm)}
        </span>

        {/* The zones down the left, as a list. */}
        <ul aria-label="Zones">
          {zonesBelow(top).map((z) => (
            // The name only (the ruler shows heights; screen readers hear it),
            // sitting just above the height where the zone starts, and never
            // wider than the room left of the ruler (5.5rem: its widest chip,
            // which grows with the text too): it wraps instead.
            <li
              key={z.from}
              className={`absolute left-2 -translate-y-full rounded-(--radius-field) border border-line bg-surface px-2.5 py-0.5 text-sm leading-tight font-semibold text-pretty text-ink ${Math.abs(z.from - altitudeM) < 500 ? "max-w-[min(6.5rem,calc(100%-7.5rem))]" : rulerNear(z.from) ? "max-w-[calc(100%-7rem)]" : "max-w-[calc(100%-1rem)]"}`}
              style={{ top: yOf(z.from, top) - 2 }}
            >
              {z.name}
              <span className="sr-only">, {metresText(z.from)}</span>
            </li>
          ))}
          <li className="sr-only">You are at {metres(altitudeCm)}.</li>
        </ul>
      </div>
    </div>
  );
}
