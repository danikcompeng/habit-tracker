"use client";

// Today: the habit keys, the summary line and the messages (plans/habit-
// tracker.md, Feature 3). Saves are optimistic: a key turns done the moment
// the hold finishes, and the server's answer (with fresh data, via
// refresh()) replaces the guess.
//
// Not remounted on a new day (no key on it), so a message that arrives
// together with the new day's data ("Saved for Monday…") stays on screen.

import { startTransition, useOptimistic, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DayWatcher } from "@/components/day-watcher";
import { HabitKey, type KeyHabit } from "@/components/habit-key";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { saveTimezoneCookie } from "@/components/timezone-sync";
import { buttonClass } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { setCheckin, type CheckinResult } from "@/lib/checkin-actions";
import type { HoldMode } from "@/lib/hold";
import { applyDone, streakText, summaryLine, weekdayName, type HabitView } from "@/lib/today";

type Props = { today: string; habits: HabitView[]; mode: HoldMode };

type Notice = { tone: "info" | "error"; text: string; id: number };

/** What to tell people after a save that didn't simply work. */
function noticeFor(result: CheckinResult): Omit<Notice, "id"> | null {
  if (result.ok) {
    return result.newDay ? { tone: "info", text: `Saved for ${weekdayName(result.savedFor)}. It's a new day now.` } : null;
  }
  switch (result.reason) {
    case "stale":
      return { tone: "info", text: "It's a new day, so Today was refreshed." };
    case "gone":
      return { tone: "info", text: "That habit changed, so the list was refreshed." };
    case "timezone":
      return {
        tone: "error",
        text: "Couldn't tell which day it is where you are. Check your device's time zone, then reopen the app.",
      };
    default:
      return { tone: "error", text: "Couldn't save. Check your connection and try again." };
  }
}

export function TodayScreen({ today, habits, mode }: Props) {
  const router = useRouter();
  const [done, setOptimisticDone] = useOptimistic(
    Object.fromEntries(habits.map((h) => [h.id, h.doneToday])) as Record<string, boolean>,
    (state, change: { id: string; done: boolean }) => ({ ...state, [change.id]: change.done }),
  );
  // Polite, for screen readers: what just changed. (Errors use their own
  // alert instead, so they aren't read out twice.)
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const holds = useRef(0);

  function say(text: string) {
    // A different string each time, so the same words are announced again.
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }

  function save(habit: KeyHabit, nowDone: boolean) {
    const server = habits.find((h) => h.id === habit.id);
    if (!server) return;
    say(`${habit.name} ${nowDone ? "done" : "not done"}. ${streakText(applyDone(server, nowDone).streak)}.`);
    setNotice(null);
    // The server works out "today" from this cookie: make sure it's there.
    saveTimezoneCookie();
    startTransition(async () => {
      setOptimisticDone({ id: habit.id, done: nowDone });
      let result: CheckinResult;
      try {
        result = await setCheckin(habit.id, today, nowDone);
      } catch {
        // No connection, or the app was updated since this page loaded.
        result = { ok: false, reason: "error" };
      }
      const next = noticeFor(result);
      // Part of the same transition, so the message lands together with the
      // server's fresh data (not while the key still shows the guess).
      startTransition(() => {
        if (next) {
          setNotice({ ...next, id: Date.now() });
          if (next.tone === "info") say(next.text);
        }
      });
      // The answer may have been lost after the save worked: show what's really saved.
      if (!result.ok && result.reason === "error") router.refresh();
    });
  }

  const keys = habits.map((h) => applyDone(h, done[h.id] ?? h.doneToday));
  const doneCount = keys.filter((k) => k.done).length;
  const allDone = keys.length > 0 && doneCount === keys.length;

  return (
    <>
      <DayWatcher isHolding={() => holds.current > 0} />
      {/* At 5 of 5 the line is the day's payoff, so it stops looking like the
          muted instruction it replaces: ink, semibold, a persimmon check. */}
      <p
        className={`mt-2 text-base tabular-nums ${allDone ? "flex items-center gap-2 font-semibold text-ink" : "font-medium text-ink-muted"}`}
      >
        {allDone && <CheckIcon size={20} strokeWidth={2.5} className="shrink-0 text-accent" />}
        {summaryLine(doneCount, keys.length, mode)}
      </p>

      {notice && (
        <div key={notice.id} className="mt-4">
          {notice.tone === "error" ? (
            <ErrorText>{notice.text}</ErrorText>
          ) : (
            <p className="text-sm font-medium text-ink">{notice.text}</p>
          )}
        </div>
      )}

      {keys.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-7 flex flex-col gap-3" aria-label="Habits">
          {keys.map((habit) => (
            <li key={habit.id}>
              <HabitKey
                habit={habit}
                mode={mode}
                onComplete={(h) => save(h, true)}
                onUndo={(h) => save(h, false)}
                onHint={(h) => say(`Keep holding to complete ${h.name}.`)}
                onHoldingChange={(holding) => {
                  holds.current = Math.max(0, holds.current + (holding ? 1 : -1));
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function EmptyState() {
  return (
    <div className="mt-7 flex flex-col items-start gap-5 rounded-key border border-dashed border-ink-muted p-5">
      <p className="text-base text-ink">No habits yet. Add one you want to do every day, then hold it down when it&apos;s done.</p>
      <Link href="/habits" className={buttonClass("primary", { block: false })}>
        <PlusIcon size={20} />
        Add your first habit
      </Link>
    </div>
  );
}
