import { describe, expect, it } from "vitest";
import { CM, altitudeOf, dailyClimbCm, zoneByIndex, zoneIndex } from "./altitude";
import { todayIn } from "./dates";
import { buildHistory, toHistoryHabits } from "./history";
import {
  CLEARED_MARKERS,
  DEMO_HABITS,
  checkinDaysAgo,
  createdDaysAgo,
  RESEED_AFTER_MS,
  demoSeedPayload,
  needsReseed,
  seededMarkers,
} from "./demo-seed";
import { validateHabitName } from "./habit-name";
import { currentStreak, weekDots } from "./streaks";

const TODAY = "2026-11-23";

describe("demo sample habits", () => {
  const payload = demoSeedPayload(TODAY, "America/Toronto");
  const streaks = payload.map((h) => currentStreak(h.days, TODAY));

  it("has valid names, and every day is inside the database's 100-day window and on or after the habit was made", () => {
    expect(DEMO_HABITS.every((h) => validateHabitName(h.name) === null)).toBe(true);
    for (const habit of DEMO_HABITS) {
      expect(habit.history, habit.name).toMatch(/^[x.]+$/);
      expect(createdDaysAgo(habit), habit.name).toBeLessThanOrEqual(89);
      expect(checkinDaysAgo(habit).every((n) => n >= 0 && n <= createdDaysAgo(habit)), habit.name).toBe(true);
    }
  });

  it("shows the intended streaks: 12 done today, 4 waiting for today, 0, 2 and 1", () => {
    expect(streaks).toEqual([12, 4, 0, 2, 1]);
    expect(payload[0].days).toContain(TODAY);
    expect(payload[1].days).not.toContain(TODAY);
  });

  it("shows every dot state somewhere in the first screen", () => {
    const states = new Set(
      payload.flatMap((h) => weekDots(h.days, TODAY, todayIn("America/Toronto", new Date(h.created_at))).map((d) => d.state)),
    );
    expect(states).toEqual(new Set(["done", "open", "missed", "before"]));
  });

  it("back-dates created_at to the right local day in far-apart timezones", () => {
    for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Santiago", "Asia/Kathmandu"]) {
      const habits = demoSeedPayload(TODAY, tz);
      expect(todayIn(tz, new Date(habits[4].created_at)), tz).toBe("2026-11-21");
      expect(todayIn(tz, new Date(habits[0].created_at)), tz).toBe("2026-08-26");
    }
  });
});

describe("demo history (Feature 7)", () => {
  const habits = toHistoryHabits(
    demoSeedPayload(TODAY, "America/Toronto").map((h, i) => ({
      habit_id: String(i),
      name: h.name,
      created_at: h.created_at,
      days: h.days,
      lead_in: 0,
      current_streak: currentStreak(h.days, TODAY),
    })),
    "America/Toronto",
  );

  it("looks believable over 90 days: between 60% and 85% done, a habit added mid-range, and an old run longer than today's best", () => {
    const view = buildHistory(habits, TODAY, 90);
    expect(view.percent).toBeGreaterThanOrEqual(60);
    expect(view.percent).toBeLessThanOrEqual(85);
    expect(view.habits.find((h) => h.name === "Stretch for 5 minutes")?.addedOn).toBe("2026-10-09");
    expect(view.bestNow).toBe(12);
    expect(view.longest).toBeGreaterThan(view.bestNow);
    expect(view.empty).toBeNull();
  });

  it("has history in every range, never a blank chart", () => {
    for (const range of [7, 30, 90] as const) {
      const view = buildHistory(habits, TODAY, range);
      expect(view.days.every((d) => d.scheduled > 0), String(range)).toBe(true);
      expect(view.days.some((d) => d.done === d.scheduled), String(range)).toBe(true);
    }
  });
});

describe("needsReseed", () => {
  const seededNow = new Date("2026-11-23T15:00:00Z");
  const markers = seededMarkers(seededNow, TODAY);

  it("is false right after a seed", () => {
    expect(needsReseed(markers, seededNow, TODAY)).toBe(false);
    expect(needsReseed(markers, new Date(seededNow.getTime() + RESEED_AFTER_MS - 1), TODAY)).toBe(false);
  });
  it("is true after an hour", () => {
    expect(needsReseed(markers, new Date(seededNow.getTime() + RESEED_AFTER_MS + 1), TODAY)).toBe(true);
  });
  it("is true when the visitor's today is later (just after midnight, or further east)", () => {
    expect(needsReseed(markers, seededNow, "2026-11-24")).toBe(true);
  });
  it("is false when the visitor's today is earlier (further west): no reseed war between timezones", () => {
    expect(needsReseed(markers, seededNow, "2026-11-22")).toBe(false);
  });
  it("is true when never seeded, cleared, or unreadable", () => {
    expect(needsReseed(undefined, seededNow, TODAY)).toBe(true);
    expect(needsReseed({}, seededNow, TODAY)).toBe(true);
    expect(needsReseed({ ...CLEARED_MARKERS }, seededNow, TODAY)).toBe(true);
    expect(needsReseed({ hold_demo_seeded_at: "garbage", hold_demo_seeded_day: TODAY }, seededNow, TODAY)).toBe(true);
  });
  it("is true for a seed time well in the future, but allows a little clock difference", () => {
    expect(needsReseed(markers, new Date(seededNow.getTime() - 60_000), TODAY)).toBe(false);
    expect(needsReseed(markers, new Date(seededNow.getTime() - 10 * 60_000), TODAY)).toBe(true);
  });
  it("ignores Staple's markers on the shared account", () => {
    const stapleOnly = { demo_seeded_at: seededNow.toISOString(), demo_seeded_day: TODAY };
    expect(needsReseed(stapleOnly, seededNow, TODAY)).toBe(true);
    expect(Object.keys(markers).every((k) => k.startsWith("hold_"))).toBe(true);
  });
});

describe.each(["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Kolkata", "America/New_York", "Europe/London"])("the demo on the Climb (Feature 10b), %s", (tz) => {
  const today = "2026-11-25";
  const habits = demoSeedPayload(today, tz).map((h) => ({ createdDay: todayIn(tz, new Date(h.created_at)), days: h.days }));
  const { altitudeCm, beforeTodayCm } = altitudeOf(habits, today);

  it("lands 60–100 m below a zone boundary", () => {
    const next = zoneByIndex(zoneIndex(altitudeCm) + 1).from * CM;
    expect(next - altitudeCm).toBeGreaterThanOrEqual(60 * CM);
    expect(next - altitudeCm).toBeLessThanOrEqual(100 * CM);
  });

  it("finishing today's open habits crosses it (on the last one, the perfect day), whatever the order", () => {
    const total = habits.length;
    const doneToday = habits.filter((h) => h.days.includes(today)).length;
    const steps = [doneToday + 1, doneToday + 2, total].map((d) => beforeTodayCm + dailyClimbCm(d, total));
    expect(zoneIndex(steps[0])).toBe(zoneIndex(altitudeCm));
    expect(zoneIndex(steps[1])).toBe(zoneIndex(altitudeCm));
    expect(zoneIndex(steps[2])).toBe(zoneIndex(altitudeCm) + 1);
  });
});
