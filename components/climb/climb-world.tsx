"use client";

// The Climb screen's scene (plans/habit-tracker.md, Features 10, 10c, 10e, 10f, 10g): the
// world from the valley up past the Summit into space (to 46,000 m at
// least), in a scrolling window that opens on your balloon. Past either end
// iOS's bounce shows the box's own background: the sky above the top (drawn
// by the scene), or the valley below the floor. The ruler (every 2,500 m, your height highlighted) and the zone
// labels are text over the art, in token chips; the zones are a list for
// screen readers, the ruler is decoration (your height is in the readout).

import { ViewTransition, useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BACKDROP_ROWS, SCENE_SCALE, SceneCanvas, WORLD_METRES_PER_ROW, type Backdrop } from "@/components/climb/scene-canvas";
import { CM, metres, metresText, wholeMetres, zonesBelow } from "@/lib/altitude";
import { NIGHT_M, climbTop, climbWindowTop } from "@/lib/climb-scene/scene";
import { CLIMB_SCENE, MORPH_ONLY } from "@/lib/motion";

/** Valley drawn below 0 m (css px): room under "Base camp" at the scroll's bottom limit. */
const FLOOR_PX = 8 * SCENE_SCALE;

/** CSS px from the world's top to an altitude. */
function yOf(altitudeM: number, top: number): number {
  return ((top - altitudeM) / WORLD_METRES_PER_ROW) * SCENE_SCALE;
}

