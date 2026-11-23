// The migration, run against real Postgres with Supabase's roles and
// default privileges (tests/db/supabase-pglite.ts). Proves "own rows
// only", the grants and limits, and that the streak function matches
// lib/streaks.ts.
//
// Dates are relative to the real today: the check-in policy only accepts
// days near today, so fixed dates would start failing next month.

import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { normalizeHabitName, validateHabitName } from "@/lib/habit-name";
import { currentStreak } from "@/lib/streaks";
import { USER_A, USER_B, asAnon, asUser, errorCode, freshDatabase, utcToday } from "./supabase-pglite";

// Postgres error codes.
const PERMISSION_DENIED = "42501"; // no privilege, or a Row Level Security "with check" failed
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const INVALID_PARAMETER = "22023";
const LIMIT_REACHED = "54000";
const STALE_LIST = "HR001";

const TODAY = utcToday();

let db: PGlite;

beforeAll(async () => {
  db = await freshDatabase();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  // As the superuser: wipe between tests (check-ins go with their habits).
  await db.exec("delete from public.habits");
});

async function addHabit(tx: Transaction, name: string): Promise<string> {
  const { rows } = await tx.query<{ id: string }>("insert into public.habits (name) values ($1) returning id", [name]);
  return rows[0].id;
}

async function habitOf(user: string, name = "Run"): Promise<string> {
  return asUser(db, user, (tx) => addHabit(tx, name));
}

/** What supabase-js upsert(..., { onConflict, ignoreDuplicates: true }) sends. */
const CHECK_IN = `insert into public.habit_checkins (habit_id, day) values ($1, $2)
  on conflict (user_id, habit_id, day) do nothing`;

/** Superuser insert (skips RLS and the date window): for histories the app could never write today. */
async function seedCheckins(user: string, habitId: string, days: string[]) {
  if (days.length === 0) return;
  await db.query("insert into public.habit_checkins (user_id, habit_id, day) select $1, $2, unnest($3::date[])", [
    user,
    habitId,
    days,
  ]);
}

describe("habits: own rows only", () => {
  it("fills user_id from the login, and each user sees only their own", async () => {
    await habitOf(USER_A, "A's habit");
    await habitOf(USER_B, "B's habit");
    const seenByA = await asUser(db, USER_A, (tx) =>
      tx.query<{ name: string; user_id: string }>("select name, user_id from public.habits"),
    );
    expect(seenByA.rows).toEqual([{ name: "A's habit", user_id: USER_A }]);
  });

  it("can't insert a habit for someone else", async () => {
    const code = await errorCode(
      asUser(db, USER_A, (tx) => tx.query("insert into public.habits (user_id, name) values ($1, 'sneaky')", [USER_B])),
    );
    expect(code).toBe(PERMISSION_DENIED);
  });

  it("can't rename or delete someone else's habit (it simply isn't there)", async () => {
    const bHabit = await habitOf(USER_B);
    const renamed = await asUser(db, USER_A, (tx) =>
      tx.query("update public.habits set name = 'mine now' where id = $1", [bHabit]),
    );
    const deleted = await asUser(db, USER_A, (tx) => tx.query("delete from public.habits where id = $1", [bHabit]));
    expect(renamed.affectedRows).toBe(0);
    expect(deleted.affectedRows).toBe(0);
    const { rows } = await db.query<{ name: string }>("select name from public.habits where id = $1", [bHabit]);
    expect(rows).toEqual([{ name: "Run" }]);
  });

  it("can rename and reorder your own, but never change id, owner or created_at", async () => {
    const id = await habitOf(USER_A);
    const renamed = await asUser(db, USER_A, (tx) =>
      tx.query("update public.habits set name = 'Walk', position = 9 where id = $1", [id]),
    );
    expect(renamed.affectedRows).toBe(1);
    for (const sql of [
      "update public.habits set user_id = $2 where id = $1",
      "update public.habits set id = gen_random_uuid() where id = $1",
      "update public.habits set created_at = now() - interval '1 year' where id = $1",
    ]) {
      const params = sql.includes("$2") ? [id, USER_B] : [id];
      expect(await errorCode(asUser(db, USER_A, (tx) => tx.query(sql, params)))).toBe(PERMISSION_DENIED);
    }
  });

  it("can't truncate either table", async () => {
    for (const table of ["public.habits", "public.habit_checkins"]) {
      expect(await errorCode(asUser(db, USER_A, (tx) => tx.exec(`truncate ${table} cascade`)))).toBe(PERMISSION_DENIED);
    }
  });

  it("puts new habits at the bottom, even after a reorder", async () => {
    const [first, second, third] = await asUser(db, USER_A, async (tx) => [
      await addHabit(tx, "One"),
      await addHabit(tx, "Two"),
      await addHabit(tx, "Three"),
    ]);
    await asUser(db, USER_A, (tx) => tx.query("select public.reorder_habits($1)", [[third, first, second]]));
    await habitOf(USER_A, "Four");
    const { rows } = await asUser(db, USER_A, (tx) =>
      tx.query<{ name: string }>("select name from public.habits order by position, created_at, id"),
    );
    expect(rows.map((r) => r.name)).toEqual(["Three", "One", "Two", "Four"]);
  });

  it("stops at 100 habits each, even in one bulk insert", async () => {
    const bulk = (count: number) =>
      asUser(db, USER_A, (tx) =>
        tx.query("insert into public.habits (name) select 'Habit ' || g from generate_series(1, $1::int) as g", [count]),
      );
    expect(await errorCode(bulk(101))).toBe(LIMIT_REACHED);
    await bulk(100);
    expect(await errorCode(asUser(db, USER_A, (tx) => addHabit(tx, "one too many")))).toBe(LIMIT_REACHED);
    // Someone else's count is their own.
    await expect(habitOf(USER_B)).resolves.toBeTypeOf("string");
  });
});

