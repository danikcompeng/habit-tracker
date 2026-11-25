// Today: your habits as keys to press and hold (plans/habit-tracker.md, Feature 3).
import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOutButton, ResetDemoButton } from "@/components/account-actions";
import { FOOTER_LINK } from "@/components/ui/footer-link";
import { TodayScreen } from "@/components/today-screen";
import { buttonClass } from "@/components/ui/button";
import { APP_NAME } from "@/lib/app-identity";
import { isDemoEmail } from "@/lib/demo";
import { HOLD_MODE_COOKIE, parseHoldMode } from "@/lib/preferences";
import { userTimeZone, userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import { buildToday, dayLabel, shortDayLabel, type CheckinRow, type HabitRow, type StreakRow } from "@/lib/today";

// "absolute": the layout's "%s · Ascend" template only reaches pages in
// child segments, and this page shares the layout's segment.
export const metadata: Metadata = { title: { absolute: `Today · ${APP_NAME}` } };

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
      {/* flex-wrap: with zoomed text the pills drop below the date instead
          of running off the screen. */}
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* "Wed, Nov 25" on phones, the full date on wider screens, so the
            header looks the same every day (Features 8b, 8c). No JavaScript:
            - Below 40rem (max-sm: phones, small windows) the full-date layer
              isn't drawn at all. In rem, so a larger default text size in the
              browser (or page zoom) counts as a narrower screen.
            - From 40rem the full date always fits at any default text size.
              Only text-only zoom (Firefox's "Zoom text only") can make it too
              wide; then 8b's rule below shows the short date instead.
            - The slot grows into the space left (flex-1) and keeps its
              automatic minimum, the short date's width (nowrap). No min-w-0
              or clipping here, or the pills would never drop below.
            - The full date sits in a clipped layer the slot's size, after a
              spacer one line tall: too wide, it wraps onto the hidden second
              line and uncovers the short date; otherwise it covers it.
            - The cover is the page background: if the header ever gets its
              own surface, change bg-background with it.
            - Screen readers get one copy of the full date, invisible but the
              slot's size and on top, so a finger exploring the date finds it
              (a 1 px sr-only box can't be found by touch). The visible copies
              are aria-hidden. Nothing is selectable (no doubled date). */}
        <p className="relative flex-1 text-sm font-medium whitespace-nowrap text-ink-muted select-none">
          <span aria-hidden="true" data-day-label="short">
            {shortDayLabel(today)}
          </span>
          <span aria-hidden="true" data-day-layer className="absolute inset-0 flex flex-wrap overflow-hidden max-sm:hidden">
            <span className="h-full w-0" />
            <span data-day-label="full" className="bg-background">
              {dayLabel(today)}
            </span>
          </span>
          <span data-day-label="spoken" className="absolute inset-0 overflow-hidden opacity-0">
            {dayLabel(today)}
          </span>
        </p>
        <nav aria-label="Pages" className="flex shrink-0 items-center gap-2">
          <Link href="/history" className={buttonClass("secondary", { size: "sm", block: false })}>
            History
          </Link>
          <Link href="/habits" className={buttonClass("secondary", { size: "sm", block: false })}>
            Edit
          </Link>
        </nav>
      </header>
      {/* The Demo chip sits beside the heading, not in it: the heading is "Today". */}
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-title">Today</h1>
        {demo && (
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-medium text-ink-muted">Demo</span>
        )}
      </div>

      {/* Not keyed by the day: messages like "Saved for Monday" arrive
          together with the new day's data and must survive it. */}
      <TodayScreen today={today} habits={view} mode={mode} />

      {/* "Tap to complete" moved to Settings (Feature 8); a hint on Today
          points there after two short taps. */}
      <footer className="mt-auto flex flex-col gap-4 pt-12">
        {/* Who's logged in above, the links below: with Settings there are up
            to three links, which don't fit beside an email (Feature 8). */}
        <div className="flex flex-col items-start gap-1 border-t border-line pt-4">
          {/* Who's logged in, so a login link from someone else's email
              (which would log you into THEIR account) is easy to notice. */}
          <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere] text-ink-muted">{demo ? "Demo account" : email}</p>
          {/* -mx-3: the links' own padding, so their text lines up with the
              gutter. gap-x-4: Reset demo (no confirmation) isn't crowded. */}
          <div className="-mx-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/settings" className={FOOTER_LINK}>
              Settings
            </Link>
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
        {/* The date's width: short on phones, full from 40rem (as above). */}
        <div className="h-4 w-20 rounded bg-surface-sunk sm:w-44" />
        <div className="flex gap-2">
          <div className="h-11 w-[90px] rounded-full bg-surface-sunk" />
          <div className="h-11 w-[68px] rounded-full bg-surface-sunk" />
        </div>
      </div>
      <div className="mt-3 h-9 w-23 rounded bg-surface-sunk" />
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
