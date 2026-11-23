// The demo account's sample habits, and when to put them back
// (plans/habit-tracker.md, Feature 2). Pure: no database, so it's tested.
// lib/demo.ts does the writing, through the reseed_demo_habits function.

import { addDays, instantOnDay } from "./dates";

type SampleHabit = {
  name: string;
  /** Made this many days ago (in the visitor's timezone). */
  createdDaysAgo: number;
  /** Done on these days: 0 = today, 1 = yesterday... */
  checkinDaysAgo: readonly number[];
};

// Chosen so the first screen shows every state: a long streak done today,
// a streak still waiting for today, a broken streak, a short one, and a
// new habit whose older dots are "before".
export const DEMO_HABITS: readonly SampleHabit[] = [
  { name: "Drink a glass of water", createdDaysAgo: 30, checkinDaysAgo: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 20] },
  { name: "Read 10 pages", createdDaysAgo: 30, checkinDaysAgo: [1, 2, 3, 4, 6, 7, 9, 12, 13] },
  { name: "Stretch for 5 minutes", createdDaysAgo: 30, checkinDaysAgo: [2, 3, 5, 6, 8, 10, 11] },
  { name: "Walk outside", createdDaysAgo: 30, checkinDaysAgo: [0, 1, 3, 4, 5, 9, 16, 17, 18] },
  { name: "No phone in bed", createdDaysAgo: 2, checkinDaysAgo: [1] },
];

export type SeedHabit = { name: string; created_at: string; days: string[] };

/** The payload for reseed_demo_habits: dated from `today` in `timeZone`. */
export function demoSeedPayload(today: string, timeZone: string | undefined): SeedHabit[] {
  return DEMO_HABITS.map((habit) => ({
    name: habit.name,
    created_at: instantOnDay(addDays(today, -habit.createdDaysAgo), timeZone).toISOString(),
    days: habit.checkinDaysAgo.map((n) => addDays(today, -n)),
  }));
}

/** How long the sample data lasts before the next demo sign-in puts it back. */
export const RESEED_AFTER_MS = 60 * 60 * 1000;
/** Clocks on different servers can disagree a little; more than this is a hand-set date. */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

/**
 * The markers live in the demo account's user metadata. Namespaced with
 * "hold_" because the account is shared with Staple, which keeps its own
 * "demo_seeded_*" there.
 */
export const SEEDED_AT_KEY = "hold_demo_seeded_at";
export const SEEDED_DAY_KEY = "hold_demo_seeded_day";

type Metadata = Record<string, unknown> | null | undefined;

/** When the last seed finished, or null if never (or unreadable). */
export function seededAt(metadata: Metadata): Date | null {
  const value = metadata?.[SEEDED_AT_KEY];
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Put the sample data back on this sign-in? Yes if it was never seeded,
 * seeded over an hour ago, seeded for an EARLIER day than the visitor's
 * today (its "done today" would be yesterday's), or seeded "in the future"
 * (a clock set by hand, which would otherwise stop it ever being reset).
 *
 * Not for a LATER day (a visitor further west than the last one): their
 * screen simply ignores the "tomorrow" rows. Reseeding then would let
 * visitors in Tokyo and Toronto, or anyone switching their timezone cookie,
 * wipe the demo on every sign-in.
 */
export function needsReseed(metadata: Metadata, now: Date, today: string): boolean {
  const at = seededAt(metadata);
  if (!at) return true;
  const day = metadata?.[SEEDED_DAY_KEY];
  if (typeof day !== "string" || day < today) return true;
  const age = now.getTime() - at.getTime();
  return age > RESEED_AFTER_MS || age < -CLOCK_SLACK_MS;
}

/** The metadata to write once a seed has finished: its finish time (never a habit's back-dated date) and day. */
export function seededMarkers(finishedAt: Date, today: string): Record<string, string> {
  return { [SEEDED_AT_KEY]: finishedAt.toISOString(), [SEEDED_DAY_KEY]: today };
}

/** The metadata that clears the markers before a seed (null removes a key). */
export const CLEARED_MARKERS = { [SEEDED_AT_KEY]: null, [SEEDED_DAY_KEY]: null } as const;