describe("habit names: the database agrees with lib/habit-name.ts", () => {
  const tricky = [
    "Run",
    "  padded  ",
    "\ttab\t",
    " no-break ",
    "line\nbreak",
    "🔥".repeat(60),
    "🔥".repeat(61),
    "a".repeat(60),
    "a".repeat(61),
    "🧘‍♀️ Yoga",
  ];
  for (const raw of tricky) {
    it(`accepts what the app would save: ${JSON.stringify(raw).slice(0, 30)}`, async () => {
      const name = normalizeHabitName(raw);
      const appAccepts = validateHabitName(name) === null;
      const result = asUser(db, USER_A, (tx) => addHabit(tx, name));
      if (appAccepts) await expect(result).resolves.toBeTypeOf("string");
      else expect(await errorCode(result)).toBe(CHECK_VIOLATION);
    });
  }

  it("refuses names with spaces at either end or over 60 characters, as a backstop", async () => {
    for (const bad of [" lead", "trail ", "\ttab", "", "x".repeat(61)]) {
      expect(await errorCode(asUser(db, USER_A, (tx) => addHabit(tx, bad)))).toBe(CHECK_VIOLATION);
    }
  });
});

describe("habit_checkins: own rows only", () => {
  it("lets you check in and undo on your own habit", async () => {
    const id = await habitOf(USER_A);
    const added = await asUser(db, USER_A, (tx) => tx.query(CHECK_IN, [id, TODAY]));
    expect(added.affectedRows).toBe(1);
    const undone = await asUser(db, USER_A, (tx) =>
      tx.query("delete from public.habit_checkins where habit_id = $1 and day = $2", [id, TODAY]),
    );
    expect(undone.affectedRows).toBe(1);
  });

  it("one check-in per habit per day: a second one is a conflict, or nothing with on conflict", async () => {
    const id = await habitOf(USER_A);
    const plain = (tx: Transaction) => tx.query("insert into public.habit_checkins (habit_id, day) values ($1, $2)", [id, TODAY]);
    await asUser(db, USER_A, plain);
    expect(await errorCode(asUser(db, USER_A, plain))).toBe(UNIQUE_VIOLATION);
    const again = await asUser(db, USER_A, (tx) => tx.query(CHECK_IN, [id, TODAY]));
    expect(again.affectedRows).toBe(0);
  });

  it("can't check in on someone else's habit, and can't tell whether they did that day", async () => {
    const bHabit = await habitOf(USER_B);
    await asUser(db, USER_B, (tx) => tx.query(CHECK_IN, [bHabit, TODAY]));

    const plainInsert = "insert into public.habit_checkins (habit_id, day) values ($1, $2)";
    const sameDay = await errorCode(asUser(db, USER_A, (tx) => tx.query(plainInsert, [bHabit, TODAY])));
    const otherDay = await errorCode(asUser(db, USER_A, (tx) => tx.query(plainInsert, [bHabit, addDays(TODAY, -1)])));
    // Even ignoring duplicates it's an error, never a silent "ok".
    const ignoring = await errorCode(asUser(db, USER_A, (tx) => tx.query(CHECK_IN, [bHabit, TODAY])));
    expect([sameDay, otherDay, ignoring]).toEqual([FOREIGN_KEY_VIOLATION, FOREIGN_KEY_VIOLATION, FOREIGN_KEY_VIOLATION]);
  });

  it("can't insert a check-in as someone else", async () => {
    const bHabit = await habitOf(USER_B);
    const code = await errorCode(
      asUser(db, USER_A, (tx) =>
        tx.query("insert into public.habit_checkins (user_id, habit_id, day) values ($1, $2, $3)", [USER_B, bHabit, TODAY]),
      ),
    );
    expect(code).toBe(PERMISSION_DENIED);
  });

  it("can't see or delete someone else's check-ins", async () => {
    const bHabit = await habitOf(USER_B);
    await asUser(db, USER_B, (tx) => tx.query(CHECK_IN, [bHabit, TODAY]));
    const seen = await asUser(db, USER_A, (tx) => tx.query("select * from public.habit_checkins"));
    const deleted = await asUser(db, USER_A, (tx) => tx.query("delete from public.habit_checkins"));
    expect(seen.rows).toHaveLength(0);
    expect(deleted.affectedRows).toBe(0);
  });

  it("can't edit a check-in, only add or remove one", async () => {
    const id = await habitOf(USER_A);
    await asUser(db, USER_A, (tx) => tx.query(CHECK_IN, [id, TODAY]));
    const code = await errorCode(
      asUser(db, USER_A, (tx) =>
        tx.query("update public.habit_checkins set day = $2 where habit_id = $1", [id, addDays(TODAY, -1)]),
      ),
    );
    expect(code).toBe(PERMISSION_DENIED);
  });

  it("only accepts new days from 60 days ago to tomorrow (UTC)", async () => {
    const id = await habitOf(USER_A);
    for (const day of [addDays(TODAY, -60), addDays(TODAY, -1), TODAY, addDays(TODAY, 1)]) {
      const { affectedRows } = await asUser(db, USER_A, (tx) => tx.query(CHECK_IN, [id, day]));
      expect(affectedRows, day).toBe(1);
    }
    for (const day of [addDays(TODAY, -61), addDays(TODAY, 2), addDays(TODAY, 5), "5000-01-01"]) {
      expect(await errorCode(asUser(db, USER_A, (tx) => tx.query(CHECK_IN, [id, day]))), day).toBe(PERMISSION_DENIED);
    }
  });

  it("refuses days before 2000 outright", async () => {
    const id = await habitOf(USER_A);
    expect(await errorCode(seedCheckins(USER_A, id, ["1999-12-31"]))).toBe(CHECK_VIOLATION);
  });

  it("deleting a habit deletes its check-ins", async () => {
    const id = await habitOf(USER_A);
    await asUser(db, USER_A, (tx) => tx.query(CHECK_IN, [id, TODAY]));
    await asUser(db, USER_A, (tx) => tx.query("delete from public.habits where id = $1", [id]));
    const { rows } = await db.query("select * from public.habit_checkins");
    expect(rows).toHaveLength(0);
  });
});

