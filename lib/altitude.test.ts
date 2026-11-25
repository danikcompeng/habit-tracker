import { describe, expect, it } from "vitest";
import {
  ZONES,
  altitudeOf,
  celebratedIndex,
  climbDays,
  dailyClimbCm,
  metres,
  newZone,
  nextZone,
  silentlyRaised,
  zoneMomentAfterSave,
  zoneByIndex,
  zonesBelow,
  zoneAt,
  zoneIndex,
  zoneMemoryKey,
  zoneMemoryValue,
} from "./altitude";
import { addDays } from "./dates";

const TODAY = "2026-11-25";
const ago = (n: number) => addDays(TODAY, -n);
const cm = (m: number) => m * 100;

describe("a day's climb", () => {
  it("is 100 m times the share done, plus 50 m when every counted habit is done", () => {
    expect(dailyClimbCm(0, 4)).toBe(0);
    expect(dailyClimbCm(1, 4)).toBe(cm(25));
    expect(dailyClimbCm(3, 4)).toBe(cm(75));
    expect(dailyClimbCm(4, 4)).toBe(cm(150));
    expect(dailyClimbCm(0, 0)).toBe(0);
  });

  it("rounds to the centimetre, half up, the same way as SQL", () => {
    expect(dailyClimbCm(1, 3)).toBe(3_333);
    expect(dailyClimbCm(2, 3)).toBe(6_667);
    expect(dailyClimbCm(1, 6)).toBe(1_667);
  });
});

describe("the day rules (History's)", () => {
  it("counts done and missed days; days before a habit was made don't count", () => {
    const days = climbDays(
      [
        { createdDay: ago(5), days: [ago(5), ago(2)] },
        { createdDay: ago(2), days: [ago(2)] },
      ],
      TODAY,
    );
    expect(days).toEqual([
      { day: ago(5), done: 1, counted: 1 },
      { day: ago(2), done: 2, counted: 2 },
    ]);
  });

  it("a back-filled day before the habit was made counts as done (and counted)", () => {
    expect(climbDays([{ createdDay: ago(1), days: [ago(3)] }, { createdDay: ago(9), days: [] }], TODAY)).toEqual([
      { day: ago(3), done: 1, counted: 2 },
    ]);
  });

  it("today counts every habit: done, or still open", () => {
    expect(climbDays([{ createdDay: TODAY, days: [TODAY] }, { createdDay: ago(3), days: [] }, { createdDay: addDays(TODAY, 1), days: [] }], TODAY)).toEqual([
      { day: TODAY, done: 1, counted: 3 },
    ]);
  });

  it("leaves out check-ins after today", () => {
    expect(climbDays([{ createdDay: ago(1), days: [addDays(TODAY, 1)] }], TODAY)).toEqual([]);
  });

  it("altitude adds every day; missed days never take any away", () => {
    const habits = [{ createdDay: ago(3), days: [ago(3), ago(1), TODAY] }];
    expect(altitudeOf(habits, TODAY)).toEqual({ altitudeCm: cm(450), beforeTodayCm: cm(300) });
    // Missing more days changes nothing that was climbed.
    expect(altitudeOf(habits, addDays(TODAY, 5)).altitudeCm).toBe(cm(450));
  });
});

