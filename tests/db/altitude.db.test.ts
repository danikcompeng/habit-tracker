// habit_altitude (The Climb, Feature 10), against real Postgres with
// Supabase's roles, all migrations applied: it must agree with
// lib/altitude.ts, which is the same rule in TypeScript.

import type { PGlite, Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { altitudeOf, dailyClimbCm } from "@/lib/altitude";
import { addDays, todayIn } from "@/lib/dates";
import { USER_A, USER_B, asAnon, asUser, errorCode, freshDatabase, utcToday } from "./supabase-pglite";

const TODAY = utcToday();
const ago = (n: number) => addDays(TODAY, -n);

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

/** Superuser writes (skip RLS and the date window): a habit's creation time, and its check-ins. */
async function setCreated(id: string, at: Date) {
  await db.query("update public.habits set created_at = $2 where id = $1", [id, at.toISOString()]);
}
async function seed(user: string, habitId: string, days: string[]) {
  if (days.length === 0) return;
  await db.query("insert into public.habit_checkins (user_id, habit_id, day) select $1, $2, unnest($3::date[])", [user, habitId, days]);
}

/** Centimetres, as the API returns them. */
async function altitude(user: string, today = TODAY, tz = "UTC"): Promise<{ altitudeCm: number; beforeTodayCm: number }> {
  const { rows } = await asUser(db, user, (tx) =>
    tx.query<{ altitude_cm: string | number; before_today_cm: string | number }>(
      "select altitude_cm, before_today_cm from public.habit_altitude($1, $2)",
      [today, tz],
    ),
  );
  return { altitudeCm: Number(rows[0].altitude_cm), beforeTodayCm: Number(rows[0].before_today_cm) };
}
const m = (altitude: number, before: number) => ({ altitudeCm: altitude * 100, beforeTodayCm: before * 100 });

/** Noon UTC, n days ago: the created day is that day in every time zone used below except the far ones. */
const noonAgo = (n: number) => new Date(`${ago(n)}T12:00:00Z`);

describe("habit_altitude", () => {
  it("is 0 with no habits, and with a habit made today and nothing done (an open day climbs 0)", async () => {
    expect(await altitude(USER_A)).toEqual(m(0, 0));
    await asUser(db, USER_A, (tx) => addHabit(tx, "new"));
    expect(await altitude(USER_A)).toEqual(m(0, 0));
  });

  it("climbs 100 m × the share done each day, plus 50 m on a perfect day; missed days never lose any", async () => {
    const [a, b] = await asUser(db, USER_A, async (tx) => [await addHabit(tx, "a"), await addHabit(tx, "b")]);
    await setCreated(a, noonAgo(3));
    await setCreated(b, noonAgo(3));
    // 3 days ago: both (150). 2 ago: one (50). Yesterday: none (0). Today: one, live (50).
    await seed(USER_A, a, [ago(3), ago(2), TODAY]);
    await seed(USER_A, b, [ago(3)]);
    expect(await altitude(USER_A)).toEqual(m(250, 200));
  });

  it("follows History's day rules: back-filled days count as done, days before a habit was made don't count", async () => {
    const [old, recent] = await asUser(db, USER_A, async (tx) => [await addHabit(tx, "old"), await addHabit(tx, "recent")]);
    await setCreated(old, noonAgo(5));
    await setCreated(recent, noonAgo(1));
    // 5 ago: only "old" counts, done → 150. 4, 3, 2 ago: "old" missed → 0, except
    // 3 ago "recent" was back-filled (before it was made): done 1 of 2 → 50.
    // Yesterday: both counted, none done → 0. Today: both open → 0.
    await seed(USER_A, old, [ago(5)]);
    await seed(USER_A, recent, [ago(3)]);
    expect(await altitude(USER_A)).toEqual(m(200, 200));
  });

  it("leaves out check-ins after today", async () => {
    const id = await asUser(db, USER_A, (tx) => addHabit(tx, "h"));
    await setCreated(id, noonAgo(1));
    await seed(USER_A, id, [addDays(TODAY, 1), addDays(TODAY, 2)]);
    expect(await altitude(USER_A)).toEqual(m(0, 0));
  });

  it("counts only your own habits", async () => {
    const mine = await asUser(db, USER_A, (tx) => addHabit(tx, "mine"));
    const theirs = await asUser(db, USER_B, (tx) => addHabit(tx, "theirs"));
    await setCreated(mine, noonAgo(1));
    await setCreated(theirs, noonAgo(1));
    await seed(USER_B, theirs, [ago(1), TODAY]);
    expect(await altitude(USER_A)).toEqual(m(0, 0));
    expect(await altitude(USER_B)).toEqual(m(300, 150));
  });

  it("uses the time zone for the day a habit was made", async () => {
    const id = await asUser(db, USER_A, (tx) => addHabit(tx, "h"));
    // 02:00 UTC two days ago is still the evening before in Los Angeles.
    await setCreated(id, new Date(`${ago(2)}T02:00:00Z`));
    await seed(USER_A, id, [ago(3)]);
    // UTC: made 2 days ago, so 3 ago is back-filled and alone → 150; 2 ago and yesterday missed.
    // Los Angeles: made 3 days ago, the same check-in, the same 150. Then the
    // missed days: the same. The difference is in what counts on day 3 when a
    // second habit exists, so check against lib/altitude in both zones.
    for (const tz of ["UTC", "America/Los_Angeles"]) {
      const expected = altitudeOf([{ createdDay: todayIn(tz, new Date(`${ago(2)}T02:00:00Z`)), days: [ago(3)] }], TODAY);
      expect(await altitude(USER_A, TODAY, tz)).toEqual(expected);
    }
  });

  it("anon can't run it, and PUBLIC has no grant", async () => {
    expect(await errorCode(asAnon(db, (tx) => tx.query(`select * from public.habit_altitude('${TODAY}', 'UTC')`)))).toBe("42501");
    const { rows } = await db.query<{ ok: boolean }>(
      "select has_function_privilege('public', 'public.habit_altitude(date, text)', 'execute') as ok",
    );
    expect(rows[0].ok).toBe(false);
  });

  it("a third of the habits done is 3,333 cm a day in both, so fifteen such days stay under Treeline's 500 m line by the same amount", async () => {
    const ids = await asUser(db, USER_A, async (tx) => [await addHabit(tx, "a"), await addHabit(tx, "b"), await addHabit(tx, "c")]);
    for (const id of ids) await setCreated(id, noonAgo(16));
    await seed(USER_A, ids[0], Array.from({ length: 15 }, (_, i) => ago(i + 1)));
    const got = await altitude(USER_A);
    expect(got.beforeTodayCm).toBe(15 * 3_333);
    expect(got.beforeTodayCm).toBe(altitudeOf([{ createdDay: ago(16), days: Array.from({ length: 15 }, (_, i) => ago(i + 1)) }, { createdDay: ago(16), days: [] }, { createdDay: ago(16), days: [] }], TODAY).beforeTodayCm);
  });

  it("today counts every habit, even one whose made-day is after today (a clock a moment ahead)", async () => {
    const [a, b] = await asUser(db, USER_A, async (tx) => [await addHabit(tx, "a"), await addHabit(tx, "b")]);
    await setCreated(a, noonAgo(1));
    await setCreated(b, new Date(`${addDays(TODAY, 1)}T12:00:00Z`));
    await seed(USER_A, a, [TODAY]);
    expect((await altitude(USER_A)).altitudeCm).toBe(dailyClimbCm(1, 2));
  });

  it("agrees with lib/altitude.ts on 200 random histories, in five time zones", async () => {
    const zones = ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Pago_Pago"];
    let state = 7;
    const rnd = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    for (let round = 0; round < 200; round++) {
      await db.exec("delete from public.habits");
      const tz = zones[round % zones.length];
      const habits: { createdDay: string; days: string[] }[] = [];
      const count = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < count; i++) {
        const id = await asUser(db, USER_A, (tx) => addHabit(tx, `h${i}`));
        // Made any time in the last 40 days (or today), at any hour.
        const made = new Date(Date.now() - rnd() * 40 * 86_400_000);
        await setCreated(id, made);
        // Check-ins from 50 days ago to 2 days ahead: back-filled, ordinary, today, after today.
        const days = [...new Set(Array.from({ length: Math.floor(rnd() * 30) }, () => addDays(TODAY, 2 - Math.floor(rnd() * 52))))];
        await seed(USER_A, id, days);
        habits.push({ createdDay: todayIn(tz, made), days });
      }
      const expected = altitudeOf(habits, TODAY);
      const got = await altitude(USER_A, TODAY, tz);
      // Exactly, to the centimetre.
      expect(got, `round ${round} (${tz})`).toEqual(expected);
    }
  }, 120_000);

  it("before_today is the altitude minus today's climb", async () => {
    const [a, b] = await asUser(db, USER_A, async (tx) => [await addHabit(tx, "a"), await addHabit(tx, "b")]);
    await setCreated(a, noonAgo(2));
    await setCreated(b, noonAgo(2));
    await seed(USER_A, a, [ago(2), ago(1), TODAY]);
    await seed(USER_A, b, [ago(2), TODAY]);
    const got = await altitude(USER_A);
    expect(got.altitudeCm - got.beforeTodayCm).toBe(dailyClimbCm(2, 2));
  });
});