describe("privileges", () => {
  it("anon (not logged in) can't read, write or call anything", async () => {
    await habitOf(USER_A);
    for (const sql of [
      "select * from public.habits",
      "select * from public.habit_checkins",
      `insert into public.habits (user_id, name) values ('${USER_A}', 'x')`,
      "delete from public.habits",
      `select * from public.habit_streaks('${TODAY}')`,
      "select public.reorder_habits(array[]::uuid[])",
    ]) {
      expect(await errorCode(asAnon(db, (tx) => tx.query(sql))), sql).toBe(PERMISSION_DENIED);
    }
  });

  // Checked directly: a security-invoker function called by anon fails on
  // the tables anyway, so the test above would pass even without the revoke.
  it("only authenticated may run the functions; not anon, not PUBLIC", async () => {
    for (const fn of ["public.habit_streaks(date)", "public.reorder_habits(uuid[])"]) {
      const { rows } = await db.query<{ anon: boolean; authed: boolean; public_grants: number }>(
        `select has_function_privilege('anon', $1, 'execute') as anon,
                has_function_privilege('authenticated', $1, 'execute') as authed,
                (select count(*)::int from pg_proc p, aclexplode(p.proacl) a
                  where p.oid = $1::regprocedure and a.grantee = 0) as public_grants`,
        [fn],
      );
      expect(rows[0], fn).toEqual({ anon: false, authed: true, public_grants: 0 });
    }
  });

  it("nobody but the owner can run the habit-limit trigger function directly", async () => {
    const { rows } = await db.query<{ anon: boolean; authed: boolean }>(
      `select has_function_privilege('anon', 'public.habits_enforce_limit()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.habits_enforce_limit()', 'execute') as authed`,
    );
    expect(rows[0]).toEqual({ anon: false, authed: false });
  });

  it("nobody can change the position counter (setval would break every insert)", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ usage: boolean; update: boolean }>(
        `select has_sequence_privilege($1, 'public.habits_position_seq', 'usage') as usage,
                has_sequence_privilege($1, 'public.habits_position_seq', 'update') as update`,
        [role],
      );
      expect(rows[0], role).toEqual({ usage: false, update: false });
    }
  });
});

