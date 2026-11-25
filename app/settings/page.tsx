// Settings (plans/habit-tracker.md, Feature 8): per-device preferences,
// reached from Today's footer. One section for now; later settings are more
// sections, or more rows in a card separated by hairlines (no card on card).
import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SettingsDone } from "@/components/settings-done";
import { TapModeSwitch } from "@/components/tap-mode-switch";
import { HOLD_MODE_COOKIE, parseHoldMode } from "@/lib/preferences";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[32rem] flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* flex-wrap: with large text, Done drops below the title instead of off the screen. */}
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="text-title font-bold tracking-tight">Settings</h1>
        <SettingsDone />
      </header>
      <section aria-labelledby="completing-title" className="mt-7">
        <h2 id="completing-title" className="text-base font-semibold">
          Completing habits
        </h2>
        {/* px-5: the same text column as History's cards and Today's keys. */}
        <div className="mt-3 rounded-(--radius-field) border border-line bg-surface px-5 py-4">
          {/* The cookie only exists per request (Cache Components). */}
          <Suspense fallback={<SwitchSkeleton />}>
            <CompletingSettings />
          </Suspense>
        </div>
        {/* A cookie on this phone or browser: another device keeps its own. */}
        <p className="mt-3 px-5 text-sm font-medium text-ink-muted">Saved on this device.</p>
      </section>
    </main>
  );
}

async function CompletingSettings() {
  const mode = parseHoldMode((await cookies()).get(HOLD_MODE_COOKIE)?.value);
  return <TapModeSwitch mode={mode} />;
}

/** The switch row's height, so nothing jumps when it arrives. */
function SwitchSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="h-4 w-32 rounded bg-surface-sunk" />
        <div className="h-3.5 w-44 rounded bg-surface-sunk" />
      </div>
      <div className="h-7 w-12 rounded-full bg-surface-sunk" />
    </div>
  );
}