export function ClimbWorld({ altitudeCm }: { altitudeCm: number }) {
  const altitudeM = altitudeCm / CM;
  const top = climbTop(altitudeM);
  const height = (top / WORLD_METRES_PER_ROW) * SCENE_SCALE;
  const box = useRef<HTMLDivElement>(null);
  const ticks = Array.from({ length: Math.floor(top / 2_500) }, (_, i) => (i + 1) * 2_500);
  /**
   * A ruler chip a zone's label could run into (yours, or a shown tick's from
   * 200 m below its line to 700 m above: the label sits above its line; a
   * tick's chip lower down is clear of it)?
   */
  const rulerNear = (m: number) => Math.abs(m - altitudeM) < 700 || ticks.some((t) => Math.abs(t - altitudeM) >= 700 && t - m > -200 && t - m < 700);
  /** A tick's chip shown on this very line ("Above the clouds" and every zone from 10,000 m start on one)? */
  const onTick = (m: number) => m % 2_500 === 0 && m > 0 && m < top && Math.abs(m - altitudeM) >= 700;
  /** Your own chip in the rows of a label lifted above this line (you up to about 1,200 m above it, at 200% text)? */
  const youBeside = (m: number) => altitudeM >= m && altitudeM - m < 1_200;
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null);
  const onBackdrop = useCallback((b: Backdrop) => setBackdrop(b), []);

  // Open on your marker, a little below the middle of the window, so what's
  // ahead is in view (no animation); below about 7,000 m the window stops
  // short of the peak, so it isn't in view yet (climbWindowTop, Feature 10e).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const windowMetres = (el.clientHeight / SCENE_SCALE) * WORLD_METRES_PER_ROW;
    el.scrollTop = Math.max(0, yOf(climbWindowTop(altitudeM, windowMetres, top), top));
    // The bounce's backdrop follows the end you're nearer: sky above in the
    // upper half of the world, the valley in the lower (data-end, read by the
    // classes below; set here, not rendered, so scrolling never re-renders).
    const end = () => {
      const want = el.scrollTop > (el.scrollHeight - el.clientHeight) / 2 ? "bottom" : "top";
      if (el.dataset.end !== want) el.dataset.end = want;
    };
    end();
    el.addEventListener("scroll", end, { passive: true });
    return () => el.removeEventListener("scroll", end);
  }, [altitudeM, top]);

  return (
    // The same name as Today's strip (Feature 10i): the strip grows into this window.
    <ViewTransition name={CLIMB_SCENE} share={MORPH_ONLY} default="none">
    <div
      ref={box}
      // A window onto the climb, down to the bottom of the screen, scrolling
      // inside; never taller than 900 px (7,500 m), so a tablet doesn't open on the peak.
      // The background shows only past either end (in the bounce): above the
      // top, the top's space colour under the sky drawn above it (whole
      // pixels, like the canvas); below the floor, the valley.
      // (.climb-box in globals.css: the ruler runs on through it.)
      className="climb-box relative mt-5 max-h-[900px] min-h-[min(24rem,900px)] flex-1 basis-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-key border border-line"
      style={
        backdrop
          ? ({
              "--climb-above": `url(${backdrop.url})`,
              "--climb-above-size": `${backdrop.width * SCENE_SCALE}px ${BACKDROP_ROWS * SCENE_SCALE}px`,
            } as CSSProperties)
          : undefined
      }
      tabIndex={0}
      aria-label={`The climb, from the valley to ${metresText(top)}`}
      role="region"
    >
      {/* Before the canvas paints, the colour of the sky where it opens. */}
      <div className={`relative ${altitudeM >= NIGHT_M ? "bg-(--scene-space-1)" : "bg-(--scene-sky-6)"}`} style={{ height: height + FLOOR_PX }}>
        <SceneCanvas view="world" altitude={altitudeM} top={top} className="absolute inset-x-0 top-0" style={{ height }} avoid={"li"} onBackdrop={onBackdrop} />
        {/* The valley on below 0 m (the scene's bottom row is valley), so "Base camp" isn't on the box's edge. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-(--scene-valley)" style={{ height: FLOOR_PX }} />

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
          // Just below your height's tick: your balloon floats above it, and at
          // large text sizes a centred chip would reach its basket.
          className="absolute right-6 z-10 rounded-full bg-accent px-2 py-0.5 text-sm font-bold text-on-accent"
          // Near the valley it rests on the world's floor instead, never below
          // it, at any text size (the chip is 1.5rem tall: one line and its padding).
          style={{ top: `min(${yOf(wholeMetres(altitudeCm), top)}px + 0.5rem, ${height - SCENE_SCALE}px - 1.5rem)` }}
        >
          {metres(altitudeCm)}
        </span>

        {/* The zones down the left, as a list. */}
        <ul aria-label="Zones">
          {/* First: with every zone to 45,000 m listed, where you are shouldn't come last. */}
          <li className="sr-only">You are at {metres(altitudeCm)}.</li>
          {zonesBelow(top).map((z) => (
            // The name only (the ruler shows heights; screen readers hear it),
            // sitting just above the height where the zone starts, and never
            // wider than the room left of the ruler (5.5rem: its widest chip,
            // which grows with the text too): it wraps instead. On a tick's
            // own line it sits above the tick's chip instead, at full width
            // (a narrow chip there can't hold its words at 200% text), unless
            // your own chip is in those rows. Never narrower than its longest word.
            <li
              key={z.from}
              className={`absolute left-2 min-w-min -translate-y-full rounded-(--radius-field) border border-line bg-surface px-2.5 py-0.5 text-sm leading-tight font-semibold text-pretty text-ink ${Math.abs(z.from - altitudeM) < 500 ? "max-w-[min(6.5rem,calc(100%-7.5rem))]" : onTick(z.from) && !youBeside(z.from) ? "max-w-[calc(100%-1rem)]" : rulerNear(z.from) || onTick(z.from) ? "max-w-[calc(100%-7rem)]" : "max-w-[calc(100%-1rem)]"}`}
              // Above the tick's chip: half its height (0.75rem and its border) and a pixel.
              style={{ top: onTick(z.from) ? `calc(${yOf(z.from, top) - 2}px - 0.75rem - 2px)` : yOf(z.from, top) - 2 }}
            >
              {z.name}
              <span className="sr-only">, {metresText(z.from)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
    </ViewTransition>
  );
}
