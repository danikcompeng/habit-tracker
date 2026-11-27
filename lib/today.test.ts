import { describe, expect, it } from "vitest";
import { applyDone, buildToday, dayLabel, dotsSummary, shortDayLabel, streakRose, streakText, summaryLine, weekdayName } from "./today";

const TODAY = "2026-11-23";

describe("buildToday", () => {
  const habits = [
    { id: "a", name: "Water", created_at: "2026-10-01T12:00:00Z" },
    { id: "b", name: "Read", created_at: "2026-11-23T02:00:00Z" }, // 21:00 Nov 22 in Toronto
  ];
  const checkins = [
    { habit_id: "a", day: "2026-11-23" },
    { habit_id: "a", day: "2026-11-22" },
    { habit_id: "b", day: "2026-11-22" },
  ];
  const streaks = [{ habit_id: "a", current_streak: 9 }];

  it("keeps the order, marks today's check-ins, and takes the server's streak (0 when absent)", () => {
    const view = buildToday(habits, checkins, streaks, TODAY, "America/Toronto");
    expect(view.map((h) => [h.id, h.doneToday, h.streak])).toEqual([
      ["a", true, 9],
      ["b", false, 0],
    ]);
  });

  it("works out 'created on' in the user's timezone, not UTC", () => {
    const [, read] = buildToday(habits, checkins, streaks, TODAY, "America/Toronto");
    // Created 21:00 on the 22nd in Toronto: the 22nd is done, the 23rd open, earlier days "before".
    expect(read.dots.map((d) => d.state)).toEqual(["before", "before", "before", "before", "before", "done", "open"]);
    const [, readUtc] = buildToday(habits, checkins, streaks, TODAY, "UTC");
    expect(readUtc.dots.at(-2)?.state).toBe("done"); // done always wins, even "before" creation
  });

  it("handles no habits", () => {
    expect(buildToday([], [], [], TODAY, "UTC")).toEqual([]);
  });
});

describe("labels", () => {
  it("formats the day the same everywhere (no off-by-one west of UTC)", () => {
    expect(dayLabel("2026-11-23")).toBe("Monday, November 23");
    expect(weekdayName("2026-11-23")).toBe("Monday");
    // Even if this test machine were in Los Angeles: the label is computed in UTC.
    expect(dayLabel("2027-01-01")).toBe("Friday, January 1");
  });

  it("has a short form for a narrow header, also in UTC", () => {
    expect(shortDayLabel("2026-11-25")).toBe("Wed, Nov 25");
    expect(shortDayLabel("2027-01-01")).toBe("Fri, Jan 1");
  });

  it("says the streak plainly", () => {
    expect(streakText(0)).toBe("Start today");
    expect(streakText(1)).toBe("1-day streak");
    expect(streakText(12)).toBe("12-day streak");
  });

  it("summarises the week for screen readers", () => {
    const dots = buildToday(
      [{ id: "a", name: "Water", created_at: "2026-10-01T12:00:00Z" }],
      [{ habit_id: "a", day: "2026-11-22" }, { habit_id: "a", day: "2026-11-20" }],
      [],
      TODAY,
      "UTC",
    )[0].dots;
    expect(dotsSummary(dots)).toBe("Previous 6 days: 2 done, 4 missed. Today: not done yet.");
  });

  it("keeps the instruction while anything is open, counts progress, and celebrates all done", () => {
    expect(summaryLine(0, 5, "hold")).toBe("Hold a habit to complete it.");
    expect(summaryLine(0, 5, "tap")).toBe("Tap a habit to complete it.");
    expect(summaryLine(2, 5, "hold")).toBe("2 of 5 done · Hold a habit to complete it.");
    expect(summaryLine(5, 5, "hold")).toBe("All done for today");
    expect(summaryLine(0, 0, "hold")).toBe("Add a habit to get started.");
  });
});

describe("applyDone (what a key shows before the server answers)", () => {
  const [habit] = buildToday(
    [{ id: "a", name: "Water", created_at: "2026-10-01T12:00:00Z" }],
    [{ habit_id: "a", day: "2026-11-22" }, { habit_id: "a", day: "2026-11-23" }],
    [{ habit_id: "a", current_streak: 5 }],
    TODAY,
    "UTC",
  );

  it("undo when the server says done with streak 5: 4, and today's dot is open again", () => {
    const key = applyDone(habit, false);
    expect(key.streak).toBe(4);
    expect(key.done).toBe(false);
    expect(key.dots.at(-1)?.state).toBe("open");
    expect(key.dots.at(-2)?.state).toBe("done");
  });

  it("no change keeps the server's numbers", () => {
    expect(applyDone(habit, true)).toMatchObject({ done: true, streak: 5 });
  });
});

describe("streakRose (the caption's pulse, Feature 10i)", () => {
  it("is true only when the number goes up from a known one", () => {
    expect(streakRose(4, 5)).toBe(true);
    expect(streakRose(0, 1)).toBe(true);
    expect(streakRose(5, 5)).toBe(false);
    expect(streakRose(5, 4)).toBe(false);
    // The first render: nothing to compare with.
    expect(streakRose(null, 12)).toBe(false);
  });
});
