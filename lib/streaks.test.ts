import { describe, expect, it } from "vitest";
import { adjustStreak, currentStreak, weekDots } from "./streaks";

const TODAY = "2026-11-23";

describe("currentStreak", () => {
  it("is 0 with no check-ins", () => {
    expect(currentStreak([], TODAY)).toBe(0);
  });
  it("counts back from today when today is done", () => {
    expect(currentStreak(["2026-11-21", "2026-11-22", "2026-11-23"], TODAY)).toBe(3);
  });
  it("stays alive when today isn't done yet (counts back from yesterday)", () => {
    expect(currentStreak(["2026-11-20", "2026-11-21", "2026-11-22"], TODAY)).toBe(3);
  });
  it("is 0 when both yesterday and today are missing", () => {
    expect(currentStreak(["2026-11-19", "2026-11-20", "2026-11-21"], TODAY)).toBe(0);
  });
  it("stops at the first gap", () => {
    expect(currentStreak(["2026-11-18", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"], TODAY)).toBe(4);
  });
  it("counts today alone after a gap yesterday", () => {
    expect(currentStreak(["2026-11-20", "2026-11-21", "2026-11-23"], TODAY)).toBe(1);
  });
  it("ignores days after today", () => {
    expect(currentStreak(["2026-11-24", "2026-11-25"], TODAY)).toBe(0);
    expect(currentStreak(["2026-11-22", "2026-11-23", "2026-11-24"], TODAY)).toBe(2);
  });
  it("runs across month and leap-day boundaries", () => {
    expect(currentStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01")).toBe(3);
    expect(currentStreak(["2026-12-31", "2027-01-01"], "2027-01-01")).toBe(2);
  });
  it("doesn't care about duplicates or order", () => {
    expect(currentStreak(["2026-11-23", "2026-11-22", "2026-11-23"], TODAY)).toBe(2);
  });
});

describe("adjustStreak (instant update before the server answers)", () => {
  it("completing today adds one", () => {
    expect(adjustStreak(5, false, true)).toBe(6);
    expect(adjustStreak(0, false, true)).toBe(1);
  });
  it("undoing today takes one away", () => {
    expect(adjustStreak(6, true, false)).toBe(5);
    expect(adjustStreak(1, true, false)).toBe(0);
  });
  it("no change, no difference", () => {
    expect(adjustStreak(4, true, true)).toBe(4);
    expect(adjustStreak(4, false, false)).toBe(4);
  });
  it("never goes below 0", () => {
    expect(adjustStreak(0, true, false)).toBe(0);
  });
  it("agrees with currentStreak for complete and undo", () => {
    const history = ["2026-11-20", "2026-11-21", "2026-11-22"];
    const before = currentStreak(history, TODAY);
    const after = currentStreak([...history, TODAY], TODAY);
    expect(adjustStreak(before, false, true)).toBe(after);
    expect(adjustStreak(after, true, false)).toBe(before);
  });
});

describe("weekDots", () => {
  it("gives 7 days ending today, oldest first", () => {
    const dots = weekDots([], TODAY, "2020-01-01");
    expect(dots.map((d) => d.day)).toEqual([
      "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23",
    ]);
  });
  it("today not done is open, not missed", () => {
    const dots = weekDots(["2026-11-22"], TODAY, "2020-01-01");
    expect(dots.at(-1)).toEqual({ day: TODAY, state: "open" });
    expect(dots.at(-2)?.state).toBe("done");
    expect(dots.at(-3)?.state).toBe("missed");
  });
  it("today done is done", () => {
    expect(weekDots([TODAY], TODAY, TODAY).at(-1)?.state).toBe("done");
  });
  it("days before the habit existed are 'before', not missed", () => {
    const dots = weekDots([], TODAY, "2026-11-21");
    expect(dots.map((d) => d.state)).toEqual(["before", "before", "before", "before", "missed", "missed", "open"]);
  });
  it("a habit created today shows only 'before' and 'open'", () => {
    const states = weekDots([], TODAY, TODAY).map((d) => d.state);
    expect(states.slice(0, 6).every((s) => s === "before")).toBe(true);
    expect(states[6]).toBe("open");
  });
  it("done always wins, even before the created day", () => {
    expect(weekDots(["2026-11-18"], TODAY, "2026-11-22")[1]).toEqual({ day: "2026-11-18", state: "done" });
  });
});
