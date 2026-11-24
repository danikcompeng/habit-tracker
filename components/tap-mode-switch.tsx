"use client";

// "Tap to complete": for anyone who can't press and hold (some switch,
// voice and screen-reader setups simulate taps, not holds). Saved on this
// device by the server, so it draws the right instructions straight away.

import { useOptimistic, useTransition } from "react";
import type { HoldMode } from "@/lib/hold";
import { setTapToComplete } from "@/lib/preference-actions";

export function TapModeSwitch({ mode }: { mode: HoldMode }) {
  const [on, setOn] = useOptimistic(mode === "tap");
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() =>
        startTransition(async () => {
          setOn(!on);
          await setTapToComplete(!on);
        })
      }
      className="-mx-1 flex min-h-11 items-center justify-between gap-4 rounded-(--radius-field) px-1 text-left text-base font-medium text-ink active:bg-surface-sunk"
    >
      <span className="flex flex-col">
        <span>Tap to complete</span>
        <span className="text-sm text-ink-muted">Instead of press and hold</span>
      </span>
      {/* The switch's look: a track and a knob. Its state is in aria-checked. */}
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 motion-safe:transition-colors motion-safe:duration-(--motion-fast) ${
          on ? "border-accent bg-accent" : "border-ink-muted bg-surface"
        }`}
      >
        <span
          className={`absolute size-5 rounded-full motion-safe:transition-transform motion-safe:duration-(--motion-fast) motion-safe:ease-(--ease-out) ${
            on ? "translate-x-[22px] bg-on-accent" : "translate-x-[2px] bg-ink-muted"
          }`}
        />
      </span>
    </button>
  );
}
