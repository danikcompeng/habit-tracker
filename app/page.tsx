// Today: your habits as keys to press and hold (plans/habit-tracker.md, Feature 3).
import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOutButton, ResetDemoButton } from "@/components/account-actions";
import { TapModeSwitch } from "@/components/tap-mode-switch";
import { TodayScreen } from "@/components/today-screen";
import { buttonClass } from "@/components/ui/button";
import { isDemoEmail } from "@/lib/demo";
import { HOLD_MODE_COOKIE, parseHoldMode } from "@/lib/preferences";
import { userTimeZone, userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import { buildToday, dayLabel, type CheckinRow, type HabitRow, type StreakRow } from "@/lib/today";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Everything here depends on who you are and what day it is for you,
          so it waits for the request (Cache Components). */}
      <Suspense fallback={<TodaySkeleton />}>
        <Today />
      </Suspense>
    </main>
  );
}

async function Today() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const email = auth.claims.email as string | undefined;

  // One "today" for everything on this screen, so the streaks, dots and
  // the day a hold is saved to always agree.
  const [today, timeZone, cookieStore] = await Promise.all([userToday(), userTimeZone(), cookies()]);
  const mode = parseHoldMode(cookieStore.get(HOLD_MODE_COOKIE)?.value);

  const [habits, checkins, streaks] = await Promise.all([
    supabase.from("habits").select("id, name, created_at").order("position").order("created_at").order("id"),
    supabase.from("habit_checkins").select("habit_id, day").gte("day", addDays(today, -6)).lte("day", today),
    supabase.rpc("habit_streaks", { p_today: today }),
  ]);
  const failed = habits.error ?? checkins.error ?? streaks.error;
  // app/error.tsx shows "Couldn't load your habits" with Try again.
  if (failed) throw new Error(`Today: ${failed.message} (${failed.code})`);

  const view = buildToday(
    habits.data as HabitRow[],
    checkins.data as CheckinRow[],
    streaks.data as StreakRow[],
    today,
    timeZone,
  );
  const demo = isDemoEmail(email);

  return (
    <>
      <header className="flex min-h-12 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-sm font-medium whitespace-nowrap text-ink-muted">{dayLabel(today)}</p>
          {demo && (
            <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-medium text-ink-muted">Demo</span>
          )}
        </div>
        <Link href="/habits" className={buttonClass("secondary", { size: "sm", block: false }, "shrink-0")}>
          Edit
        </Link>
      </header>
      <h1 className="mt-3 text-title font-bold tracking-tight">Today</h1>

      {/* Not keyed by the day: messages like "Saved for Monday" arrive
          together with the new day's data and must survive it. */}
      <TodayScreen today={today} habits={view} mode={mode} />

      <footer className="mt-auto flex flex-col gap-4 pt-12">
        <TapModeSwitch mode={mode} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          {/* Who's logged in, so a login link from someone else's email
              (which would log you into THEIR account) is easy to notice. */}
          <p className="min-w-0 truncate text-sm font-medium text-ink-muted">{demo ? "Demo account" : email}</p>
          {/* -mr-3: the links' own padding, so their text lines up with the keys' right edge. */}
          <div className="-mr-3 flex items-center gap-2">
            {demo && <ResetDemoButton />}
            <LogOutButton />
          </div>
        </div>
      </footer>
    </>
  );
}

/** Key-shaped placeholders, so nothing jumps when the habits arrive. */
function TodaySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex min-h-12 items-center justify-between">
        <div className="h-4 w-48 rounded bg-surface-sunk" />
        <div className="h-11 w-[70px] rounded-full bg-surface-sunk" />
      </div>
      <div className="mt-3 h-9 w-32 rounded bg-surface-sunk" />
      <div className="mt-3 h-5 w-64 rounded bg-surface-sunk" />
      <div className="mt-7 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          // The height of a real key (a one-line name), plus its lip.
          <div key={i} className="mb-1 h-[104px] rounded-key bg-surface-sunk" />
        ))}
      </div>
    </div>
  );
}
