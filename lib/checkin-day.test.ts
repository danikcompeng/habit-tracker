import { describe, expect, it } from "vitest";
import { checkinDayStatus } from "./checkin-day";

const TORONTO = "America/Toronto"; // UTC-5 in November

describe("checkinDayStatus", () => {
  it("accepts today", () => {
    expect(checkinDayStatus("2026-11-23", TORONTO, new Date("2026-11-23T15:00:00Z"))).toBe("ok");
  });

  it("accepts today late at night, when UTC is already tomorrow", () => {
    // 23:30 Mon in Toronto = 04:30 Tue UTC.
    expect(checkinDayStatus("2026-11-23", TORONTO, new Date("2026-11-24T04:30:00Z"))).toBe("ok");
  });

  it("accepts yesterday only in the first 10 minutes after local midnight", () => {
    expect(checkinDayStatus("2026-11-23", TORONTO, new Date("2026-11-24T05:00:00Z"))).toBe("ok"); // 00:00
    expect(checkinDayStatus("2026-11-23", TORONTO, new Date("2026-11-24T05:09:59Z"))).toBe("ok"); // 00:09:59
    expect(checkinDayStatus("2026-11-23", TORONTO, new Date("2026-11-24T05:10:00Z"))).toBe("stale"); // 00:10
  });

  it("says stale for an app resumed the next morning still showing yesterday", () => {
    expect(checkinDayStatus("2026-11-23", TORONTO, new Date("2026-11-24T12:30:00Z"))).toBe("stale"); // 07:30 Tue
  });

  it("never accepts tomorrow, even just before midnight", () => {
    expect(checkinDayStatus("2026-11-24", TORONTO, new Date("2026-11-24T04:59:00Z"))).toBe("stale"); // 23:59 Mon
  });

  it("refuses days two or more back, even in the grace window", () => {
    expect(checkinDayStatus("2026-11-22", TORONTO, new Date("2026-11-24T05:01:00Z"))).toBe("stale");
  });

  it("works across the year boundary", () => {
    expect(checkinDayStatus("2026-12-31", "UTC", new Date("2027-01-01T00:05:00Z"))).toBe("ok");
  });

  it("never guesses a timezone: without one it's stale, so the screen reloads with the cookie", () => {
    // First visit from Honolulu at 15:00 Mon = 01:00 Tue UTC. Guessing UTC
    // would accept Tuesday, the visitor's tomorrow.
    const now = new Date("2026-11-24T01:00:00Z");
    expect(checkinDayStatus("2026-11-24", undefined, now)).toBe("stale");
    expect(checkinDayStatus("2026-11-24", "Not/AZone", now)).toBe("stale");
    expect(checkinDayStatus("2026-11-24", "", now)).toBe("stale");
    expect(checkinDayStatus("2026-11-23", "Pacific/Honolulu", now)).toBe("ok");
  });

  it("keeps the 10-minute grace where daylight saving starts at midnight (Santiago: 23:59 -> 01:00)", () => {
    // 2026-09-06: Chile's clocks jump from 23:59:59 Sat to 01:00 Sun.
    const santiago = "America/Santiago";
    expect(checkinDayStatus("2026-09-05", santiago, new Date("2026-09-06T04:00:00Z"))).toBe("ok"); // 01:00, 1 s later
    expect(checkinDayStatus("2026-09-05", santiago, new Date("2026-09-06T04:05:00Z"))).toBe("ok"); // 01:05, 5 min later
    expect(checkinDayStatus("2026-09-05", santiago, new Date("2026-09-06T04:10:00Z"))).toBe("stale"); // 10 min later
  });

  it("works in half- and quarter-hour timezones (Kolkata +5:30, Kathmandu +5:45)", () => {
    expect(checkinDayStatus("2026-11-23", "Asia/Kolkata", new Date("2026-11-23T18:25:00Z"))).toBe("ok"); // 23:55
    expect(checkinDayStatus("2026-11-24", "Asia/Kolkata", new Date("2026-11-23T18:25:00Z"))).toBe("stale"); // tomorrow
    expect(checkinDayStatus("2026-11-23", "Asia/Kolkata", new Date("2026-11-23T18:35:00Z"))).toBe("ok"); // 00:05 grace
    expect(checkinDayStatus("2026-11-23", "Asia/Kathmandu", new Date("2026-11-23T18:20:00Z"))).toBe("ok"); // 00:05 grace
    expect(checkinDayStatus("2026-11-23", "Asia/Kathmandu", new Date("2026-11-23T18:25:00Z"))).toBe("stale"); // 00:10
  });

  it("calls malformed days invalid", () => {
    for (const bad of ["2026-11-31", "today", "", null, undefined, 5]) {
      expect(checkinDayStatus(bad, TORONTO, new Date("2026-11-23T15:00:00Z"))).toBe("invalid");
    }
  });
});
