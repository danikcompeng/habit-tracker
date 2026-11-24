import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  CHART_TOP_INSET,
  buildHistory,
  chartGeometry,
  dayCount,
  dayReadout,
  dayValueText,
  habitSentence,
  longestRun,
  parseRange,
  percent,
  scrubIndex,
  shortDate,
  summarySentence,
  toHistoryHabits,
  weekdayInitial,
  windowStart,
  type HistoryHabit,
} from "./history";

const TODAY = "2026-11-23"; // a Monday
const ago = (n: number) => addDays(TODAY, -n);
const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => ago(from - i));

function habit(over: Partial<HistoryHabit> = {}): HistoryHabit {
  return { id: "h", name: "Habit", createdDay: ago(200), days: [], leadIn: 0, currentStreak: 0, ...over };
}

describe("parseRange", () => {
  it("takes 7, 30 or 90, and anything else is 30", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("30")).toBe(30);
    expect(parseRange("90")).toBe(90);
    for (const bad of [undefined, "", "14", "abc", "7.0", " 7", "07", "-7", "Infinity"]) expect(parseRange(bad), String(bad)).toBe(30);
  });
  it("uses the first value when ?range= is given twice", () => {
    expect(parseRange(["7", "90"])).toBe(7);
    expect(parseRange([])).toBe(30);
  });
});

describe("windowStart", () => {
  it("is the first of the N days ending today", () => {
    expect(windowStart(TODAY, 7)).toBe("2026-11-17");
    expect(windowStart(TODAY)).toBe("2026-08-26"); // 90 days
    expect(windowStart("2027-01-03", 7)).toBe("2026-12-28"); // across the year end
  });
});

describe("toHistoryHabits", () => {
  it("works out the created day in the user's timezone, not UTC", () => {
    const rows = [{ habit_id: "a", name: "A", created_at: "2026-11-23T03:00:00Z", days: ["2026-11-22"], lead_in: 2, current_streak: 1 }];
    expect(toHistoryHabits(rows, "America/Toronto")[0]).toEqual({
      id: "a",
      name: "A",
      createdDay: "2026-11-22", // 10 pm the evening before, in Toronto
      days: ["2026-11-22"],
      leadIn: 2,
      currentStreak: 1,
    });
    expect(toHistoryHabits(rows, "UTC")[0].createdDay).toBe("2026-11-23");
    // No tz cookie yet: UTC, the same fallback as Today.
    expect(toHistoryHabits(rows, undefined)[0].createdDay).toBe("2026-11-23");
  });
});

