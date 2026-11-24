// What the History page shows (plans/habit-tracker.md, Feature 7).
// Pure: no database, no clock, so it's tested (lib/history.test.ts).
//
// The day rules are Today's, reused: a habit's days come from weekDots
// (done / open / missed / before), its created day is todayIn(tz,
// created_at), and the current streak is habit_streaks' own number.

import { addDays, daysBetween, todayIn } from "./dates";
import { weekDots, type Dot } from "./streaks";
import { dayLabel } from "./today";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 30;
/** The page reads this many days once; the smaller ranges are part of it. */
export const WINDOW_DAYS = 90;

/** "?range=7" -> 7. Anything else (missing, "abc", "14") -> 30; given twice, the first counts. */
export function parseRange(value: string | string[] | undefined): Range {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return (RANGES as readonly number[]).includes(n) && String(n) === raw ? (n as Range) : DEFAULT_RANGE;
}

/** The first day of the window that ends `today`: windowStart("2026-11-23") -> "2026-08-26". */
export function windowStart(today: string, days: number = WINDOW_DAYS): string {
  return addDays(today, -(days - 1));
}

/** A row from habit_history (supabase/migrations/20261123180000_history.sql). */
export type HistoryRow = {
  habit_id: string;
  name: string;
  created_at: string;
  days: string[];
  lead_in: number;
  current_streak: number;
};

/** A habit as the browser gets it: the created day already in the user's timezone. */
export type HistoryHabit = {
  id: string;
  name: string;
  /** The day it was made, in the user's timezone. */
  createdDay: string;
  /** Check-ins inside the window, oldest first. */
  days: string[];
  /** The run ending the day before the window (see habit_history). */
  leadIn: number;
  currentStreak: number;
};

/** Server side: turns the rows into what the page needs, in the user's timezone. */
export function toHistoryHabits(rows: HistoryRow[], timeZone: string | undefined): HistoryHabit[] {
  return rows.map((row) => ({
    id: row.habit_id,
    name: row.name,
    createdDay: todayIn(timeZone, new Date(row.created_at)),
    days: [...row.days].sort(),
    leadIn: row.lead_in,
    currentStreak: row.current_streak,
  }));
}

/**
 * The longest run of back-to-back check-ins that reaches into the range
 * (ends on or after `rangeStart`), counted in full: a run that began before
 * the window adds `leadIn`, but only if it touches the window's first day.
 * Days after `today` are ignored.
 */
export function longestRun(days: string[], rangeStart: string, today: string, leadIn: number, firstDay: string): number {
  const sorted = [...new Set(days)].filter((d) => d >= firstDay && d <= today).sort();
  let best = 0;
  let runStart = "";
  let runLength = 0;
  let prev = "";
  const close = () => {
    if (runLength === 0 || prev < rangeStart) return;
    best = Math.max(best, runLength + (runStart === firstDay ? leadIn : 0));
  };
  for (const day of sorted) {
    if (prev && daysBetween(prev, day) === 1) {
      runLength++;
    } else {
      close();
      runStart = day;
      runLength = 1;
    }
    prev = day;
  }
  close();
  return best;
}

/**
 * A whole-number percentage that never overstates or hides: 199 of 200 is
 * 99%, not 100%; 1 of 300 is 1%, not 0%. Nothing to count: null ("—").
 */
export function percent(done: number, counted: number): number | null {
  if (counted <= 0) return null;
  const p = Math.round((100 * done) / counted);
  if (p === 100 && done < counted) return 99;
  if (p === 0 && done > 0) return 1;
  return p;
}

export type DayTotal = {
  day: string;
  /** Habits done that day. */
  done: number;
  /** Habits that existed that day (anything but "before"); today includes the open ones. */
  scheduled: number;
};

export type HabitSummary = {
  id: string;
  name: string;
  dots: Dot[];
  done: number;
  /** Done plus missed: "before" and today-not-done-yet don't count. */
  counted: number;
  percent: number | null;
  /** Set when the habit started after the range's first day: explains its "before" dots. */
  addedOn: string | null;
};

export type HistoryView = {
  range: Range;
  today: string;
  from: string;
  days: DayTotal[];
  habits: HabitSummary[];
  done: number;
  counted: number;
  percent: number | null;
  /** The highest current streak (the one Today shows). */
  bestNow: number;
  /** The longest run reaching into the range, in full. */
  longest: number;
  /** "no-habits": none at all. "no-history": habits, but nothing to count yet. */
  empty: "no-habits" | "no-history" | null;
};

/**
 * Everything on the page for one range. `today` must be the day the rows
 * were fetched for, and the rows must cover at least `range` days.
 */
