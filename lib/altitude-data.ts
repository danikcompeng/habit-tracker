// Reads your altitude from the database (plans/habit-tracker.md, Feature 10).
//
// habit_altitude() can be missing (the migration not applied yet) or fail
// like any query. The climb is never worth breaking a page for: this gives
// null, logs why, and Today simply shows no scene strip.

/** Just the one method this needs, so tests can pass a stand-in. */
type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

export type AltitudeData = { altitudeCm: number; beforeTodayCm: number };

export async function fetchAltitude(supabase: RpcClient, today: string, timeZone: string | undefined): Promise<AltitudeData | null> {
  try {
    // No tz cookie yet (a first visit): UTC, the same fallback as "today" itself.
    const { data, error } = await supabase.rpc("habit_altitude", { p_today: today, p_tz: timeZone ?? "UTC" });
    if (error) {
      console.error("habit_altitude failed:", { code: error.code, message: error.message });
      return null;
    }
    const row = Array.isArray(data) && data.length === 1 ? (data[0] as Record<string, unknown>) : null;
    const altitudeCm = Number(row?.altitude_cm);
    const beforeTodayCm = Number(row?.before_today_cm);
    if (!Number.isSafeInteger(altitudeCm) || !Number.isSafeInteger(beforeTodayCm) || altitudeCm < 0 || beforeTodayCm < 0) {
      console.error("habit_altitude returned something unexpected:", data);
      return null;
    }
    return { altitudeCm, beforeTodayCm };
  } catch (error) {
    console.error("habit_altitude failed:", error);
    return null;
  }
}