describe("habit_streaks", () => {
  async function streaks(user: string, today: string | null = TODAY): Promise<Map<string, number>> {
    const { rows } = await asUser(db, user, (tx) =>
      tx.query<{ habit_id: string; current_streak: number }>("select * from public.habit_streaks($1)", [today]),
    );
    return new Map(rows.map((r) => [r.habit_id, r.current_streak]));
  }

  it("counts today, keeps a streak alive until the day ends, and resets after a missed day", async () => {
    const [doneToday, notYet, broken, future] = await asUser(db, USER_A, async (tx) => [
      await addHabit(tx, "done today"),
      await addHabit(tx, "not yet today"),
      await addHabit(tx, "missed yesterday"),
      await addHabit(tx, "future rows"),
    ]);
    const ago = (n: number) => addDays(TODAY, -n);
    await seedCheckins(USER_A, doneToday, [ago(2), ago(1), ago(0)]);
    await seedCheckins(USER_A, notYet, [ago(3), ago(2), ago(1)]);
    await seedCheckins(USER_A, broken, [ago(3), ago(2)]);
    await seedCheckins(USER_A, future, [addDays(TODAY, 1), addDays(TODAY, 2)]);

    const result = await streaks(USER_A);
    expect(result.get(doneToday)).toBe(3);
    expect(result.get(notYet)).toBe(3);
    expect(result.has(broken)).toBe(false); // 0
    expect(result.has(future)).toBe(false); // days after today are ignored
  });

  it("runs across a year end and a leap day", async () => {
    const id = await habitOf(USER_A);
    await seedCheckins(USER_A, id, ["2027-12-30", "2027-12-31", "2028-01-01", "2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"]);
    expect((await streaks(USER_A, "2028-01-01")).get(id)).toBe(3);
    expect((await streaks(USER_A, "2028-03-01")).get(id)).toBe(4);
    expect((await streaks(USER_A, "2028-03-02")).get(id)).toBe(4); // today not done yet
  });

  it("returns nothing (not an error) for a missing day", async () => {
    const id = await habitOf(USER_A);
    await seedCheckins(USER_A, id, [TODAY]);
    expect((await streaks(USER_A, null)).size).toBe(0);
  });

  it("only counts your own habits", async () => {
    const bHabit = await habitOf(USER_B);
    await seedCheckins(USER_B, bHabit, [TODAY]);
    expect((await streaks(USER_A)).size).toBe(0);
    expect((await streaks(USER_B)).get(bHabit)).toBe(1);
  });

  it("matches lib/streaks.ts currentStreak on 300 random histories", async () => {
    // A small seeded random generator, so a failure is repeatable.
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    // Three batches of 100 (the most one user may have), wiped in between.
    const histories = new Map<string, string[]>();
    for (let batch = 0; batch < 3; batch++) {
      await db.exec("delete from public.habits");
      const batchHistories = new Map<string, string[]>();
      await asUser(db, USER_A, async (tx) => {
        for (let i = 0; i < 100; i++) {
          const id = await addHabit(tx, `habit ${batch}-${i}`);
          const density = random(); // some habits sparse, some dense
          const days: string[] = [];
          for (let offset = -400; offset <= 3; offset++) {
            if (random() < density) days.push(addDays(TODAY, offset));
          }
          batchHistories.set(id, days);
        }
      });
      for (const [id, days] of batchHistories) await seedCheckins(USER_A, id, days);
      const fromSql = await streaks(USER_A);
      for (const [id, days] of batchHistories) {
        expect(fromSql.get(id) ?? 0, `habit ${id} with ${days.length} days`).toBe(currentStreak(days, TODAY));
        histories.set(id, days);
      }
    }
    // Make sure the random histories actually exercised real (and long) streaks.
    const lengths = [...histories.values()].map((days) => currentStreak(days, TODAY));
    expect(lengths.filter((n) => n > 0).length).toBeGreaterThan(50);
    expect(Math.max(...lengths)).toBeGreaterThan(60);
  });
});