export function buildHistory(habits: HistoryHabit[], today: string, range: Range): HistoryView {
  const from = windowStart(today, range);
  const firstDay = windowStart(today);
  const days: DayTotal[] = Array.from({ length: range }, (_, i) => ({ day: addDays(from, i), done: 0, scheduled: 0 }));

  const summaries = habits.map((habit): HabitSummary => {
    const dots = weekDots(habit.days, today, habit.createdDay, range);
    let done = 0;
    let counted = 0;
    dots.forEach((dot, i) => {
      if (dot.state === "done") done++;
      if (dot.state === "done" || dot.state === "missed") counted++;
      if (dot.state !== "before") days[i].scheduled++;
      if (dot.state === "done") days[i].done++;
    });
    return {
      id: habit.id,
      name: habit.name,
      dots,
      done,
      counted,
      percent: percent(done, counted),
      addedOn: habit.createdDay > from && habit.createdDay <= today ? habit.createdDay : null,
    };
  });

  const done = summaries.reduce((sum, h) => sum + h.done, 0);
  const counted = summaries.reduce((sum, h) => sum + h.counted, 0);
  const bestNow = Math.max(0, ...habits.map((h) => h.currentStreak));
  return {
    range,
    today,
    from,
    days,
    habits: summaries,
    done,
    counted,
    percent: percent(done, counted),
    bestNow,
    // Never below "best now": the current run always reaches into the range.
    // (The database tests check the two agree without this.)
    longest: Math.max(bestNow, ...habits.map((h) => longestRun(h.days, from, today, h.leadIn, firstDay))),
    empty: habits.length === 0 ? "no-habits" : counted === 0 ? "no-history" : null,
  };
}

// Day strings are formatted in UTC: "2026-11-23" is that calendar day
// everywhere (see lib/today.ts).
const shortDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayLetter = new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" });

const utc = (day: string) => new Date(`${day}T00:00:00Z`);

/** "Today", "Yesterday", or "Sat, Nov 14". */
export function dayReadout(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return shortDay.format(utc(day));
}

/** "Nov 14". */
export function shortDate(day: string): string {
  return monthDay.format(utc(day));
}

/** "M", "T", "W"... for the 7-day chart. */
export function weekdayInitial(day: string): string {
  return weekdayLetter.format(utc(day));
}

/** "3 of 5 done", or "No habits yet" on a day before any habit existed. */
export function dayCount(total: DayTotal): string {
  return total.scheduled === 0 ? "No habits yet" : `${total.done} of ${total.scheduled} done`;
}

/** The slider's spoken value: "Monday, November 23: 3 of 5 done". */
export function dayValueText(total: DayTotal, today: string): string {
  const prefix = total.day === today ? "Today, " : "";
  return `${prefix}${dayLabel(total.day)}: ${dayCount(total)}`;
}

/** The sentence under the chart. */
export function summarySentence(view: Pick<HistoryView, "done" | "counted" | "range">): string {
  return `${view.done} of ${view.counted} habit-days done in the last ${view.range} days.`;
}

/** For screen readers, one per habit: "Read 10 pages: 41 of 60 days done, 68%." (plus "Added Oct 9." when it started in the range). */
export function habitSentence(habit: HabitSummary): string {
  const added = habit.addedOn ? ` Added ${shortDate(habit.addedOn)}.` : "";
  if (habit.counted === 0) return `${habit.name}: nothing to count yet.${added}`;
  return `${habit.name}: ${habit.done} of ${habit.counted} ${habit.counted === 1 ? "day" : "days"} done, ${habit.percent}%.${added}`;
}

// ---------------------------------------------------------------------------
// Chart geometry, in day units: each day is 1 wide, each habit 1 tall. The
// SVG stretches this to any width (preserveAspectRatio="none"), so there's
// no measuring; strokes stay crisp with vector-effect: non-scaling-stroke.
// ---------------------------------------------------------------------------

/** Room above the tallest step, so the line drawn there isn't cut in half. */
export const CHART_TOP_INSET = 0.12;

export type ChartGeometry = {
  width: number;
  height: number;
  /** One per day (height 0 when nothing was done). */
  bars: { x: number; y: number; width: number; height: number }[];
  /** The "how many habits existed" step line; breaks where there were none. */
  line: string;
  /**
   * Bars touch and a 1 px stroke separates them: at 90 days a gap would be
   * about 0.6 px, which anti-aliases unevenly (some bars merge).
   */
  separators: boolean;
};

/** The space between bars, as a share of a day: thin bars need less, and none at 90 (see `separators`). */
function barGap(n: number): number {
  return n <= 7 ? 0.44 : n <= 30 ? 0.3 : 0;
}

export function chartGeometry(days: DayTotal[]): ChartGeometry {
  const max = Math.max(1, ...days.map((d) => d.scheduled));
  const height = max + CHART_TOP_INSET;
  const gap = barGap(days.length);
  const bars = days.map((d, i) => ({ x: i + gap / 2, y: height - d.done, width: 1 - gap, height: d.done }));

  let line = "";
  let penY: number | null = null;
  days.forEach((d, i) => {
    if (d.scheduled === 0) {
      penY = null;
      return;
    }
    const y = height - d.scheduled;
    if (penY === null) line += `M${i} ${y}`;
    else if (y !== penY) line += `V${y}`;
    line += `H${i + 1}`;
    penY = y;
  });
  return { width: days.length, height, bars, line, separators: gap === 0 };
}

/** Which day a pointer at `x` (0 to `width` across the chart) is over; clamped to the ends. */
export function scrubIndex(x: number, width: number, n: number): number {
  if (!(width > 0) || n <= 0) return Math.max(0, n - 1);
  return Math.min(n - 1, Math.max(0, Math.floor((x / width) * n)));
}
