// Today (for now: who you are and how to leave). Feature 3 replaces the
// body with the habit rows.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogOutButton, ResetDemoButton } from "@/components/account-actions";
import { isDemoEmail } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export default function TodayPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* Reads the login cookie, so it waits for the request (Cache Components). */}
      <Suspense fallback={<div className="h-11" />}>
        <AccountBar />
      </Suspense>
      <h1 className="mt-4 text-title font-bold tracking-tight">Today</h1>
      <p className="mt-2 text-ink-muted">Your habits will be here.</p>
    </main>
  );
}

async function AccountBar() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const demo = isDemoEmail(data.claims.email);
  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      {demo ? (
        <span className="rounded-full bg-surface-sunk px-3 py-1 text-sm font-semibold text-ink-muted">Demo account</span>
      ) : (
        <span />
      )}
      <div className="flex items-center">
        {demo && <ResetDemoButton />}
        <LogOutButton />
      </div>
    </div>
  );
}
