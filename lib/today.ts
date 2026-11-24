// What the Today screen shows, worked out from the database rows.
// Pure (no database, no clock), so it's tested.

import { todayIn } from "./dates";
import { weekDots, type Dot } from "./streaks";

export type HabitRow = { id: string; name: string; created_at: string };
export type CheckinRow = { habit_id: string; day: string };
export type StreakRow = { habit_id: string; current_streak: number };

export type HabitView = {
  id: string;
  name: string;
  /** As the server has it; the screen may show a newer, optimistic value. */
  doneToday: boolean;
  /** Current streak as the server counted it (habit_streaks). */
  streak: number;
  /** The last 7 days, oldest first. */
  dots: Dot[];
};

/**
 * One view per habit, in the order given (already sorted by the query).
 * `today` must be the same day the check-ins and streaks were fetched for,
 * and `timeZone` the user's, so "created on" is their local day.
 */
export function buildToday(
  habits: HabitRow[],
  checkins: CheckinRow[],
  streaks: StreakRow[],
  today: string,
  timeZone: string | undefined,
): HabitView[] {
  const daysByHabit = new Map<string, string[]>();
  for (const c of checkins) {
    const days = daysByHabit.get(c.habit_id) ?? [];
    days.push(c.day);
    daysByHabit.set(c.habit_id, days);
  }
  const streakByHabit = new Map(streaks.map((s) => [s.habit_id, s.current_streak]));

  return habits.map((habit) => {
    const days = daysByHabit.get(habit.id) ?? [];
    return {
      id: habit.id,
      name: habit.name,
      doneToday: days.includes(today),
      streak: streakByHabit.get(habit.id) ?? 0,
      dots: weekDots(days, today, todayIn(timeZone, new Date(habit.created_at))),
    };
  });
}

// Day strings are formatted in UTC: "2026-11-23" means that calendar day
// everywhere. Formatting it in the browser's own zone would turn it into
// Sunday the 22nd anywhere west of UTC.
const longDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

/** "Monday, November 23". */
export function dayLabel(day: string): string {
  return longDay.format(new Date(`${day}T00:00:00Z`));
}

/** "Monday". */
export function weekdayName(day: string): string {
  return weekday.format(new Date(`${day}T00:00:00Z`));
}

/** "12-day streak", "1-day streak", or "Start today" at 0. */
export function streakText(streak: number): string {
  return streak > 0 ? `${streak}-day streak` : "Start today";
}

/** For screen readers: "Last 7 days: 5 done, 1 missed. Today: not done yet." */
export function dotsSummary(dots: Dot[]): string {
  const past = dots.slice(0, -1);
  const done = past.filter((d) => d.state === "done").length;
  const missed = past.filter((d) => d.state === "missed").length;
  const isNew = past.some((d) => d.state === "before");
  const todayDone = dots.at(-1)?.state === "done";
  const parts = [`${done} done`, `${missed} missed`];
  return `Previous 6 days: ${parts.join(", ")}${isNew ? " (new this week)" : ""}. Today: ${todayDone ? "done" : "not done yet"}.`;
}

/**
 * The line under the title. The instruction stays while anything is left
 * to do (a demo visitor opens on "2 of 5 done" and must still learn that a
 * key is held, not tapped); it goes at "All done".
 */
export function summaryLine(doneCount: number, total: number, mode: "hold" | "tap"): string {
  if (total === 0) return "Add a habit to get started.";
  if (doneCount === total) return "All done for today";
  const how = mode === "tap" ? "Tap a habit to complete it." : "Hold a habit to complete it.";
  return doneCount === 0 ? how : `${doneCount} of ${total} done · ${how}`;
}

/** A habit as a key shows it: server truth, with the optimistic "done" applied. */
export type KeyView = { id: string; name: string; done: boolean; streak: number; dots: Dot[] };

/**
 * Applies an optimistic "done today" to a habit from the server: the
 * streak moves by one (lib/streaks.ts adjustStreak) and today's dot
 * follows. Past days never change.
 */
export function applyDone(habit: HabitView, done: boolean): KeyView {
  const streak = Math.max(0, habit.streak + Number(done) - Number(habit.doneToday));
  const dots = habit.dots.map((dot, i) =>
    i === habit.dots.length - 1 ? { ...dot, state: done ? ("done" as const) : ("open" as const) } : dot,
  );
  return { id: habit.id, name: habit.name, done, streak, dots };
}
