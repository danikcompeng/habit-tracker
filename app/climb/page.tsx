// The Climb (plans/habit-tracker.md, Features 10 and 10b): the climb from the
// valley up, with your altitude on it; it has no top (zones go on forever). Reached from Today's scene strip.
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClimbWorld } from "@/components/climb/climb-world";
import { buttonClass } from "@/components/ui/button";
import { metres, metresText, nextZone, zoneAt } from "@/lib/altitude";
import { fetchAltitude } from "@/lib/altitude-data";
import { userTimeZone, userToday } from "@/lib/server-helpers";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Climb" };

export default function ClimbPage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* flex-wrap: with large text, Done drops below the title instead of off the screen. */}
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="text-title">Climb</h1>
        <Link href="/" className={buttonClass("secondary", { size: "sm", block: false }, "shrink-0")}>
          Done
        </Link>
      </header>
      {/* Who you are and your day come with the request. */}
      <Suspense fallback={<ClimbSkeleton />}>
        <Climb />
      </Suspense>
    </main>
  );
}

async function Climb() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login");
  const [today, timeZone] = await Promise.all([userToday(), userTimeZone()]);
  const altitude = await fetchAltitude(supabase, today, timeZone);

  if (!altitude) {
    return (
      <p className="mt-6 text-base text-ink">The climb isn&apos;t ready yet. Try again in a little while.</p>
    );
  }

  const zone = zoneAt(altitude.altitudeCm);
  const next = nextZone(altitude.altitudeCm);
  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-5 flex flex-col items-start gap-2">
        {/* The readout, like the reference's: a label and the height. */}
        <p className="flex flex-wrap items-baseline gap-x-2 rounded-full bg-surface px-4 py-1.5 text-ink">
          <span className="text-sm font-semibold tracking-wide text-ink-muted uppercase">Altitude</span>
          <span className="text-stat">{metres(altitude.altitudeCm)}</span>
        </p>
        <p className="text-base font-medium text-pretty text-ink-muted">
          <span className="font-semibold text-ink">{zone.name}</span>
          {" · "}
          {`${metresText(next.metres)} to ${next.zone.name}`}
        </p>
      </div>
      <ClimbWorld altitudeCm={altitude.altitudeCm} />
    </div>
  );
}

/** The readout and the scene's box, so nothing jumps when they arrive. */
function ClimbSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col">
      <div className="mt-5 h-11 w-52 rounded-full bg-surface-sunk" />
      <div className="mt-2 h-6 w-64 rounded bg-surface-sunk" />
      <div className="mt-5 min-h-[24rem] flex-1 rounded-key bg-surface-sunk" />
    </div>
  );
}
