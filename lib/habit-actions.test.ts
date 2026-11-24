import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextCache, nextHeaders } from "@/tests/next-mocks";

type Answer = { data?: unknown; error: { code: string; message: string } | null };

/** A fake Supabase query chain: records calls, answers with `answer`. */
function fakeQuery(answer: Answer) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["insert", "update", "delete", "eq", "select", "single"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(answer);
  return { chain, calls };
}

let query = fakeQuery({ data: [], error: null });
let rpcAnswer: Answer = { error: null };
let claims: unknown = { sub: "user-1" };
const supabase = {
  auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
  from: vi.fn(() => query.chain),
  rpc: vi.fn(async () => rpcAnswer),
};
vi.mock("./supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", () => nextCache);

const { createHabit, deleteHabit, renameHabit, reorderHabits } = await import("./habit-actions");

const A = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const B = "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";

beforeEach(() => {
  vi.clearAllMocks();
  query = fakeQuery({ data: [{ id: A }], error: null });
  rpcAnswer = { error: null };
  claims = { sub: "user-1" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createHabit", () => {
  it("tidies the name, inserts it, and refreshes", async () => {
    query = fakeQuery({ data: { id: A }, error: null });
    expect(await createHabit("  Read\t 10   pages ")).toEqual({ ok: true, id: A, name: "Read 10 pages" });
    expect(query.calls[0]).toEqual(["insert", { name: "Read 10 pages" }]);
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("explains an empty or too-long name without touching the database", async () => {
    expect(await createHabit("   ")).toMatchObject({ ok: false, reason: "invalid", message: "Give your habit a name." });
    expect(await createHabit("x".repeat(61))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await createHabit(42)).toMatchObject({ ok: false, reason: "invalid" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("turns the database's 100-habit limit into a plain message", async () => {
    query = fakeQuery({ error: { code: "54000", message: "limit" } });
    expect(await createHabit("One more")).toEqual({ ok: false, reason: "limit", message: "You can have up to 100 habits." });
  });

  it("never throws: logged out is a plain error", async () => {
    claims = null;
    expect(await createHabit("Read")).toMatchObject({ ok: false, reason: "error" });
  });
});

describe("renameHabit", () => {
  it("updates only the name, of that habit, and says it worked", async () => {
    expect(await renameHabit(A, " Walk ")).toEqual({ ok: true, id: A, name: "Walk" });
    expect(query.calls).toEqual([["update", { name: "Walk" }], ["eq", "id", A], ["select", "id"]]);
  });

  it("says gone when nothing was renamed (deleted elsewhere, or not yours)", async () => {
    query = fakeQuery({ data: [], error: null });
    expect(await renameHabit(A, "Walk")).toMatchObject({ ok: false, reason: "gone" });
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("refuses a malformed id or name", async () => {
    expect(await renameHabit("../habits", "Walk")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await renameHabit(A, "")).toMatchObject({ ok: false, reason: "invalid" });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("deleteHabit", () => {
  it("deletes that habit and says it worked", async () => {
    expect(await deleteHabit(A)).toEqual({ ok: true, id: A });
    expect(query.calls).toEqual([["delete"], ["eq", "id", A], ["select", "id"]]);
  });

  it("says the list changed when it was already gone", async () => {
    query = fakeQuery({ data: [], error: null });
    expect(await deleteHabit(A)).toEqual({ ok: false, reason: "gone", message: "The list changed, so it was refreshed." });
  });

  it("reports a database failure as a plain error", async () => {
    query = fakeQuery({ error: { code: "57014", message: "timeout" } });
    expect(await deleteHabit(A)).toMatchObject({ ok: false, reason: "error" });
  });
});

describe("reorderHabits", () => {
  it("saves the full order with one call", async () => {
    expect(await reorderHabits([B, A])).toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith("reorder_habits", { p_ids: [B, A] });
  });

  it("checks the list before calling the database: an array of up to 100 unique ids", async () => {
    for (const bad of [null, "a,b", [A, A], [A, A.toUpperCase()], [A, "nope"], Array.from({ length: 101 }, () => A)]) {
      expect(await reorderHabits(bad)).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("says stale (and refreshes) when the list no longer matches your habits", async () => {
    rpcAnswer = { error: { code: "HR001", message: "out of date" } };
    expect(await reorderHabits([A])).toMatchObject({ ok: false, reason: "stale" });
    expect(nextCache.refresh).toHaveBeenCalled();
  });

  it("maps the database's duplicate check, and other failures", async () => {
    rpcAnswer = { error: { code: "22023", message: "dupes" } };
    expect(await reorderHabits([A])).toMatchObject({ ok: false, reason: "invalid" });
    rpcAnswer = { error: { code: "08006", message: "connection" } };
    expect(await reorderHabits([A])).toMatchObject({ ok: false, reason: "error" });
  });
});

describe("every action fails safely", () => {
  it("logged out: rename, delete and reorder return an error result", async () => {
    claims = null;
    expect(await renameHabit(A, "Walk")).toMatchObject({ ok: false, reason: "error" });
    expect(await deleteHabit(A)).toMatchObject({ ok: false, reason: "error" });
    expect(await reorderHabits([A])).toMatchObject({ ok: false, reason: "error" });
  });

  it("a database call that throws is logged and becomes an error result", async () => {
    supabase.rpc.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await reorderHabits([A])).toMatchObject({ ok: false, reason: "error" });
    expect(console.error).toHaveBeenCalled();
  });

  it("invalid input never refreshes the page or touches the database", async () => {
    await createHabit("");
    await renameHabit("nope", "x");
    await deleteHabit("not-a-uuid");
    await reorderHabits("x");
    expect(nextCache.refresh).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("counts characters like the database: 60 emoji pass, 61 don't", async () => {
    query = fakeQuery({ data: { id: A }, error: null });
    expect(await createHabit("🔥".repeat(60))).toMatchObject({ ok: true });
    expect(await createHabit("🔥".repeat(61))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("an empty order reaches the database (which checks it against your habits)", async () => {
    expect(await reorderHabits([])).toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith("reorder_habits", { p_ids: [] });
  });
});
