"use client";

// Paints the Climb's pixel-art world (lib/climb-scene/scene.ts) on a canvas
// (plans/habit-tracker.md, Features 10 to 10g). The scene is drawn at a low logical
// resolution and scaled up by a whole number with image-rendering:
// pixelated, so every pixel is a crisp square. Colours are the --scene-*
// tokens, read from CSS (they follow the colour scheme). Decorative: the
// canvas is aria-hidden; what it shows that matters is in text beside it.
//
// Clouds drift a logical pixel at a time (MOTION.drift), only while the
// scene is on screen and the page is visible, and never with Reduce Motion.
// Each tick repaints only the rows that changed (Climb's canvas is tall);
// in full after a theme switch, a resize, or the canvas being wiped.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MOTION } from "@/lib/motion";
import {
  BALLOON_MIN_X,
  Canvas,
  ROLES,
  closeBalloonAt,
  closeFarOptions,
  dirtyRuns,
  drawCloseMoving,
  drawWorldBase,
  drawWorldMoving,
  worldBalloonAt,
  worldMoon,
  type Theme,
} from "@/lib/climb-scene/scene";

/** CSS pixels per logical pixel. */
export const SCENE_SCALE = 3;
/** The Climb screen's world: metres per row. */
export const WORLD_METRES_PER_ROW = 25;
/** Rows of sky drawn above the world's top for the bounce's backdrop (3,750 m: 450 css px, half the tallest window). */
export const BACKDROP_ROWS = 150;

/** The sky above Climb's top, as an image for the scroll box's background (shown in iOS's bounce), and its width in logical px. */
export type Backdrop = { url: string; width: number };

