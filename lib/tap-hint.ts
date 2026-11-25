// When Today points people to "Tap to complete" (plans/habit-tracker.md,
// Features 8 and 8b). The switch is in Settings; the people it's for are the
// ones who tap a key instead of holding it, so after two quick releases
// Today shows a hint under the key, every visit, until this device has
// completed a real hold (then they can hold, and don't need it).
//
// Pure: the component (components/today-screen.tsx) feeds it events, reads
// and saves the "has held" flag in localStorage, and draws the result.

import type { HoldMode } from "./hold";

/** A release quicker than this is a tap. Slower is someone learning to hold. */
export const QUICK_RELEASE_MS = 300;
/** How many quick releases (since Today was shown or the last completion) bring the hint. */
export const RELEASES_BEFORE_HINT = 2;
/** localStorage key: "1" once this device has completed a habit by holding it. */
export const TAP_HINT_HELD_KEY = "tap-hint-held";

/**
 * `habitId`: the key the hint is shown under, or null when hidden.
 * `held`: a real hold happened while this page was loaded (so the rule holds
 * even when localStorage is blocked).
 */
export type TapHintState = { releases: number; habitId: string | null; held: boolean };

export const NO_TAP_HINT: TapHintState = { releases: 0, habitId: null, held: false };

export type TapHintEvent =
  /** "Keep holding…": a key let go before the hold finished. */
  | {
      type: "release";
      habitId: string;
      heldMs: number;
      mode: HoldMode;
      /** The localStorage flag: this device completed a real hold before (false: never, or unreadable). */
      heldBefore: boolean;
    }
  /** A habit was completed: the count starts again. `held`: by a real hold. */
  | { type: "complete"; held: boolean }
  /** Today was hidden: the count and the hint start from nothing (a real hold is still known). */
  | { type: "reset" };

export type TapHintStep = {
  state: TapHintState;
  /** True only on the release that shows the hint (it's announced). */
  shown: boolean;
};

export function nextTapHint(state: TapHintState, event: TapHintEvent): TapHintStep {
  switch (event.type) {
    case "release": {
      // Already showing (it stays for this visit), or nothing to point to.
      if (state.habitId !== null || event.mode !== "hold") return { state, shown: false };
      // They can hold: the hint isn't for them.
      if (event.heldBefore || state.held) return { state, shown: false };
      // Someone learning to hold doesn't count, and doesn't reset the count.
      if (event.heldMs >= QUICK_RELEASE_MS) return { state, shown: false };
      const releases = state.releases + 1;
      if (releases >= RELEASES_BEFORE_HINT) return { state: { ...state, releases: 0, habitId: event.habitId }, shown: true };
      return { state: { ...state, releases }, shown: false };
    }
    case "complete":
      // A shown hint stays (removing it would move the keys under a finger).
      return { state: { ...state, releases: 0, held: state.held || event.held }, shown: false };
    case "reset":
      return { state: { ...NO_TAP_HINT, held: state.held }, shown: false };
  }
}

/** The hint's words: shown under the key (with a link) and announced. */
export const TAP_HINT_TEXT = {
  before: "Hold to complete, or turn on ",
  link: "Tap to complete in Settings",
  after: ".",
} as const;

/** One announcement, instead of "Keep holding to complete X.", when the hint appears. */
export function tapHintAnnouncement(habitName: string): string {
  return `Keep holding to complete ${habitName}, or turn on Tap to complete in Settings.`;
}
