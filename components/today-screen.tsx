"use client";

// Today: the habit keys, the summary line and the messages (plans/habit-
// tracker.md, Feature 3). Saves are optimistic: a key turns done the moment
// the hold finishes, and the server's answer (with fresh data, via
// refresh()) replaces the guess.
//
// Not remounted on a new day (no key on it), so a message that arrives
// together with the new day's data ("Saved for Monday…") stays on screen.

import { startTransition, useEffect, useLayoutEffect, useOptimistic, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClimbStrip, type ZoneMoment } from "@/components/climb/climb-strip";
import { DayWatcher } from "@/components/day-watcher";
import { HabitKey, type KeyHabit } from "@/components/habit-key";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { saveTimezoneCookie } from "@/components/timezone-sync";
import { buttonClass } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/error-text";
import { CM, celebratedIndex, dailyClimbCm, metres, silentlyRaised, zoneMemoryKey, zoneMemoryValue, zoneMomentAfterSave } from "@/lib/altitude";
import { setCheckin, type CheckinResult } from "@/lib/checkin-actions";
import type { HoldMode } from "@/lib/hold";
import { NO_TAP_HINT, TAP_HINT_HELD_KEY, TAP_HINT_TEXT, nextTapHint, tapHintAnnouncement } from "@/lib/tap-hint";
import { applyDone, streakText, summaryLine, weekdayName, type HabitView } from "@/lib/today";

type Props = {
  today: string;
  habits: HabitView[];
  mode: HoldMode;
  /** The page's heading ("Today" and the Demo chip): drawn below the scene strip. */
  heading: ReactNode;
  /** Altitude through yesterday, in centimetres (Feature 10); null if it couldn't be read. */
  beforeTodayCm: number | null;
  /** For the zone moment's memory (per account on this device). */
  userId: string;
};

/** How long the zone moment's card stays, unless tapped away first. */
const MOMENT_MS = 6_000;

/** The highest zone celebrated on this device, or -1 (none, or storage blocked). */
function readCelebrated(userId: string): number {
  try {
    return celebratedIndex(localStorage.getItem(zoneMemoryKey(userId)));
  } catch {
    return -1;
  }
}

function writeCelebrated(userId: string, index: number) {
  try {
    localStorage.setItem(zoneMemoryKey(userId), zoneMemoryValue(index));
  } catch {
    // Blocked storage: the moment may repeat. Never an error.
  }
}

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

