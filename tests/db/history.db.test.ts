// habit_history (the History page, Feature 7), against real Postgres with
// Supabase's roles (tests/db/supabase-pglite.ts), all migrations applied.

import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, daysBetween } from "@/lib/dates";
import { buildHistory, longestRun, toHistoryHabits, windowStart, type HistoryRow } from "@/lib/history";
import { USER_A, USER_B, asAnon, asUser, errorCode, freshDatabase, utcToday } from "./supabase-pglite";

const TODAY = utcToday();
const ago = (n: number) => addDays(TODAY, -n);
const FROM = windowStart(TODAY); // 89 days ago

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

async function addHabit(tx: Transaction, name: string): Promise<string> {
  const { rows } = await tx.query<{ id: string }>("insert into public.habits (name) values ($1) returning id", [name]);
  return rows[0].id;
}

/** Superuser insert (skips RLS and the date window), for long histories. */
async function seed(user: string, habitId: string, days: string[]) {
  if (days.length === 0) return;
  await db.query("insert into public.habit_checkins (user_id, habit_id, day) select $1, $2, unnest($3::date[])", [user, habitId, days]);
}

type Row = Omit<HistoryRow, "created_at" | "days"> & { created_at: Date; days: string[] };

async function history(user: string, from = FROM, today = TODAY): Promise<Row[]> {
  const { rows } = await asUser(db, user, (tx) =>
    // to_char: compare plain day strings, the way the API returns them.
    tx.query<Row>(
      `select habit_id, name, created_at, array(select to_char(d, 'YYYY-MM-DD') from unnest(days) d) as days, lead_in, current_streak
         from public.habit_history($1, $2)`,
      [from, today],
    ),
  );
  return rows;
}

const span = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => ago(from - i));

