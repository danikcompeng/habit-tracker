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
  /** The zone card starts landing this long into the celebration (its 200 ms card-in: landed by 1,150 ms), as the balloon settles. */
  land: 950,
  /** The last confetti bit is gone by this. */
  confetti: 2000,
} as const;

/** Quick to start, gentle to land: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
