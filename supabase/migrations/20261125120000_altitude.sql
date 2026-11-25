-- The Climb (plans/habit-tracker.md, Feature 10): how high you've climbed.
--
-- Derived, never stored, like streaks. lib/altitude.ts is the same rule in
-- TypeScript; tests/db/altitude.db.test.ts checks the two agree exactly.
--
-- Every day climbs
--   100 m × (habits done ÷ habits counted) + 50 m if every counted habit is done,
-- in whole CENTIMETRES (rounded half up), so SQL and TypeScript agree to
-- the centimetre and a zone is never missed by a rounding hair.
-- History's day rules decide what counts: a day is done if there's a
-- check-in (back-filled days too, even before the habit was made); a day
-- before the habit was made doesn't count; any other day counts (missed, or
-- today still open: today counts every habit). Missed days climb less, never
-- lose altitude.
--
-- Only days with a check-in can climb (no check-in, nothing done, 0), so
-- this works over your check-ins alone: the cost grows with your data, never
-- with the dates passed in.
--
-- p_tz turns created_at into the day the habit was made, in YOUR time zone,
-- exactly as the app does (todayIn(tz, created_at)). Check-ins after
-- p_today (saved further east, viewed further west) are left out. Deleted
-- habits are gone, their check-ins with them.
--
-- Returns one row: centimetres through p_today, and through the day before
-- (Today adds today's climb itself, live, as you complete habits).
--
-- security invoker: Row Level Security applies; every part also filters on
-- your user id. search_path = '': every name written in full.
-- ---------------------------------------------------------------------------
create function public.habit_altitude(p_today date, p_tz text)
returns table (altitude_cm bigint, before_today_cm bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with h as (
    select hb.id, (hb.created_at at time zone p_tz)::date as created_day
    from public.habits as hb
    where hb.user_id = (select auth.uid())
  ),
  by_day as (
    -- Per day: check-ins, and how many are back-filled before their habit was made.
    select ck.day, count(*) as done, count(*) filter (where h.created_day > ck.day) as early
    from public.habit_checkins as ck
    join h on h.id = ck.habit_id
    where ck.user_id = (select auth.uid())
      and ck.day <= p_today
    group by ck.day
  ),
  per_day as (
    select
      b.day,
      b.done,
      case
        -- Today: every habit counts (done, or still open).
        when b.day = p_today then (select count(*) from h)
        -- A past day: habits made by then (at most 100), plus back-filled check-ins.
        else (select count(*) from h where h.created_day <= b.day) + b.early
      end as counted
    from by_day as b
  ),
  climbs as (
    select
      p.day,
      -- Integer division on purpose: the same rounding as dailyClimbCm.
      ((20000 * p.done + p.counted) / (2 * p.counted)
        + case when p.done = p.counted then 5000 else 0 end)::bigint as cm
    from per_day as p
    where p.counted > 0
  )
  select
    coalesce(sum(cl.cm), 0)::bigint as altitude_cm,
    coalesce(sum(cl.cm) filter (where cl.day < p_today), 0)::bigint as before_today_cm
  from climbs as cl
$$;

revoke all on function public.habit_altitude(date, text) from public, anon, authenticated;
grant execute on function public.habit_altitude(date, text) to authenticated;
