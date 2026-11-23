import { describe, expect, it } from "vitest";
import { todayIn } from "./dates";
import {
  CLEARED_MARKERS,
  DEMO_HABITS,
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

  it("has valid names and stays inside the database's 60-day window", () => {
    expect(DEMO_HABITS.every((h) => validateHabitName(h.name) === null)).toBe(true);
    expect(DEMO_HABITS.flatMap((h) => h.checkinDaysAgo).every((n) => n >= 0 && n <= 60)).toBe(true);
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
      expect(todayIn(tz, new Date(habits[0].created_at)), tz).toBe("2026-10-24");
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
