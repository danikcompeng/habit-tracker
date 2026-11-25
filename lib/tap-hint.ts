// When Today points people to "Tap to complete" (plans/habit-tracker.md,
// Feature 8). The switch is in Settings; the people it's for are the ones
// who tap a key instead of holding it, so after two quick releases Today
// shows a hint under the key, at most once a day.
//
// Pure: the component (components/today-screen.tsx) feeds it events, reads
// and saves the "shown today" day in localStorage, and draws the result.

import type { HoldMode } from "./hold";

/** A release quicker than this is a tap. Slower is someone learning to hold. */
export const QUICK_RELEASE_MS = 300;
/** How many quick releases (since Today was shown or the last completion) bring the hint. */
export const RELEASES_BEFORE_HINT = 2;
/** localStorage key: the user's day ("YYYY-MM-DD") the hint was last shown. */
export const TAP_HINT_DAY_KEY = "tap-hint-day";

/** `habitId`: the key the hint is shown under, or null when hidden. */
export type TapHintState = { releases: number; habitId: string | null };

export const NO_TAP_HINT: TapHintState = { releases: 0, habitId: null };

export type TapHintEvent =
  /** "Keep holding…": a key let go before the hold finished. */
  | {
      type: "release";
      habitId: string;
      heldMs: number;
      mode: HoldMode;
      /** The day saved in localStorage when the hint was last shown (null: never, or unreadable). */
      shownOn: string | null;
      today: string;
    }
  /** A habit was completed: they've got it, so the count starts again. */
  | { type: "complete" }
  /** Today was hidden, or the day changed: start from nothing. */
  | { type: "reset" };

export type TapHintStep = {
  state: TapHintState;
  /** True only on the release that shows the hint: save `today` as the shown day. */
  shown: boolean;
};

export function nextTapHint(state: TapHintState, event: TapHintEvent): TapHintStep {
  switch (event.type) {
    case "release": {
      // Already showing (it stays for this visit), or nothing to point to.
      if (state.habitId !== null || event.mode !== "hold") return { state, shown: false };
      // Someone learning to hold doesn't count, and doesn't reset the count.
      if (event.heldMs >= QUICK_RELEASE_MS) return { state, shown: false };
      const releases = state.releases + 1;
      // Day strings compared for equality only: a time-zone change that
      // moves "today" backwards can't hide it.
      if (releases >= RELEASES_BEFORE_HINT && event.shownOn !== event.today) {
        return { state: { releases: 0, habitId: event.habitId }, shown: true };
      }
      return { state: { releases, habitId: null }, shown: false };
    }
    case "complete":
      // A shown hint stays (removing it would move the keys under a finger).
      return { state: { ...state, releases: 0 }, shown: false };
    case "reset":
      return { state: NO_TAP_HINT, shown: false };
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
