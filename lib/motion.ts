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
} as const;

/** Quick to start, gentle to land: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
