import "server-only";
// The shared demo account: who it is, and putting its sample habits back.
//
// "server-only": DEMO_EMAIL and DEMO_PASSWORD must never reach a browser.
// They have no NEXT_PUBLIC_ prefix, so Next.js wouldn't bundle them anyway;
// this line also makes the build fail if a browser file imports this one.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEARED_MARKERS, demoSeedPayload, seededMarkers } from "./demo-seed";

/** The demo login, or null if the env vars aren't set (no demo then). */
export function demoCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_EMAIL?.trim();
  const password = process.env.DEMO_PASSWORD;
  return email && password ? { email, password } : null;
}

/** Is this the demo account's email? Never true when no demo is set up. */
export function isDemoEmail(email: unknown): boolean {
  const demo = process.env.DEMO_EMAIL?.trim().toLowerCase();
  return Boolean(demo) && typeof email === "string" && email.trim().toLowerCase() === demo;
}

/**
 * Replaces the demo account's habits with the samples, dated from `today`
 * in `timeZone`. `supabase` must be logged in as the demo: the database
 * function only ever replaces the caller's own habits (Row Level Security).
 *
 * `user` is checked first as well, so a bug can never wipe a real account.
 *
 * The markers are cleared first and written last, so a failure looks like
 * "never seeded" and the next demo sign-in tries again. The habits
 * themselves change all at once or not at all (one database transaction).
 */
export async function seedDemo(
  supabase: SupabaseClient,
  user: { email?: string },
  today: string,
  timeZone: string | undefined,
): Promise<void> {
  if (!isDemoEmail(user.email)) throw new Error("seedDemo: not the demo account");

  const cleared = await supabase.auth.updateUser({ data: CLEARED_MARKERS });
  if (cleared.error) throw new Error(`seedDemo: clear markers: ${cleared.error.message}`);

  const { error } = await supabase.rpc("reseed_demo_habits", { p_habits: demoSeedPayload(today, timeZone) });
  if (error) throw new Error(`seedDemo: reseed: ${error.message} (${error.code})`);

  const marked = await supabase.auth.updateUser({ data: seededMarkers(new Date(), today) });
  if (marked.error) throw new Error(`seedDemo: write markers: ${marked.error.message}`);
}
