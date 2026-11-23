// Which day may a check-in (or an undo) be saved to?
//
// The screen sends the day it's showing, and the server checks it with
// this one rule (plans/habit-tracker.md, Decisions):
//   - today, in your timezone: yes;
//   - yesterday, but only in the first 10 minutes after your midnight: yes,
//     so a hold that started at 23:59:59 still counts for the day you were
//     looking at;
//   - anything else, tomorrow included: "stale". The screen is showing an
//     old day (say, the app was left open overnight), so it should reload
//     on today rather than quietly save to the wrong day.
//
// Without a known timezone it's always "stale": guessing UTC would let a
// first visit from Honolulu (where UTC is already tomorrow) save to
// tomorrow. The reload that follows sends the timezone cookie.

import { isValidDay, isValidTimeZone, todayIn } from "./dates";

export const MIDNIGHT_GRACE_MINUTES = 10;

export type CheckinDayStatus = "ok" | "stale" | "invalid";

export function checkinDayStatus(
  day: unknown,
  timeZone: string | undefined,
  now: Date = new Date(),
): CheckinDayStatus {
  if (!isValidDay(day)) return "invalid";
  if (!isValidTimeZone(timeZone)) return "stale";
  if (day === todayIn(timeZone, now)) return "ok";
  // Real elapsed time, not the clock on the wall: where daylight saving
  // starts at midnight (Chile, Cuba, Paraguay), 23:59 is followed by 01:00,
  // and "minutes since midnight" would already be 60.
  const graceStart = new Date(now.getTime() - MIDNIGHT_GRACE_MINUTES * 60_000);
  if (day === todayIn(timeZone, graceStart)) return "ok";
  return "stale";
}
