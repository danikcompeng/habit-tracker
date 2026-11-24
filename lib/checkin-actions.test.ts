import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, nextCache, nextHeaders } from "@/tests/next-mocks";

/** A fake Supabase query chain that records calls and answers with `result`. */
function fakeTable(result: { error: { code: string; message: string } | null }) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["upsert", "delete", "eq"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return { chain, calls };
}

let table = fakeTable({ error: null });
let claims: unknown = { sub: "user-1" };
const supabase = {
  auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  from: vi.fn(() => table.chain),
};
vi.mock("./supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", () => nextCache);

const { setCheckin } = await import("./checkin-actions");

const HABIT = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
// 15:00 UTC on Mon 23 Nov = 10:00 in Toronto.
const NOW = new Date("2026-11-23T15:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  table = fakeTable({ error: null });
  claims = { sub: "user-1" };
  fakeCookies.clear();
  fakeCookies.set("tz", "America%2FToronto");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
});

describe("setCheckin", () => {
  it("completes today: an insert that ignores duplicates, then a refresh", async () => {
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: true, savedFor: "2026-11-23", newDay: false });
    expect(table.calls[0]).toEqual([
      "upsert",
      { habit_id: HABIT, day: "2026-11-23" },
      { onConflict: "user_id,habit_id,day", ignoreDuplicates: true },
    ]);
    expect(nextCache.refresh).toHaveBeenCalledTimes(1);
  });

  it("undoes today with a delete for that habit and day", async () => {
    expect(await setCheckin(HABIT, "2026-11-23", false)).toMatchObject({ ok: true });
    expect(table.calls).toEqual([["delete"], ["eq", "habit_id", HABIT], ["eq", "day", "2026-11-23"]]);
  });

  it("says stale (and sends the new day back) for a day the screen shouldn't show", async () => {
    expect(await setCheckin(HABIT, "2026-11-22", true)).toEqual({ ok: false, reason: "stale" });
    expect(await setCheckin(HABIT, "2026-11-24", true)).toEqual({ ok: false, reason: "stale" });
    expect(table.calls).toEqual([]);
    expect(nextCache.refresh).toHaveBeenCalledTimes(2);
  });

  it("says timezone (not stale, which would loop) without a usable timezone, instead of guessing UTC", async () => {
    fakeCookies.clear();
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: false, reason: "timezone" });
    fakeCookies.set("tz", "Etc%2FUnknown");
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: false, reason: "timezone" });
    expect(table.calls).toEqual([]);
  });

  it("is stale again after the 10-minute grace", async () => {
    vi.setSystemTime(new Date("2026-11-24T05:15:00Z")); // 00:15 Tue in Toronto
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: false, reason: "stale" });
  });

  it("refreshes after an undo too", async () => {
    await setCheckin(HABIT, "2026-11-23", false);
    expect(nextCache.refresh).toHaveBeenCalledTimes(1);
  });

  it("treats a day that isn't a string as invalid, and a refused insert as a plain error", async () => {
    expect(await setCheckin(HABIT, 20261123, true)).toEqual({ ok: false, reason: "invalid" });
    expect(await setCheckin(HABIT, null, true)).toEqual({ ok: false, reason: "invalid" });
    table = fakeTable({ error: { code: "42501", message: "row-level security" } });
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: false, reason: "error" });
  });

  it("accepts yesterday in the 10 minutes after midnight, and says it's a new day", async () => {
    vi.setSystemTime(new Date("2026-11-24T05:05:00Z")); // 00:05 Tue in Toronto
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: true, savedFor: "2026-11-23", newDay: true });
  });

  it("refuses a malformed habit id, day or done flag without touching the database", async () => {
    expect(await setCheckin("not-a-uuid", "2026-11-23", true)).toEqual({ ok: false, reason: "invalid" });
    expect(await setCheckin(HABIT, "2026-11-31", true)).toEqual({ ok: false, reason: "invalid" });
    expect(await setCheckin(HABIT, "2026-11-23", "yes")).toEqual({ ok: false, reason: "invalid" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("says gone when the habit no longer exists (foreign-key refusal)", async () => {
    table = fakeTable({ error: { code: "23503", message: "violates foreign key" } });
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: false, reason: "gone" });
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("reports other database errors as a plain error", async () => {
    table = fakeTable({ error: { code: "57014", message: "timeout" } });
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: false, reason: "error" });
  });

  it("never throws: logged out becomes an error result", async () => {
    claims = null;
    expect(await setCheckin(HABIT, "2026-11-23", true)).toEqual({ ok: false, reason: "error" });
  });
});
