// reseed_demo_habits (the demo's sample data, Feature 2), against real
// Postgres with Supabase's roles (tests/db/supabase-pglite.ts).

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { USER_A, USER_B, asAnon, asUser, errorCode, freshDatabase, utcToday } from "./supabase-pglite";

const TODAY = utcToday();
const ago = (n: number) => addDays(TODAY, -n);

const SAMPLE = [
  { name: "Drink water", created_at: `${ago(30)}T12:00:00Z`, days: [ago(2), ago(1), ago(0)] },
  { name: "Read", created_at: `${ago(30)}T12:00:00Z`, days: [ago(1)] },
  { name: "New one", created_at: `${ago(2)}T12:00:00Z`, days: [] },
];

let db: PGlite;
beforeAll(async () => {
  db = await freshDatabase();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("delete from public.habits");
});

function reseed(user: string, habits: unknown) {
  return asUser(db, user, (tx) =>
    tx.query<{ added: number }>("select public.reseed_demo_habits($1::jsonb) as added", [JSON.stringify(habits)]),
  );
}

async function habitsOf(user: string) {
  const { rows } = await db.query<{ name: string; created_at: Date; days: number }>(
    `select h.name, h.created_at, (select count(*)::int from public.habit_checkins c where c.habit_id = h.id) as days
       from public.habits h where h.user_id = $1 order by h.position`,
    [user],
  );
  return rows;
}

describe("reseed_demo_habits", () => {
  it("replaces your habits with the list, in order, with their check-ins and created dates", async () => {
    await asUser(db, USER_A, (tx) => tx.query("insert into public.habits (name) values ('Old habit')"));
    const { rows } = await reseed(USER_A, SAMPLE);
    expect(rows[0].added).toBe(3);
    const habits = await habitsOf(USER_A);
    expect(habits.map((h) => [h.name, h.days])).toEqual([
      ["Drink water", 3],
      ["Read", 1],
      ["New one", 0],
    ]);
    expect(habits[0].created_at.toISOString().slice(0, 10)).toBe(ago(30));
  });

  it("running it twice leaves exactly one set (no duplicates)", async () => {
    await reseed(USER_A, SAMPLE);
    await reseed(USER_A, SAMPLE);
    expect(await habitsOf(USER_A)).toHaveLength(3);
  });

  it("never touches anyone else's habits", async () => {
    await asUser(db, USER_B, (tx) => tx.query("insert into public.habits (name) values ('B keeps this')"));
    await reseed(USER_A, SAMPLE);
    expect((await habitsOf(USER_B)).map((h) => h.name)).toEqual(["B keeps this"]);
  });

  it("is all or nothing: a bad check-in day keeps the old habits", async () => {
    await reseed(USER_A, SAMPLE);
    const bad = [...SAMPLE, { name: "Too old", created_at: null, days: [ago(101)] }]; // outside the 100-day window
    expect(await errorCode(reseed(USER_A, bad))).toBe("42501");
    expect((await habitsOf(USER_A)).map((h) => h.name)).toEqual(["Drink water", "Read", "New one"]);
  });

  it("is all or nothing: an invalid name keeps the old habits", async () => {
    await reseed(USER_A, SAMPLE);
    expect(await errorCode(reseed(USER_A, [{ name: " padded", days: [] }]))).toBe("23514");
    expect(await habitsOf(USER_A)).toHaveLength(3);
  });

  it("a habit added after a reseed lands at the bottom (positions come from the counter, in list order)", async () => {
    await reseed(USER_A, SAMPLE);
    await asUser(db, USER_A, (tx) => tx.query("insert into public.habits (name) values ('Added later')"));
    expect((await habitsOf(USER_A)).map((h) => h.name)).toEqual(["Drink water", "Read", "New one", "Added later"]);
  });

  it("is all or nothing: a duplicate day, or days that aren't a list, keep the old habits", async () => {
    await reseed(USER_A, SAMPLE);
    expect(await errorCode(reseed(USER_A, [{ name: "Twice", days: [ago(1), ago(1)] }]))).toBe("23505");
    expect(await errorCode(reseed(USER_A, [{ name: "Odd", days: "not a list" }]))).toBeDefined();
    expect(await habitsOf(USER_A)).toHaveLength(3);
  });

  it("still obeys the 100-habit limit", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ name: `Habit ${i}`, days: [] }));
    expect(await errorCode(reseed(USER_A, tooMany))).toBe("54000");
  });

  it("refuses something that isn't a list", async () => {
    expect(await errorCode(reseed(USER_A, { name: "not a list" }))).toBe("22023");
  });

  it("an empty list leaves you with no habits", async () => {
    await reseed(USER_A, SAMPLE);
    await reseed(USER_A, []);
    expect(await habitsOf(USER_A)).toHaveLength(0);
  });

  it("anon can't run it, and PUBLIC has no grant", async () => {
    expect(await errorCode(asAnon(db, (tx) => tx.query("select public.reseed_demo_habits('[]'::jsonb)")))).toBe("42501");
    const { rows } = await db.query<{ anon: boolean; authed: boolean; public_grants: number }>(
      `select has_function_privilege('anon', 'public.reseed_demo_habits(jsonb)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.reseed_demo_habits(jsonb)', 'execute') as authed,
              (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
                where p.oid = 'public.reseed_demo_habits(jsonb)'::regprocedure and a.grantee = 0) as public_grants`,
    );
    expect(rows[0]).toEqual({ anon: false, authed: true, public_grants: 0 });
  });
});