describe("longestRun", () => {
  const first = windowStart(TODAY);

  it("finds the longest run that reaches into the range", () => {
    const days = [...range(40, 31), ...range(10, 8), ago(1), ago(0)];
    expect(longestRun(days, windowStart(TODAY, 90), TODAY, 0, first)).toBe(10);
    // The 10-day run ended 31 days ago: outside the 30-day range.
    expect(longestRun(days, windowStart(TODAY, 30), TODAY, 0, first)).toBe(3);
    expect(longestRun(days, windowStart(TODAY, 7), TODAY, 0, first)).toBe(2);
  });

  it("counts a run in full when it started before the range", () => {
    const days = range(20, 0); // 21 days, ending today
    expect(longestRun(days, windowStart(TODAY, 7), TODAY, 0, first)).toBe(21);
  });

  it("adds the lead-in when the run touches the window's first day", () => {
    const days = range(89, 80); // the window's first 10 days
    expect(longestRun(days, windowStart(TODAY, 90), TODAY, 15, first)).toBe(25);
  });

  it("ignores the lead-in when the window's first day isn't done (that run stopped before it)", () => {
    const days = range(88, 80);
    expect(longestRun(days, windowStart(TODAY, 90), TODAY, 15, first)).toBe(9);
  });

  it("ignores days after today and repeats", () => {
    expect(longestRun([ago(1), ago(0), addDays(TODAY, 1), addDays(TODAY, 2), ago(0)], ago(6), TODAY, 0, first)).toBe(2);
  });

  it("is 0 with nothing done", () => {
    expect(longestRun([], ago(6), TODAY, 4, first)).toBe(0);
  });

  it("runs across a leap day and the year end", () => {
    expect(longestRun(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-02-25", "2028-03-01", 0, "2027-12-03")).toBe(3);
    expect(longestRun(["2026-12-30", "2026-12-31", "2027-01-01"], "2026-12-27", "2027-01-02", 0, "2026-10-05")).toBe(3);
  });
});

describe("percent", () => {
  it("rounds, but never says 100% unless everything was done, or 0% when something was", () => {
    expect(percent(3, 4)).toBe(75);
    expect(percent(2, 3)).toBe(67);
    expect(percent(199, 200)).toBe(99);
    expect(percent(200, 200)).toBe(100);
    expect(percent(1, 300)).toBe(1);
    expect(percent(0, 300)).toBe(0);
  });
  it("is null with nothing to count", () => {
    expect(percent(0, 0)).toBeNull();
  });
});

describe("buildHistory", () => {
  it("counts done and missed days; today counts once done, and not while open", () => {
    const done = habit({ id: "a", days: [ago(2), ago(0)] });
    const open = habit({ id: "b", days: [ago(1)] });
    const view = buildHistory([done, open], TODAY, 7);
    const [a, b] = view.habits;
    expect([a.done, a.counted, a.percent]).toEqual([2, 7, 29]);
    expect([b.done, b.counted, b.percent]).toEqual([1, 6, 17]); // today still open: 6 days counted
    expect([view.done, view.counted, view.percent]).toEqual([3, 13, 23]);
    // Today's bar counts both habits (2 scheduled), with 1 done so far.
    expect(view.days.at(-1)).toEqual({ day: TODAY, done: 1, scheduled: 2 });
    expect(view.days[0]).toEqual({ day: ago(6), done: 0, scheduled: 2 });
  });

  it("counts a habit added mid-range only from its created day, and says when it was added", () => {
    const added = habit({ createdDay: ago(3), days: [ago(3), ago(1)] });
    const view = buildHistory([added], TODAY, 7);
    expect(view.habits[0]).toMatchObject({ done: 2, counted: 3, percent: 67, addedOn: ago(3) });
    expect(view.days.map((d) => d.scheduled)).toEqual([0, 0, 0, 1, 1, 1, 1]);
    expect(view.habits[0].dots.map((d) => d.state)).toEqual(["before", "before", "before", "done", "missed", "done", "open"]);
  });

  it("doesn't say 'added' for a habit made on the range's first day or before", () => {
    expect(buildHistory([habit({ createdDay: ago(6) })], TODAY, 7).habits[0].addedOn).toBeNull();
    expect(buildHistory([habit({ createdDay: ago(5) })], TODAY, 7).habits[0].addedOn).toBe(ago(5));
  });

  it("still counts a check-in from before the created day (done always wins, as on Today)", () => {
    const view = buildHistory([habit({ createdDay: ago(1), days: [ago(2)] })], TODAY, 7);
    expect(view.habits[0]).toMatchObject({ done: 1, counted: 2 });
    expect(view.days[4]).toEqual({ day: ago(2), done: 1, scheduled: 1 });
  });

  it("leaves out check-ins dated after today (saved further east, viewed further west)", () => {
    const view = buildHistory([habit({ days: [ago(0), addDays(TODAY, 1)], currentStreak: 1 })], TODAY, 7);
    expect(view.done).toBe(1);
    expect(view.days).toHaveLength(7);
    expect(view.longest).toBe(1);
  });

  it("takes the best current streak from the server, and the longest is never below it", () => {
    // A consistent history: 95 days = the whole 90-day window plus a 5-day lead-in.
    const habits = [
      habit({ id: "a", days: range(89, 0), currentStreak: 95, leadIn: 5 }),
      habit({ id: "b", days: [ago(1)], currentStreak: 1 }),
    ];
    for (const r of [7, 30, 90] as const) {
      const view = buildHistory(habits, TODAY, r);
      expect(view.bestNow).toBe(95);
      expect(view.longest).toBe(95);
    }
    // And if the two ever disagreed, the page still wouldn't say longest < best now.
    const drifted = buildHistory([habit({ days: range(29, 0), currentStreak: 45 })], TODAY, 7);
    expect(drifted.longest).toBeGreaterThanOrEqual(drifted.bestNow);
  });

  it("works out the smaller ranges from the same 90 days", () => {
    const h = habit({ days: [...range(60, 50), ago(3)] });
    expect(buildHistory([h], TODAY, 90).longest).toBe(11);
    expect(buildHistory([h], TODAY, 30).longest).toBe(1);
    expect(buildHistory([h], TODAY, 30).done).toBe(1);
    expect(buildHistory([h], TODAY, 90).done).toBe(12);
  });

  it("has an empty state for no habits, and for habits with nothing to count yet", () => {
    expect(buildHistory([], TODAY, 30)).toMatchObject({ empty: "no-habits", percent: null, bestNow: 0, longest: 0 });
    const brandNew = buildHistory([habit({ createdDay: TODAY })], TODAY, 30);
    expect(brandNew).toMatchObject({ empty: "no-history", counted: 0, percent: null });
    expect(brandNew.days.at(-1)).toEqual({ day: TODAY, done: 0, scheduled: 1 });
    // Done once today: there's history now.
    expect(buildHistory([habit({ createdDay: TODAY, days: [TODAY] })], TODAY, 30)).toMatchObject({ empty: null, percent: 100 });
    // Made yesterday and missed: an honest 0%, not the empty state.
    expect(buildHistory([habit({ createdDay: ago(1) })], TODAY, 30)).toMatchObject({ empty: null, percent: 0 });
  });

  it("puts today on the right in every range, across a DST change", () => {
    // Toronto's clocks went back on 2026-11-01: the days are still whole.
    const view = buildHistory([habit()], TODAY, 30);
    expect(view.days[0].day).toBe("2026-10-25");
    expect(view.days.at(-1)?.day).toBe(TODAY);
    expect(new Set(view.days.map((d) => d.day)).size).toBe(30);
  });
});

describe("words", () => {
  it("labels days in UTC, so they're the same everywhere", () => {
    expect(dayReadout(TODAY, TODAY)).toBe("Today");
    expect(dayReadout(ago(1), TODAY)).toBe("Yesterday");
    expect(dayReadout("2026-11-14", TODAY)).toBe("Sat, Nov 14");
    expect(dayReadout("2026-12-31", "2027-01-01")).toBe("Yesterday");
    expect(shortDate("2026-10-25")).toBe("Oct 25");
    expect(weekdayInitial(TODAY)).toBe("M");
  });

  it("says 'No habits yet' rather than '0 of 0'", () => {
    expect(dayCount({ day: TODAY, done: 3, scheduled: 5 })).toBe("3 of 5 done");
    expect(dayCount({ day: TODAY, done: 0, scheduled: 0 })).toBe("No habits yet");
  });

  it("gives the slider a full spoken value", () => {
    expect(dayValueText({ day: TODAY, done: 3, scheduled: 5 }, TODAY)).toBe("Today, Monday, November 23: 3 of 5 done");
    expect(dayValueText({ day: "2026-11-14", done: 4, scheduled: 5 }, TODAY)).toBe("Saturday, November 14: 4 of 5 done");
  });

  it("sums up the range and each habit", () => {
    expect(summarySentence({ done: 112, counted: 148, range: 30 })).toBe("112 of 148 habit-days done in the last 30 days.");
    const view = buildHistory([habit({ name: "Read", days: [ago(1)] }), habit({ name: "New", createdDay: TODAY })], TODAY, 7);
    expect(habitSentence(view.habits[0])).toBe("Read: 1 of 6 days done, 17%.");
    expect(habitSentence(view.habits[1])).toBe("New: nothing to count yet. Added Nov 23.");
    const one = buildHistory([habit({ name: "One", createdDay: ago(1), days: [ago(1)] })], TODAY, 7);
    expect(habitSentence(one.habits[0])).toBe("One: 1 of 1 day done, 100%. Added Nov 22.");
  });
});

describe("chartGeometry", () => {
  const day = (i: number, done: number, scheduled: number) => ({ day: ago(6 - i), done, scheduled });

  it("draws a bar per day, done tall, in day units, with room above the top step", () => {
    const g = chartGeometry([day(0, 2, 3), day(1, 0, 3), day(2, 3, 3)]);
    expect(g.width).toBe(3);
    expect(g.height).toBe(3 + CHART_TOP_INSET);
    expect(g.bars[0]).toMatchObject({ y: g.height - 2, height: 2 });
    expect(g.bars[1].height).toBe(0);
    for (const bar of g.bars) {
      expect(bar.x).toBeGreaterThan(0);
      expect(bar.width).toBeGreaterThan(0);
      expect(bar.width).toBeLessThan(1);
    }
    expect(g.bars[2].x).toBeGreaterThan(2);
  });

  it("steps the 'how many habits' line, and breaks it on days with none", () => {
    const h = 3 + CHART_TOP_INSET;
    const g = chartGeometry([day(0, 0, 0), day(1, 1, 2), day(2, 1, 2), day(3, 0, 3), day(4, 0, 0), day(5, 1, 1)]);
    expect(g.line).toBe(`M1 ${h - 2}H2H3V${h - 3}H4M5 ${h - 1}H6`);
  });

  it("never has a zero-height chart, even with no habits", () => {
    const g = chartGeometry([day(0, 0, 0)]);
    expect(g.height).toBeGreaterThan(0);
    expect(g.line).toBe("");
  });

  it("uses thinner gaps as the bars get thinner, and exact separators instead of a gap at 90", () => {
    const charts = [7, 30, 90].map((n) => chartGeometry(Array.from({ length: n }, (_, i) => day(i, 1, 1))));
    const widths = charts.map((g) => g.bars[0].width);
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
    expect(charts.map((g) => g.separators)).toEqual([false, false, true]);
    expect(charts[2].bars[0]).toMatchObject({ x: 0, width: 1 });
  });
});

describe("scrubIndex", () => {
  it("picks the day under the pointer, clamped to the ends", () => {
    expect(scrubIndex(0, 300, 30)).toBe(0);
    expect(scrubIndex(9.9, 300, 30)).toBe(0);
    expect(scrubIndex(10, 300, 30)).toBe(1);
    expect(scrubIndex(300, 300, 30)).toBe(29);
    expect(scrubIndex(-20, 300, 30)).toBe(0);
    expect(scrubIndex(900, 300, 30)).toBe(29);
    expect(scrubIndex(50, 0, 7)).toBe(6);
  });
});
