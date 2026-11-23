import { describe, expect, it } from "vitest";
import { HABIT_NAME_MAX, nameLength, normalizeHabitName, validateHabitName } from "./habit-name";

describe("normalizeHabitName", () => {
  it("trims and collapses every kind of whitespace", () => {
    expect(normalizeHabitName("  Drink   water ")).toBe("Drink water");
    expect(normalizeHabitName("\tRead\n10 pages\r\n")).toBe("Read 10 pages");
    expect(normalizeHabitName(" Stretch  daily　")).toBe("Stretch daily");
  });
  it("removes control characters", () => {
    expect(normalizeHabitName("Run\u0000\u0007 5k")).toBe("Run 5k");
  });
  it("keeps emoji sequences intact", () => {
    expect(normalizeHabitName(" 🧘‍♀️ Yoga ")).toBe("🧘‍♀️ Yoga");
  });
});

describe("nameLength", () => {
  it("counts an emoji as one character, like Postgres char_length", () => {
    expect(nameLength("🔥")).toBe(1);
    expect("🔥".length).toBe(2); // why we don't use .length
  });
});

describe("validateHabitName", () => {
  it("accepts a normal name", () => {
    expect(validateHabitName("Meditate")).toBeNull();
  });
  it("asks for a name when empty or invisible", () => {
    expect(validateHabitName("")).toMatch(/name/);
    expect(validateHabitName("​")).toMatch(/name/); // zero-width space only
  });
  it("allows exactly 60 characters and refuses 61", () => {
    expect(validateHabitName("a".repeat(HABIT_NAME_MAX))).toBeNull();
    expect(validateHabitName("a".repeat(HABIT_NAME_MAX + 1))).toMatch(/60/);
  });
  it("counts emoji as one each", () => {
    expect(validateHabitName("🔥".repeat(60))).toBeNull();
    expect(validateHabitName("🔥".repeat(61))).toMatch(/60/);
  });
});
