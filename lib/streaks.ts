// Streak and 7-day dot rules (plans/habit-tracker.md, Feature 1).
//
// The database works out each streak (habit_streaks in the migration);
// currentStreak here is the same rule in TypeScript. tests/db checks the
// two agree on hundreds of random histories, so neither can drift.

import { addDays, lastDays } from "./dates";

/**
 * Back-to-back days with a check-in, ending today if today is done,
 * otherwise ending yesterday: the day isn't over, so the streak is still
 * alive. Missing both yesterday and today means 0. Days after `today` are
 * ignored.
 */
export function currentStreak(days: Iterable<string>, today: string): number {
  const done = new Set(days);
  let cursor = done.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (done.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * The streak to show right after you complete or undo today, before the
 * server has answered. Completing today adds one, undoing takes one away,
 * because today is always the newest day of the run.
 */
export function adjustStreak(serverStreak: number, serverDoneToday: boolean, doneToday: boolean): number {
  return Math.max(0, serverStreak + Number(doneToday) - Number(serverDoneToday));
}

/**
 * - done: checked in. Always wins, even before the habit's created day.
 * - open: today, not done yet. Not a miss: the day isn't over.
 * - missed: a past day without a check-in.
 * - before: before the habit existed, so it isn't counted as a miss.
 */
export type DotState = "done" | "open" | "missed" | "before";
export type Dot = { day: string; state: DotState };

/**
 * The last `n` days ending today, oldest first. `createdDay` must be the
 * day the habit was made IN THE USER'S TIMEZONE (todayIn(tz, created_at)),
 * never a slice of the UTC timestamp.
 */
export function weekDots(checkedDays: Iterable<string>, today: string, createdDay: string, n = 7): Dot[] {
  const done = new Set(checkedDays);
  return lastDays(today, n).map((day) => ({
    day,
    state: done.has(day) ? "done" : day === today ? "open" : day < createdDay ? "before" : "missed",
  }));
}