describe("reorder_habits", () => {
  async function names(user: string) {
    const { rows } = await asUser(db, user, (tx) =>
      tx.query<{ name: string }>("select name from public.habits order by position, created_at, id"),
    );
    return rows.map((r) => r.name);
  }

  it("reorders all your habits in one go and says how many moved", async () => {
    const [a, b, c] = await asUser(db, USER_A, async (tx) => [
      await addHabit(tx, "a"),
      await addHabit(tx, "b"),
      await addHabit(tx, "c"),
    ]);
    const { rows } = await asUser(db, USER_A, (tx) =>
      tx.query<{ moved: number }>("select public.reorder_habits($1) as moved", [[c, a, b]]),
    );
    expect(rows[0].moved).toBe(3);
    expect(await names(USER_A)).toEqual(["c", "a", "b"]);
  });

  it("refuses a stale list (missing one of yours, or including a deleted one) and changes nothing", async () => {
    const [a, b, c] = await asUser(db, USER_A, async (tx) => [
      await addHabit(tx, "a"),
      await addHabit(tx, "b"),
      await addHabit(tx, "c"),
    ]);
    const deleted = "00000000-0000-4000-8000-0000000000dd";
    for (const ids of [[c, a], [c, a, deleted], [c, b, a, deleted]]) {
      const code = await errorCode(asUser(db, USER_A, (tx) => tx.query("select public.reorder_habits($1)", [ids])));
      expect(code, JSON.stringify(ids)).toBe(STALE_LIST);
    }
    expect(await names(USER_A)).toEqual(["a", "b", "c"]);
  });

  it("refuses someone else's ids, and leaves theirs alone", async () => {
    const mine = await habitOf(USER_A, "mine");
    const theirs = await habitOf(USER_B, "theirs");
    const before = await db.query<{ position: string }>("select position from public.habits where id = $1", [theirs]);
    const code = await errorCode(asUser(db, USER_A, (tx) => tx.query("select public.reorder_habits($1)", [[theirs]])));
    expect(code).toBe(STALE_LIST);
    const code2 = await errorCode(
      asUser(db, USER_A, (tx) => tx.query("select public.reorder_habits($1)", [[theirs, mine]])),
    );
    expect(code2).toBe(STALE_LIST);
    const after = await db.query<{ position: string }>("select position from public.habits where id = $1", [theirs]);
    expect(after.rows[0].position).toBe(before.rows[0].position);
  });

  it("refuses duplicate or missing ids", async () => {
    const a = await habitOf(USER_A, "a");
    for (const ids of [[a, a], [a, null], null]) {
      const code = await errorCode(asUser(db, USER_A, (tx) => tx.query("select public.reorder_habits($1::uuid[])", [ids])));
      expect(code).toBe(INVALID_PARAMETER);
    }
  });

  it("an empty list with no habits moves nothing", async () => {
    const { rows } = await asUser(db, USER_A, (tx) =>
      tx.query<{ moved: number }>("select public.reorder_habits(array[]::uuid[]) as moved"),
    );
    expect(rows[0].moved).toBe(0);
  });
});
