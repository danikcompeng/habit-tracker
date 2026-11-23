import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCredentials, isDemoEmail, seedDemo } from "./demo";
import { SEEDED_AT_KEY, SEEDED_DAY_KEY } from "./demo-seed";

const DEMO = "demo@example.com";

beforeEach(() => {
  vi.stubEnv("DEMO_EMAIL", DEMO);
  vi.stubEnv("DEMO_PASSWORD", "long-test-password");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** A fake Supabase client that records what was called, in order. */
function fakeSupabase(options: { rpcError?: { message: string; code: string } } = {}) {
  const calls: string[] = [];
  const client = {
    auth: {
      updateUser: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push(`updateUser ${data[SEEDED_AT_KEY] === null ? "clear" : "mark"}`);
        return { error: null };
      }),
    },
    rpc: vi.fn(async (name: string) => {
      calls.push(`rpc ${name}`);
      return { error: options.rpcError ?? null };
    }),
  };
  return { client: client as unknown as SupabaseClient, raw: client, calls };
}

describe("isDemoEmail", () => {
  it("matches the demo address, ignoring case and spaces", () => {
    expect(isDemoEmail(DEMO)).toBe(true);
    expect(isDemoEmail("  Demo@Example.com ")).toBe(true);
    expect(isDemoEmail("someone@example.com")).toBe(false);
    expect(isDemoEmail(undefined)).toBe(false);
  });
  it("is never true when no demo is set up", () => {
    vi.stubEnv("DEMO_EMAIL", "");
    expect(isDemoEmail("")).toBe(false);
    expect(demoCredentials()).toBeNull();
  });
});

describe("seedDemo", () => {
  it("refuses any account that isn't the demo, before touching anything", async () => {
    const { client, calls } = fakeSupabase();
    await expect(seedDemo(client, { email: "real.person@example.com" }, "2026-11-23", "UTC")).rejects.toThrow(/not the demo/);
    expect(calls).toEqual([]);
  });

  it("clears the markers, reseeds, then marks it done with the finish time and day", async () => {
    const { client, raw, calls } = fakeSupabase();
    await seedDemo(client, { email: DEMO }, "2026-11-23", "America/Toronto");
    expect(calls).toEqual(["updateUser clear", "rpc reseed_demo_habits", "updateUser mark"]);
    const marked = raw.auth.updateUser.mock.calls[1][0].data;
    expect(marked[SEEDED_DAY_KEY]).toBe("2026-11-23");
    expect(Math.abs(Date.parse(marked[SEEDED_AT_KEY] as string) - Date.now())).toBeLessThan(5_000);
  });

  it("leaves the markers cleared when the reseed fails, so the next sign-in tries again", async () => {
    const { client, calls } = fakeSupabase({ rpcError: { message: "boom", code: "XX000" } });
    await expect(seedDemo(client, { email: DEMO }, "2026-11-23", "UTC")).rejects.toThrow(/reseed/);
    expect(calls).toEqual(["updateUser clear", "rpc reseed_demo_habits"]);
  });
});
