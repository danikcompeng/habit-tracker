"use client";

// Paints the Climb's pixel-art world (lib/climb-scene/scene.ts) on a canvas
// (plans/habit-tracker.md, Feature 10). The scene is drawn at a low logical
// resolution and scaled up by a whole number with image-rendering:
// pixelated, so every pixel is a crisp square. Colours are the --scene-*
// tokens, read from CSS (they follow the colour scheme). Decorative: the
// canvas is aria-hidden; what it shows that matters is in text beside it.
//
// Clouds drift a logical pixel at a time (MOTION.drift), only while the
// scene is on screen and the page is visible, and never with Reduce Motion.

import { useEffect, useRef, useState } from "react";
import { MOTION } from "@/lib/motion";
import {
  Canvas,
  ROLES,
  closeFarOptions,
  drawCloseMoving,
  drawWorldBase,
  drawWorldMoving,
  worldMoon,
  type Theme,
} from "@/lib/climb-scene/scene";

/** CSS pixels per logical pixel. */
export const SCENE_SCALE = 3;
/** The Climb screen's world: metres per row. */
export const WORLD_METRES_PER_ROW = 25;

type Props =
  | { view: "close"; altitude: number; shapeAt: number; className?: string }
  | { view: "world"; altitude: number; top: number; className?: string };

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

function paint(el: HTMLCanvasElement, scene: Canvas, colours: [number, number, number][], reuse: { image: ImageData | null }) {
  if (el.width !== scene.width) el.width = scene.width;
  if (el.height !== scene.height) el.height = scene.height;
  const ctx = el.getContext("2d");
  if (!ctx) return;
  let image = reuse.image;
  if (!image || image.width !== scene.width || image.height !== scene.height) {
    image = ctx.createImageData(scene.width, scene.height);
    reuse.image = image;
  }
  for (let i = 0; i < scene.px.length; i++) {
    const [r, g, b] = colours[scene.px[i]];
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

export function SceneCanvas(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [time, setTime] = useState(0);

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
  // The still layer (sky, mountain, banks…) is drawn once per size, theme
  // and view, then copied; each tick only draws the drifting clouds and you.
  const base = useRef<{ key: string; px: Uint8Array } | null>(null);
  const colours = useRef<{ theme: Theme; rgb: [number, number, number][] } | null>(null);
  const image = useRef<{ image: ImageData | null }>({ image: null });
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
      drawCloseMoving(scene, { width: size.width, height: size.height, theme, time, altitude, you: shapeAt, driftMs: MOTION.drift });
    } else {
      drawWorldMoving(scene, { ...world, time, altitude, driftMs: MOTION.drift });
    }
    if (colours.current?.theme !== theme) colours.current = { theme, rgb: readColours() };
    paint(canvas.current, scene, colours.current.rgb, image.current);
  }, [size, theme, time, altitude, top, shapeAt, props.view]);

  return (
    // overflow-hidden: the canvas is exactly SCENE_SCALE css px per logical
    // pixel (a whole number, so pixels stay square), a little wider than the box.
    <div ref={box} aria-hidden="true" className={`overflow-hidden ${props.className ?? ""}`}>
      <canvas
        ref={canvas}
        data-scene={props.view}
        className="block [image-rendering:pixelated]"
        style={size ? { width: size.width * SCENE_SCALE, height: size.height * SCENE_SCALE } : undefined}
      />
    </div>
  );
}
