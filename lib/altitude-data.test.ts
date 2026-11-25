import { describe, expect, it, vi } from "vitest";
import { fetchAltitude } from "./altitude-data";

const client = (result: { data: unknown; error: { code?: string; message?: string } | null } | Error) => ({
  rpc: vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  }),
});

describe("fetchAltitude", () => {
  it("reads the one row, in centimetres, and passes the day and time zone", async () => {
    const c = client({ data: [{ altitude_cm: 711_300, before_today_cm: 707_300 }], error: null });
    expect(await fetchAltitude(c, "2026-11-25", "Europe/Paris")).toEqual({ altitudeCm: 711_300, beforeTodayCm: 707_300 });
    expect(c.rpc).toHaveBeenCalledWith("habit_altitude", { p_today: "2026-11-25", p_tz: "Europe/Paris" });
  });

  it("uses UTC when there's no time zone yet (a first visit)", async () => {
    const c = client({ data: [{ altitude_cm: 0, before_today_cm: 0 }], error: null });
    await fetchAltitude(c, "2026-11-25", undefined);
    expect(c.rpc).toHaveBeenCalledWith("habit_altitude", { p_today: "2026-11-25", p_tz: "UTC" });
  });

  it("gives null, never an error, when the function is missing (migration not applied) or fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchAltitude(client({ data: null, error: { code: "PGRST202", message: "not found" } }), "2026-11-25", "UTC")).toBeNull();
    expect(await fetchAltitude(client(new Error("network")), "2026-11-25", "UTC")).toBeNull();
    expect(await fetchAltitude(client({ data: [], error: null }), "2026-11-25", "UTC")).toBeNull();
    expect(await fetchAltitude(client({ data: [{ altitude_cm: "x", before_today_cm: 1 }], error: null }), "2026-11-25", "UTC")).toBeNull();
  });

  it("accepts big integers sent as strings", async () => {
    const c = client({ data: [{ altitude_cm: "1200000", before_today_cm: "1185000" }], error: null });
    expect(await fetchAltitude(c, "2026-11-25", "UTC")).toEqual({ altitudeCm: 1_200_000, beforeTodayCm: 1_185_000 });
  });
});