export function TodayScreen({ today, habits, mode, heading, beforeTodayCm, userId }: Props) {
  const router = useRouter();
  // Guesses are kept with the day they were made for: one made just before
  // midnight never lands on the next day's key (or its climb).
  const [done, setOptimisticDone] = useOptimistic(
    Object.fromEntries(habits.map((h) => [h.id, { done: h.doneToday, day: today }])) as Record<string, { done: boolean; day: string }>,
    (state, change: { id: string; done: boolean; day: string }) => ({ ...state, [change.id]: { done: change.done, day: change.day } }),
  );
  // The climb (Feature 10): once known, a failed read later (a refresh that
  // hits a hiccup) keeps the last altitude rather than pulling the strip out
  // from under a finger.
  // Kept with its day: yesterday's "before today" is never used for today.
  const [known, setKnown] = useState({ day: today, cm: beforeTodayCm });
  if (beforeTodayCm !== null && (beforeTodayCm !== known.cm || known.day !== today)) setKnown({ day: today, cm: beforeTodayCm });
  const knownBefore = known.day === today ? known.cm : null;
  const [moment, setMoment] = useState<ZoneMoment | null>(null);
  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(() => setMoment(null), MOMENT_MS);
    return () => clearTimeout(timer);
  }, [moment]);
  // Leaving Today (hidden routes stay alive) closes the card, and a save
  // that answers after you left doesn't bring it back.
  const shown = useRef(false);
  useLayoutEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
      setMoment(null);
    };
  }, []);
  // Polite, for screen readers: what just changed. (Errors use their own
  // alert instead, so they aren't read out twice.)
  const [announcement, setAnnouncement] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const holds = useRef(0);
  // The hint toward Tap to complete (lib/tap-hint.ts): after quick taps,
  // until this device has completed a real hold.
  const [tapHint, setTapHint] = useState(NO_TAP_HINT);
  // Hidden routes stay alive (<Activity>): coming back starts from nothing
  // (except knowing about a real hold).
  useLayoutEffect(() => () => setTapHint((state) => nextTapHint(state, { type: "reset" }).state), []);

  /** "Keep holding…": maybe the second quick release, which brings the hint. */
  function released(habit: KeyHabit, heldMs: number) {
    let heldBefore = false;
    try {
      heldBefore = localStorage.getItem(TAP_HINT_HELD_KEY) === "1";
    } catch {
      // Blocked storage (private mode, settings): the hint's own state still
      // knows about a hold on this page. Never an error.
    }
    const step = nextTapHint(tapHint, { type: "release", habitId: habit.id, heldMs, mode, heldBefore });
    setTapHint(step.state);
    say(step.shown ? tapHintAnnouncement(habit.name) : `Keep holding to complete ${habit.name}.`);
  }

  /** A key completed: a real hold means this device can hold, saved now (whatever the save's fate). */
  function completed(habit: KeyHabit, held: boolean) {
    if (held) {
      try {
        localStorage.setItem(TAP_HINT_HELD_KEY, "1");
      } catch {
        // As above.
      }
    }
    setTapHint((state) => nextTapHint(state, { type: "complete", held }).state);
    // The climb this completion adds, from the keys as they are now.
    const climb =
      knownBefore === null || habit.done
        ? null
        : {
            beforeCm: knownBefore + dailyClimbCm(doneCount, keys.length),
            afterCm: knownBefore + dailyClimbCm(doneCount + 1, keys.length),
          };
    save(habit, true, climb);
  }

  function say(text: string) {
    // A different string each time, so the same words are announced again.
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }

  function save(habit: KeyHabit, nowDone: boolean, climb: { beforeCm: number; afterCm: number } | null = null) {
    const server = habits.find((h) => h.id === habit.id);
    if (!server) return;
    say(`${habit.name} ${nowDone ? "done" : "not done"}. ${streakText(applyDone(server, nowDone).streak)}.`);
    setNotice(null);
    // The server works out "today" from this cookie: make sure it's there.
    saveTimezoneCookie();
    startTransition(async () => {
      setOptimisticDone({ id: habit.id, done: nowDone, day: today });
      let result: CheckinResult;
      try {
        result = await setCheckin(habit.id, today, nowDone);
      } catch {
        // No connection, or the app was updated since this page loaded.
        result = { ok: false, reason: "error" };
      }
      const next = noticeFor(result);
      // The zone moment: only once the server has the save (a failed or
      // refused one never claims a height you don't have), and only into a
      // zone never celebrated on this device (read now: another tab may have).
      // Read the memory HERE, as the answer arrives: the refreshed data (and
      // the silent raise it triggers) only lands once this function ends.
      const momentAfter = climb ? zoneMomentAfterSave(climb, result, readCelebrated(userId)) : null;
      if (momentAfter) writeCelebrated(userId, momentAfter.store);
      const zone = momentAfter?.zone ?? null;
      // Part of the same transition, so the message lands together with the
      // server's fresh data (not while the key still shows the guess).
      startTransition(() => {
        if (next) {
          setNotice({ ...next, id: Date.now() });
          if (next.tone === "info") say(next.text);
        }
        if (zone && climb && shown.current) {
          setMoment({ id: Date.now(), zone, gainedCm: climb.afterCm - climb.beforeCm, altitudeCm: climb.afterCm });
          say(`New zone: ${zone.name}. Up ${Math.floor((climb.afterCm - climb.beforeCm) / CM)} metres, to ${metres(climb.afterCm)}.`);
        }
      });
      // The answer may have been lost after the save worked: show what's really saved.
      if (!result.ok && result.reason === "error") router.refresh();
    });
  }

  const keys = habits.map((h) => {
    const guess = done[h.id];
    return applyDone(h, guess && guess.day === today ? guess.done : h.doneToday);
  });
  const doneCount = keys.filter((k) => k.done).length;
  const allDone = keys.length > 0 && doneCount === keys.length;
  // Live: through yesterday from the server, plus today's climb from the keys.
  const altitudeCm = knownBefore === null ? null : knownBefore + dailyClimbCm(doneCount, keys.length);
  // Saved (never a guess): raises the zone memory silently, so a zone reached
  // elsewhere, or before this device knew, never gets a card for a small step.
  const savedAltitudeCm =
    beforeTodayCm === null ? null : beforeTodayCm + dailyClimbCm(habits.filter((h) => h.doneToday).length, habits.length);
  useEffect(() => {
    if (savedAltitudeCm === null) return;
    const raised = silentlyRaised(readCelebrated(userId), savedAltitudeCm);
    if (raised !== null) writeCelebrated(userId, raised);
  }, [savedAltitudeCm, userId]);

  return (
    <>
      <DayWatcher isHolding={() => holds.current > 0} />
      {altitudeCm !== null && <ClimbStrip altitudeCm={altitudeCm} moment={moment} onDismissMoment={() => setMoment(null)} />}
      {heading}
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
                onComplete={(h, how) => completed(h, how.held)}
                onUndo={(h) => save(h, false)}
                onHint={(h, release) => released(h, release.heldMs)}
                onHoldingChange={(holding) => {
                  holds.current = Math.max(0, holds.current + (holding ? 1 : -1));
                }}
              />
              {mode === "hold" && tapHint.habitId === habit.id && <TapHint />}
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

/** Under a key after two quick taps: where "Tap to complete" lives now. */
function TapHint() {
  return (
    // The key's side padding (capped at 20 px): lines up with its name and dots. The link is one
    // piece (inline-block, so it isn't split across lines at normal size)
    // with a 44 px tall hit area that stays in the gap between the keys.
    <p className="mt-3 px-[min(1.25rem,20px)] text-sm font-medium text-pretty text-ink-muted">
      {TAP_HINT_TEXT.before}
      <Link href="/settings" className="-my-3 inline-block py-3 font-semibold text-accent underline decoration-1 underline-offset-2">
        {TAP_HINT_TEXT.link}
      </Link>
      {TAP_HINT_TEXT.after}
    </p>
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