describe("habit_history", () => {
  it("returns only your habits, in screen order, with an empty list for a habit with no check-ins", async () => {
    const [a1, a2] = await asUser(db, USER_A, async (tx) => [await addHabit(tx, "first"), await addHabit(tx, "second")]);
    const b = await asUser(db, USER_B, (tx) => addHabit(tx, "B's"));
    await seed(USER_B, b, [TODAY]);
    await asUser(db, USER_A, (tx) => tx.query("select public.reorder_habits($1)", [[a2, a1]]));

    const rows = await history(USER_A);
    expect(rows.map((r) => [r.name, r.days, r.lead_in, r.current_streak])).toEqual([
      ["second", [], 0, 0],
      ["first", [], 0, 0],
    ]);
  });

  it("returns only the window's days, oldest first, and none after today", async () => {
    const id = await asUser(db, USER_A, (tx) => addHabit(tx, "h"));
    await seed(USER_A, id, [ago(120), ago(90), ago(89), ago(10), ago(0), addDays(TODAY, 1)]);
    const [row] = await history(USER_A);
    expect(row.days).toEqual([ago(89), ago(10), ago(0)]);
  });

  it("gives the lead-in: the run ending the day before the window, 0 if that day isn't done", async () => {
    const [touching, gap, none] = await asUser(db, USER_A, async (tx) => [
      await addHabit(tx, "touching"),
      await addHabit(tx, "gap"),
      await addHabit(tx, "none"),
    ]);
    await seed(USER_A, touching, [...span(105, 90), ago(89)]); // 16 days right up to the window
    await seed(USER_A, gap, span(105, 91)); // stops two days before
    const rows = new Map((await history(USER_A)).map((r) => [r.habit_id, r.lead_in]));
    expect(rows.get(touching)).toBe(16);
    expect(rows.get(gap)).toBe(0);
    expect(rows.get(none)).toBe(0);
  });

  it("returns the same current streak as habit_streaks (the number Today shows)", async () => {
    const id = await asUser(db, USER_A, (tx) => addHabit(tx, "long"));
    await seed(USER_A, id, span(150, 1)); // 150 days, today not done yet
    const [row] = await history(USER_A);
    const { rows } = await asUser(db, USER_A, (tx) =>
      tx.query<{ current_streak: number }>("select current_streak from public.habit_streaks($1)", [TODAY]),
    );
    expect(row.current_streak).toBe(150);
    expect(row.current_streak).toBe(rows[0].current_streak);
  });

  it("forgets a deleted habit, with its history", async () => {
    const [keep, gone] = await asUser(db, USER_A, async (tx) => [await addHabit(tx, "keep"), await addHabit(tx, "gone")]);
    await seed(USER_A, gone, [ago(1), ago(0)]);
    await asUser(db, USER_A, (tx) => tx.query("delete from public.habits where id = $1", [gone]));
    expect((await history(USER_A)).map((r) => r.habit_id)).toEqual([keep]);
  });

  it("caps the window at 366 days", async () => {
    const id = await asUser(db, USER_A, (tx) => addHabit(tx, "h"));
    await seed(USER_A, id, [ago(400), ago(365), ago(0)]);
    const [row] = await history(USER_A, ago(1000));
    expect(row.days).toEqual([ago(365), ago(0)]);
  });

  it("doesn't fail on odd windows from a direct caller: reversed, or no start (capped to 366 days)", async () => {
    const id = await asUser(db, USER_A, (tx) => addHabit(tx, "h"));
    await seed(USER_A, id, [ago(400), ago(300), ago(1)]);
    expect((await history(USER_A, TODAY, ago(5)))[0].days).toEqual([]);
    const { rows } = await asUser(db, USER_A, (tx) =>
      tx.query<{ n: number }>("select cardinality(days) as n from public.habit_history(null, $1)", [TODAY]),
    );
    expect(rows[0].n).toBe(2);
  });

  it("anon can't run it, and PUBLIC has no grant", async () => {
    expect(await errorCode(asAnon(db, (tx) => tx.query(`select * from public.habit_history('${FROM}', '${TODAY}')`)))).toBe("42501");
    const { rows } = await db.query<{ anon: boolean; authed: boolean; public_grants: number }>(
      `select has_function_privilege('anon', 'public.habit_history(date, date)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.habit_history(date, date)', 'execute') as authed,
              (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
                where p.oid = 'public.habit_history(date, date)'::regprocedure and a.grantee = 0) as public_grants`,
    );
    expect(rows[0]).toEqual({ anon: false, authed: true, public_grants: 0 });
  });

  it("matches a brute-force longest streak on 300 random histories, for 7, 30 and 90 days", async () => {
    let seedValue = 7;
    const random = () => (seedValue = (seedValue * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    /** Every run in the full history; the longest one that ends on or after `start`. */
    function bruteForce(days: string[], start: string): number {
      const sorted = days.filter((d) => d <= TODAY).sort();
      let best = 0;
      let length = 0;
      sorted.forEach((day, i) => {
        length = i > 0 && daysBetween(sorted[i - 1], day) === 1 ? length + 1 : 1;
        const endsHere = i === sorted.length - 1 || daysBetween(day, sorted[i + 1]) !== 1;
        if (endsHere && day >= start) best = Math.max(best, length);
      });
      return best;
    }

    let checked = 0;
    let leadInsUsed = 0;
    for (let batch = 0; batch < 3; batch++) {
      await db.exec("delete from public.habits");
      const full = new Map<string, string[]>();
      await asUser(db, USER_A, async (tx) => {
        for (let i = 0; i < 100; i++) {
          const id = await addHabit(tx, `habit ${batch}-${i}`);
          // Runs and lapses: stay on the same state with probability `stick`.
          const stick = 0.5 + random() * 0.48;
          let on = random() < 0.5;
          const days: string[] = [];
          for (let offset = -200; offset <= 2; offset++) {
            if (random() > stick) on = !on;
            if (on) days.push(addDays(TODAY, offset));
          }
          full.set(id, days);
        }
      });
      for (const [id, days] of full) await seed(USER_A, id, days);

      const rows = await history(USER_A);
      const habits = toHistoryHabits(rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() })), "UTC");
      for (const range of [7, 30, 90] as const) {
        const start = windowStart(TODAY, range);
        for (const habit of habits) {
          const expected = bruteForce(full.get(habit.id)!, start);
          expect(longestRun(habit.days, start, TODAY, habit.leadIn, FROM), `${habit.name}, ${range} days`).toBe(expected);
          checked++;
        }
        // The page's own number is the best of these.
        const view = buildHistory(habits, TODAY, range);
        expect(view.longest).toBe(Math.max(0, ...habits.map((h) => bruteForce(full.get(h.id)!, start))));
        expect(view.longest).toBeGreaterThanOrEqual(view.bestNow);
      }
      leadInsUsed += habits.filter((h) => h.leadIn > 0 && h.days[0] === FROM).length;
    }
    expect(checked).toBe(900);
    // Make sure the random histories really tested the lead-in.
    expect(leadInsUsed).toBeGreaterThan(20);
  });
});
