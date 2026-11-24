// Manage habits: add, rename, reorder, delete (plans/habit-tracker.md, Feature 4).
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HabitsManager } from "@/components/habits/habits-manager";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Habits" };

export default function HabitsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Suspense fallback={<HabitsSkeleton />}>
        <Habits />
      </Suspense>
    </main>
  );
}

async function Habits() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");

  const { data, error } = await supabase
    .from("habits")
    .select("id, name")
    .order("position")
    .order("created_at")
    .order("id");
  if (error) throw new Error(`Habits: ${error.message} (${error.code})`);

  return <HabitsManager habits={data as { id: string; name: string }[]} />;
}

function HabitsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex min-h-12 items-center justify-between">
        <div className="h-9 w-32 rounded bg-surface-sunk" />
        <div className="h-11 w-24 rounded-full bg-surface-sunk" />
      </div>
      <div className="mt-6 h-5 w-24 rounded bg-surface-sunk" />
      <div className="mt-2 h-12 rounded-(--radius-field) bg-surface-sunk" />
      <div className="mt-3 h-12 rounded-full bg-surface-sunk" />
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-(--radius-field) bg-surface-sunk" />
        ))}
      </div>
    </div>
  );
}
