// History: charts of what's been logged (plans/habit-tracker.md, Feature 7).
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HistoryScreen } from "@/components/history/history-screen";
import { buttonClass } from "@/components/ui/button";
import { parseRange, toHistoryHabits, windowStart, type HistoryRow } from "@/lib/history";
import { userTimeZone, userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="flex min-h-12 items-center justify-between gap-3">
        <h1 className="text-title font-bold tracking-tight">History</h1>
        <Link href="/" className={buttonClass("secondary", { size: "sm", block: false }, "shrink-0")}>
          Done
        </Link>
      </header>
      {/* Who you are, your day and the range all come with the request. */}
      <Suspense fallback={<HistorySkeleton />}>
        <History searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function History({ searchParams }: Pick<PageProps<"/history">, "searchParams">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");

  const [today, timeZone, params] = await Promise.all([userToday(), userTimeZone(), searchParams]);
  // The largest range, once: 7 and 30 are part of it (lib/history.ts).
  const { data, error } = await supabase.rpc("habit_history", { p_from: windowStart(today), p_today: today });
  // app/error.tsx shows "Couldn't load your habits" with Try again.
  if (error) throw new Error(`History: ${error.message} (${error.code})`);

  return (
    <HistoryScreen
      habits={toHistoryHabits(data as HistoryRow[], timeZone)}
      today={today}
      initialRange={parseRange(params.range)}
    />
  );
}

/** The switch, the numbers, the chart and two rows, so nothing jumps when they arrive. */
function HistorySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mt-6 h-[52px] rounded-full bg-surface-sunk" />
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[66px] rounded bg-surface-sunk" />
        ))}
      </div>
      <div className="mt-8 h-[318px] rounded-(--radius-field) bg-surface-sunk" />
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 rounded-(--radius-field) bg-surface-sunk" />
        ))}
      </div>
    </div>
  );
}