describe("zones", () => {
  it("start where the brief says (High ridge, not Summit, at 8,848 m), then every 2,500 m from 10,000 m, forever", () => {
    expect(ZONES.slice(0, 7).map((z) => [z.name, z.from])).toEqual([
      ["Base camp", 0],
      ["Forest", 500],
      ["Treeline", 1_500],
      ["Snowline", 3_000],
      ["Above the clouds", 5_000],
      ["High ridge", 8_848],
      ["Stratosphere", 10_000],
    ]);
    expect(ZONES.some((z) => /summit/i.test(z.name))).toBe(false);
    for (let i = 6; i < ZONES.length; i++) expect(ZONES[i].from).toBe(10_000 + (i - 6) * 2_500);
    expect(zoneByIndex(ZONES.length)).toEqual({ name: "Higher still", from: ZONES[ZONES.length - 1].from + 2_500 });
    expect(zoneAt(cm(100_000)).name).toBe("Higher still");
  });

  it("index and height round-trip, far up the climb", () => {
    for (let i = 0; i < 60; i++) expect(zoneIndex(cm(zoneByIndex(i).from))).toBe(i);
    expect(zonesBelow(12_000).map((z) => z.name)).toEqual(["Base camp", "Forest", "Treeline", "Snowline", "Above the clouds", "High ridge", "Stratosphere"]);
  });

  it("change exactly at the threshold, to the centimetre", () => {
    expect(zoneAt(cm(1_500) - 1).name).toBe("Forest");
    expect(zoneAt(cm(1_500)).name).toBe("Treeline");
    expect(zoneAt(0).name).toBe("Base camp");
    expect(zoneAt(cm(10_000)).name).toBe("Stratosphere");
    expect(zoneAt(cm(12_500) - 1).name).toBe("Stratosphere");
    expect(zoneAt(cm(12_500)).name).toBe("Jet stream");
  });

  it("say how far the next one is, rounded up, so it never reads 0 m before you're there", () => {
    expect(nextZone(cm(7_113))).toEqual({ zone: ZONES[5], metres: 1_735 });
    expect(nextZone(cm(8_848) - 40)).toEqual({ zone: ZONES[5], metres: 1 });
    // There's always a next zone.
    expect(nextZone(cm(12_000))).toEqual({ zone: ZONES[7], metres: 500 });
    expect(nextZone(cm(1_000_000)).metres).toBeGreaterThan(0);
  });

  it("show heights rounded down: never one not yet reached", () => {
    expect(metres(cm(1_500) - 1)).toBe("1,499 m");
    expect(metres(711_399)).toBe("7,113 m");
    expect(metres(0)).toBe("0 m");
  });
});

describe("the zone moment", () => {
  it("is a climb into a higher zone than any celebrated; never down, never twice", () => {
    expect(newZone(cm(1_490), cm(1_510), 1)?.name).toBe("Treeline");
    expect(newZone(cm(1_490), cm(1_510), 2)).toBeNull(); // already celebrated
    expect(newZone(cm(1_510), cm(1_490), 1)).toBeNull(); // down
    expect(newZone(cm(1_510), cm(1_530), 1)).toBeNull(); // no crossing in this step
  });

  it("crossing two zones at once gives the higher one", () => {
    expect(newZone(cm(8_800), cm(10_050), 4)?.name).toBe("Stratosphere");
    expect(newZone(cm(12_450), cm(12_520), 6)?.name).toBe("Jet stream");
  });

  it("remembers zones by their height, per account", () => {
    expect(zoneMemoryKey("u1")).toBe("climb-zone:u1");
    expect(celebratedIndex(null)).toBe(-1);
    expect(celebratedIndex("garbage")).toBe(-1);
    expect(celebratedIndex(zoneMemoryValue(3))).toBe(3);
    expect(zoneMemoryValue(99)).toBe(String(zoneByIndex(99).from));
    expect(celebratedIndex(zoneMemoryValue(99))).toBe(99);
    expect(celebratedIndex("12345")).toBe(-1); // not a zone's start
    // Values stored before Feature 10b: the old Summit (8,848) is High ridge now.
    expect(celebratedIndex("8848")).toBe(5);
    expect(celebratedIndex("10000")).toBe(6);
  });

  it("the server's altitude raises the memory silently, never lowers it", () => {
    expect(silentlyRaised(-1, cm(7_113))).toBe(zoneIndex(cm(7_113)));
    expect(silentlyRaised(4, cm(7_113))).toBeNull();
    expect(silentlyRaised(5, cm(100))).toBeNull();
  });
});

describe("the zone moment after a save", () => {
  const crossing = { beforeCm: cm(1_450), afterCm: cm(1_500) };
  it("an ok save into Treeline shows Treeline and remembers it", () => {
    expect(zoneMomentAfterSave(crossing, { ok: true }, 1)).toEqual({ zone: ZONES[2], store: 2 });
  });
  it("nothing for a save that landed on yesterday (a new day), was refused or failed", () => {
    expect(zoneMomentAfterSave(crossing, { ok: true, newDay: true }, 1)).toBeNull();
    expect(zoneMomentAfterSave(crossing, { ok: false }, 1)).toBeNull();
  });
  it("nothing if another tab already celebrated it", () => {
    expect(zoneMomentAfterSave(crossing, { ok: true }, 2)).toBeNull();
  });
});
