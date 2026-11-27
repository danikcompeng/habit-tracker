// Ascend's motion timings (plans/habit-tracker.md, Design direction).
// The same numbers are CSS variables in app/globals.css (--motion-*), for
// classes like duration-(--motion-fast); lib/motion.test.ts checks the two
// match. JavaScript animations (the hold fill, the pop) use these.

export const MOTION = {
  /** Answer to a tap: press, colour changes. */
  fast: 150,
  /** Undo fading back. */
  base: 200,
  /** The "done" pop. */
  pop: 250,
  /** How long you hold a habit to complete it. */
  hold: 650,
  /**
   * The Climb's scene (Feature 10): clouds drift one logical pixel per this
   * many ms (×0.6–1.4 by depth), stepping, never sliding, so the pixels stay
   * crisp. The scene's only movement on its own; none with Reduce Motion.
   */
  drift: 700,
  /** The view lifting (or settling) to a new altitude after a completion. */
  lift: 600,
  /** The zone celebration (Feature 10h): the view's lift, with the balloon leading it. */
  celebrate: 1300,
  /** The zone card starts landing this long into the celebration (its 250 ms wipe, Feature 10i: landed by 1,200 ms), as the balloon settles. */
  land: 950,
  /** The last confetti bit is gone by this. */
  confetti: 2000,
  /** Today's strip growing into Climb's window, and back (Feature 10i): a view-transition morph. */
  morph: 350,
} as const;

/**
 * The view-transition name Today's strip and Climb's window share (Feature
 * 10i): one grows into the other (a plain module, so server pages get the string).
 */
export const CLIMB_SCENE = "climb-scene";

/**
 * The pair morphs only for a navigation of that type: the strip link and
 * Climb's Done carry it. Loading reveals, refreshes and the browser's back
 * and swipe (untyped) don't animate.
 */
export const MORPH_ONLY = { [CLIMB_SCENE]: "morph", default: "none" } as const;

/** Quick to start, gentle to land: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** A soft ease-out that glides in to land, for things that travel or unroll (the strip's morph, the card's wipe; Feature 10i): cubic-bezier(0.32, 0.72, 0, 1). Not symmetric: it starts at speed. */
export const EASE_GLIDE = "cubic-bezier(0.32, 0.72, 0, 1)";