type Props = (
  | { view: "close"; altitude: number; shapeAt: number }
  | { view: "world"; altitude: number; top: number }
) & {
  className?: string;
  style?: CSSProperties;
  /**
   * The page's own chips over the scene (a selector, within the scene's
   * parent): the balloon keeps to the right of any at its height, measured,
   * so it holds at any width and text size.
   */
  avoid?: string;
  /** Climb: receives the sky above the world's top, drawn in the theme's colours, whenever it changes. */
  onBackdrop?: (backdrop: Backdrop) => void;
};

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function darkScheme(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * The theme's colour for each role, as [r, g, b], read from the --scene-*
 * tokens. Any CSS colour is accepted: the production build shortens #FFFFFF
 * to #fff, so the browser normalises it (a 2D context's fillStyle reads
 * back as #rrggbb).
 */
function readColours(): [number, number, number][] {
  const style = getComputedStyle(document.documentElement);
  const normaliser = document.createElement("canvas").getContext("2d");
  return ROLES.map((role) => {
    const value = style.getPropertyValue(`--scene-${role}`).trim();
    if (!value || !normaliser) return [0, 0, 0];
    normaliser.fillStyle = "#000000";
    normaliser.fillStyle = value;
    const hex = String(normaliser.fillStyle);
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return [0, 0, 0];
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  });
}

/** What was last painted on a canvas, so the next tick repaints only what changed. */
type Painted = { image: ImageData | null; last: Uint8Array | null; colours: [number, number, number][] | null };

/**
 * Paints the scene's roles in the theme's colours. In full when the size or
 * the colours changed (a theme switch, a resize: the canvas was cleared) or
 * nothing is known to be on it (`last` reset: a lost context, the page
 * shown again); otherwise only the rows whose roles changed since the last
 * paint (the drifting clouds, the balloon), one rectangle per run (dirtyRuns).
 */
function paint(el: HTMLCanvasElement, scene: Canvas, colours: [number, number, number][], reuse: Painted) {
  const resized = el.width !== scene.width || el.height !== scene.height;
  if (el.width !== scene.width) el.width = scene.width;
  if (el.height !== scene.height) el.height = scene.height;
  const ctx = el.getContext("2d");
  if (!ctx) return;
  let image = reuse.image;
  if (!image || image.width !== scene.width || image.height !== scene.height) {
    image = ctx.createImageData(scene.width, scene.height);
    reuse.image = image;
  }
  const full = resized || reuse.colours !== colours;
  const { width } = scene;
  for (const [from, to] of dirtyRuns(full ? null : reuse.last, scene.px, width)) {
    for (let i = from * width; i < (to + 1) * width; i++) {
      const [r, g, b] = colours[scene.px[i]];
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0, 0, from, width, to - from + 1);
  }
  if (reuse.last && reuse.last.length === scene.px.length) reuse.last.set(scene.px);
  else reuse.last = new Uint8Array(scene.px);
  reuse.colours = colours;
}

/** The scene's roles as a PNG data URL, in these colours. */
function toUrl(scene: Canvas, colours: [number, number, number][]): string {
  const el = document.createElement("canvas");
  paint(el, scene, colours, { image: null, last: null, colours: null });
  return el.toDataURL();
}

export function SceneCanvas(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [time, setTime] = useState(0);
  // Set once the scene has been painted at its size (the browser tests wait for it).
  const [painted, setPainted] = useState(false);

  // The box's size, in logical pixels.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.ceil(rect.width / SCENE_SCALE)), height: Math.max(1, Math.ceil(rect.height / SCENE_SCALE)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Light or dark, following the system.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(darkScheme() ? "dark" : "light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Drift: a tick at a third of the drift step, only on screen, visible and with motion.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      const run = onScreen && document.visibilityState === "visible" && !reducedMotion();
      if (run && timer === undefined) {
        setTime(performance.now());
        timer = setInterval(() => setTime(performance.now()), Math.round(MOTION.drift / 3));
      } else if (!run && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      if (reducedMotion()) setTime(0);
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", sync);
    motionQuery.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motionQuery.removeEventListener("change", sync);
      if (timer !== undefined) clearInterval(timer);
    };
  }, []);

  const altitude = props.altitude;
  const top = props.view === "world" ? props.top : 0;
  const shapeAt = props.view === "close" ? props.shapeAt : altitude;
  // Keep the balloon right of the page's chips at its height (measured; they
  // change with the text size).
  const [avoidX, setAvoidX] = useState<number | undefined>(undefined);
  const avoid = props.avoid;
  const balloonRowAtRest = !size
    ? null
    : props.view === "close"
      ? closeBalloonAt({ width: size.width, height: size.height, altitude, you: shapeAt }).y
      : worldBalloonAt({ width: size.width, height: size.height, metresPerRow: WORLD_METRES_PER_ROW, bottom: 0, you: altitude }, altitude).y;
  useEffect(() => {
    const el = box.current;
    const scope = el?.parentElement;
    if (!el || !scope || !avoid || balloonRowAtRest === null || !size) return;
    const measure = () => {
      const area = el.getBoundingClientRect();
      // The balloon's rows (ring and bob included), in CSS px on the page.
      const top = area.top + (balloonRowAtRest - 14) * SCENE_SCALE;
      const bottom = area.top + (balloonRowAtRest + 3) * SCENE_SCALE;
      let right = 0;
      for (const chip of scope.querySelectorAll(avoid)) {
        const r = chip.getBoundingClientRect();
        // Only chips on the left half, at the balloon's height.
        if (r.width === 0 || r.left > area.left + area.width / 2 || r.bottom <= top || r.top >= bottom) continue;
        right = Math.max(right, r.right - area.left);
      }
      // Its centre this far right: half its width, its ring, and a pixel of air.
      setAvoidX(right > 0 ? Math.ceil(right / SCENE_SCALE) + 5 : undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    scope.querySelectorAll(avoid).forEach((chip) => observer.observe(chip));
    observer.observe(el);
    return () => observer.disconnect();
  }, [avoid, balloonRowAtRest, size]);
  const balloonMinX = avoidX !== undefined && size ? Math.max(avoidX, Math.round(size.width * BALLOON_MIN_X)) : undefined;
  // Where the balloon is (logical px), for the browser tests that keep labels and the card off it.
  const balloon = !size
    ? null
    : props.view === "close"
      ? closeBalloonAt({ width: size.width, height: size.height, altitude, you: shapeAt, balloonMinX })
      : worldBalloonAt({ width: size.width, height: size.height, metresPerRow: WORLD_METRES_PER_ROW, bottom: 0, you: altitude, balloonMinX }, altitude);
  // The still layer (sky, mountain, banks…) is drawn once per size, theme
  // and view, then copied; each tick only draws the drifting clouds and you.
  const base = useRef<{ key: string; px: Uint8Array } | null>(null);
  const colours = useRef<{ theme: Theme; rgb: [number, number, number][] } | null>(null);
  const image = useRef<Painted>({ image: null, last: null, colours: null });
  // Repaint in full when the canvas may have been wiped: its 2D context lost
  // and restored, or the page shown again (a backgrounded home-screen app can
  // lose its canvas). Forgetting what's on it makes the next paint full.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = canvas.current;
    const wiped = () => {
      image.current.last = null;
      setShown((n) => n + 1);
    };
    const visible = () => document.visibilityState === "visible" && wiped();
    el?.addEventListener("contextrestored", wiped);
    document.addEventListener("visibilitychange", visible);
    return () => {
      el?.removeEventListener("contextrestored", wiped);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const backdrop = useRef<string | null>(null);
  const onBackdrop = props.onBackdrop;
  useEffect(() => {
    if (!size || !canvas.current) return;
    const world = {
      width: size.width,
      height: size.height,
      metresPerRow: WORLD_METRES_PER_ROW,
      bottom: 0,
      top,
      you: altitude,
      theme,
      moon: worldMoon(size.width, size.height, WORLD_METRES_PER_ROW, altitude, top),
    };
    const baseOptions =
      props.view === "close" ? closeFarOptions({ width: size.width, height: size.height, theme, altitude, you: shapeAt }) : world;
    const key = JSON.stringify(baseOptions);
    if (base.current?.key !== key) base.current = { key, px: drawWorldBase(baseOptions).px };
    const scene = new Canvas(size.width, size.height);
    scene.px.set(base.current.px);
    if (props.view === "close") {
      drawCloseMoving(scene, { width: size.width, height: size.height, theme, time, altitude, you: shapeAt, driftMs: MOTION.drift, balloonMinX });
    } else {
      drawWorldMoving(scene, { ...world, time, altitude, driftMs: MOTION.drift, balloonMinX });
    }
    if (colours.current?.theme !== theme) colours.current = { theme, rgb: readColours() };
    paint(canvas.current, scene, colours.current.rgb, image.current);
    setPainted(true);
    // Climb: the sky above the top (the same scene, seeded by height), for the bounce.
    if (props.view === "world" && onBackdrop && backdrop.current !== key + theme) {
      backdrop.current = key + theme;
      // (No moon: its row is the world's, not the backdrop's.)
      const above = drawWorldBase({ ...world, bottom: top, height: BACKDROP_ROWS, moon: null });
      onBackdrop({ url: toUrl(above, colours.current.rgb), width: size.width });
    }
  }, [size, theme, time, altitude, top, shapeAt, props.view, balloonMinX, onBackdrop, shown]);

  return (
    // overflow-hidden: the canvas is exactly SCENE_SCALE css px per logical
    // pixel (a whole number, so pixels stay square), a little wider than the box.
    <div ref={box} aria-hidden="true" className={`overflow-hidden ${props.className ?? ""}`} style={props.style}>
      <canvas
        ref={canvas}
        data-scene={props.view}
        data-balloon={balloon ? `${balloon.x},${balloon.y}` : undefined}
        data-painted={painted || undefined}
        className="block [image-rendering:pixelated]"
        style={size ? { width: size.width * SCENE_SCALE, height: size.height * SCENE_SCALE } : undefined}
      />
    </div>
  );
}
