-- Hold: the History page (plans/habit-tracker.md, Feature 7).
--
-- How to apply: Supabase dashboard -> SQL Editor -> New query, paste this
-- whole file, Run. Once, AFTER 20261123120000_habits.sql. It adds one
-- function and widens one policy; it doesn't touch Staple's tables. One
-- transaction: if anything fails, nothing is kept.
--
-- Safe to apply before the History code is deployed: the live app doesn't
-- call the new function, and the wider window only allows more.
--
-- tests/db/history.db.test.ts runs every migration in order against real
-- Postgres (PGlite) and checks the rules below.

begin;

-- ---------------------------------------------------------------------------
-- A new check-in may now be up to 100 days old (was 60). The demo's sample
-- history is 90 days, and reseed_demo_habits runs as the demo user, so its
-- rows must pass this policy. 90 days back in your timezone can be 90 days
-- back in UTC (UTC is a day ahead of the Americas every evening); 100 leaves
-- room. Still stops anyone calling Supabase directly from filling the table
-- with years of dates. Everything else about the rule is unchanged.
-- ---------------------------------------------------------------------------
drop policy habit_checkins_insert_own on public.habit_checkins;
create policy habit_checkins_insert_own on public.habit_checkins
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and day between (now() at time zone 'utc')::date - 100 and (now() at time zone 'utc')::date + 1
  );

-- ---------------------------------------------------------------------------
-- habit_history: everything the History page needs, one row per habit (at
-- most 100 rows, under the API's 1,000-row limit, whatever the range).
--
--   days            your check-ins from p_from to p_today, oldest first.
--                   Only these leave the database.
--   lead_in         the length of the run of back-to-back check-ins ending
--                   exactly the day BEFORE p_from (0 if that day isn't
--                   done), so a long streak that began before the window can
--                   be counted in full. The app only uses it when p_from
--                   itself is done (otherwise that run doesn't reach in).
--   current_streak  straight from habit_streaks(p_today): the same number
--                   as Today shows.
--
-- Check-ins after p_today (saved further east, viewed further west) are
-- left out. The window is capped at 366 days. Deleted habits are gone (and
-- their check-ins with them), so they never appear.
--
-- security invoker: Row Level Security applies; every part also filters on
-- your user id, so the (user_id, day) index is used.
-- ---------------------------------------------------------------------------
create function public.habit_history(p_from date, p_today date)
returns table (
  habit_id uuid,
  name text,
  created_at timestamptz,
  days date[],
  lead_in integer,
  current_streak integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select greatest(p_from, p_today - 365) as first_day, p_today as last_day
  ),
  in_window as (
    select c.habit_id, array_agg(c.day order by c.day) as days
    from public.habit_checkins as c, bounds as b
    where c.user_id = (select auth.uid())
      and c.day between b.first_day and b.last_day
    group by c.habit_id
  ),
  -- Gaps and islands (as in habit_streaks), only for days before the window.
  before_window as (
    select
      c.habit_id,
      c.day,
      c.day - (row_number() over (partition by c.habit_id order by c.day))::integer as run_key
    from public.habit_checkins as c, bounds as b
    where c.user_id = (select auth.uid())
      and c.day < b.first_day
  ),
  lead as (
    select w.habit_id, count(*)::integer as days
    from before_window as w, bounds as b
    group by w.habit_id, w.run_key, b.first_day
    having max(w.day) = b.first_day - 1
  )
  select
    h.id,
    h.name,
    h.created_at,
    coalesce(i.days, '{}'::date[]),
    coalesce(l.days, 0),
    coalesce(s.current_streak, 0)
  from public.habits as h
  left join in_window as i on i.habit_id = h.id
  left join lead as l on l.habit_id = h.id
  left join public.habit_streaks(p_today) as s on s.habit_id = h.id
  where h.user_id = (select auth.uid())
  order by h.position, h.created_at, h.id
$$;

revoke all on function public.habit_history(date, date) from public, anon, authenticated;
grant execute on function public.habit_history(date, date) to authenticated;

commit;
