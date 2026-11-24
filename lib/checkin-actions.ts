"use server";
// Completing and undoing a habit for a day (plans/habit-tracker.md,
// Feature 3, "Saving"). Never throws: every outcome comes back as a
// result, so one bad request can't replace Today with the error page.

import { refresh } from "next/cache";
import { checkinDayStatus } from "./checkin-day";
import { isValidTimeZone, todayIn } from "./dates";
import { requireUser, userTimeZone } from "./server-helpers";

export type CheckinResult =
  | { ok: true; savedFor: string; newDay: boolean }
  | { ok: false; reason: "stale" | "gone" | "invalid" | "timezone" | "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Marks `habitId` done (or not done) on `day`, the day the screen is
 * showing. Says done or not done, never "toggle", so a repeated or retried
 * request can't flip it the wrong way.
 */
export async function setCheckin(habitId: unknown, day: unknown, done: unknown): Promise<CheckinResult> {
  try {
    if (typeof habitId !== "string" || !UUID.test(habitId) || typeof done !== "boolean") {
      return { ok: false, reason: "invalid" };
    }
    const { supabase } = await requireUser();
    const timeZone = await userTimeZone();

    // No usable timezone (the cookie is missing, or names a zone this
    // server doesn't know): "today" can't be worked out, and guessing UTC
    // could save to the wrong day. Its own reason, not "stale", so the
    // screen can fix the cookie instead of refreshing in a loop.
    if (!isValidTimeZone(timeZone)) return { ok: false, reason: "timezone" };

    const status = checkinDayStatus(day, timeZone);
    if (status === "invalid") return { ok: false, reason: "invalid" };
    if (status === "stale") {
      // The screen shows an old day: send the new one back with the answer.
      refresh();
      return { ok: false, reason: "stale" };
    }
    const savedDay = day as string;

    if (done) {
      // Already done is fine (a double tap, a retry): ignore the duplicate.
      const { error } = await supabase
        .from("habit_checkins")
        .upsert({ habit_id: habitId, day: savedDay }, { onConflict: "user_id,habit_id,day", ignoreDuplicates: true });
      if (error) {
        // The habit isn't there (deleted elsewhere, or the demo was reset),
        // or isn't yours: the database refuses the check-in.
        if (error.code === FOREIGN_KEY_VIOLATION) {
          refresh();
          return { ok: false, reason: "gone" };
        }
        console.error("setCheckin insert failed:", { code: error.code, message: error.message });
        return { ok: false, reason: "error" };
      }
    } else {
      // Nothing to delete (already undone, or the habit is gone) is fine:
      // the refresh shows what's really there.
      const { error } = await supabase.from("habit_checkins").delete().eq("habit_id", habitId).eq("day", savedDay);
      if (error) {
        console.error("setCheckin delete failed:", { code: error.code, message: error.message });
        return { ok: false, reason: "error" };
      }
    }

    refresh();
    // Saved in the minutes after midnight for the day before: say so, or
    // the refreshed Today (a new day, not done) would look like a failure.
    return { ok: true, savedFor: savedDay, newDay: savedDay !== todayIn(timeZone) };
  } catch (error) {
    console.error("setCheckin failed:", error);
    return { ok: false, reason: "error" };
  }
}
