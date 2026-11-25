# Ascend: Plan

## Overview

**Ascend** (first called **Hold**) is a habit tracker you press like a physical button. Today shows each habit as a big row: press and hold to complete it (a fill grows out from under your finger, a small pop when it's done), tap a done row to undo. Every habit shows its current streak and a 7-day dot grid. Mobile-first, installable to the home screen.

v1 scope:
- Habits: add, rename, reorder, delete.
- Today: press-and-hold to complete, tap to undo, streak per habit, last 7 days as dots.
- Login: email code (same Supabase project and email setup as Staple), plus "Try the demo".
- Installable PWA (manifest, icons, iOS home-screen meta).

Out of v1 (on purpose): schedules other than daily, reminders/notifications, editing past days, longest-streak stats, offline mode, sharing.

Why the first name, Hold: the core gesture is a hold, and the app is about holding on to a habit. Ascend keeps that idea (a habit kept day after day is a climb) and the icon shows it: a summit with a trail up it.

_Renamed **Ascend** on 2026-11-24 (the user's call): only the name and the icon changed. The live address is now https://ascend-dk.vercel.app (habit-tracker-ifaf.vercel.app 308-redirects there); the repo and the Vercel project are still `habit-tracker`. The gesture keeps its name ("press and hold", "Hold to complete", `lib/hold.ts`), and so do the `hold-auth` login cookie and the `hold_*` demo markers: a new cookie name would log out every session on the new address, and new marker names would make the shared demo reseed. (The move to a new host already logs out sessions from the old one: `vercel.app` is a public suffix, so cookies never cross between the two addresses; that also resets the `tz` and Tap to complete cookies.) `https://ascend-dk.vercel.app/auth/confirm` is on Supabase's Redirect URLs (exact, added by the user); the old address stays on the list while it redirects. **Existing home-screen installs** from the old address keep the name "Hold" and the old icon, and open the redirect outside their scope: remove them and add the app again from ascend-dk (on the phone check). Review logs below are history and still say "Hold"._

## Stack

- Next.js 16.4 (App Router, Cache Components and Partial Prefetching on, as generated), React 19.3, TypeScript, Tailwind CSS 4.3
- Supabase (Postgres + auth), the **existing Staple project**: same users, same email template, same demo account. New tables only: `habits`, `habit_checkins`.
- Vercel for hosting
- Vitest for unit tests; **PGlite** (real Postgres compiled to WASM) to run the migration and test RLS and SQL functions locally; Playwright for end-to-end tests and the design-critic screenshots

## Decisions

Decisions made while building, and why. Newest at the bottom of each group.

**Data and time**
- **Check-ins are calendar days (`date`), not timestamps.** A habit is done *on a day*, in the user's timezone. Storing a timestamp and converting later is how 23:30 in Toronto becomes tomorrow in UTC.
- **"Today" comes from a `tz` cookie** (the browser's IANA timezone, set on every visit), the same approach Staple already uses in production. No timezone column to keep in sync. If the cookie is missing (first visit), the server uses UTC and the page refreshes once the cookie is set.
- **The client sends the day it is showing; the server checks it strictly.** When you complete or undo a habit, the request names the day on screen. The server accepts it if it is your today, or yesterday **during the first 10 minutes after your midnight** (so a hold that starts at 23:59:59 still counts for the day you were looking at). Never tomorrow. Anything else answers "it's a new day" and the screen reloads on today. _(Revised after logic-checker: the first draft accepted ±1 day, which let a phone app resumed in the morning silently write yesterday.)_
- **The screen can't sit on a stale day.** Today reloads when the app comes back to the foreground or the local date changes, and every query on one render uses the same `today`, so the streak, dots and check-in day always agree.
- **Setting a check-in is idempotent, not a toggle.** The action is `setCheckin(habitId, day, done)`: done inserts (ignoring a duplicate), not done deletes. A double tap or a retried request can't flip the state the wrong way.
- **Streaks are derived, never stored.** A stored streak drifts the first time an undo, a delete or a bug touches history. The current streak is computed from check-ins by a SQL function (`habit_streaks`), so it's always one query, whatever the history length (Supabase's API returns at most 1,000 rows, so fetching all check-ins to count in JavaScript would silently break for long streaks).
- **One migration file holds the whole v1 schema**, including the reorder function used by a later feature, so it only has to be applied to the shared Supabase project once.
- **Migrations are tested locally in PGlite.** The Supabase project is shared with Staple's production data, so I can't experiment there. PGlite runs the real migration against real Postgres in-process, with a small stand-in for Supabase's `auth` schema, so RLS ("own rows only") and the streak function have actual tests.

**Auth and demo**
- **Same login as Staple**: email code (`signInWithOtp` + `verifyOtp`), with the email's button as a backup (`/auth/confirm`). The code matters most: a home-screen app on iPhone has its own cookie jar, and email links open in Safari.
- **Demo = server-side password sign-in** with `DEMO_EMAIL` / `DEMO_PASSWORD` (never `NEXT_PUBLIC_`, imported only from `server-only` files). Seeding runs **as the demo user** through the normal client, so RLS limits it to the demo's own rows. No service-role key anywhere.
- **The demo account is shared with Staple**, so the app's seed only ever touches `habits` / `habit_checkins`, and its "last seeded" markers in user metadata are namespaced (`hold_demo_seeded_at`, `hold_demo_seeded_day`) so they can't collide with Staple's `demo_seeded_at`.

## Design direction

**Tactile and warm.** Every habit is a chunky key you press. Where Staple is calm white paper with a matcha accent and Figtree, Ascend is warm bone paper and soft graphite with one **persimmon** accent, set in **Bricolage Grotesque**. It should feel physical: things have weight, press down, and spring back.

**References:** the physical feel of a mechanical keyboard key; Things 3's restraint (one accent, lots of air); the bold type of Arc / Teenage Engineering product pages.

**Colour roles** (light / dark). Hex is the source of truth; tests check contrast.

| Role | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F4EFE6` bone | `#191613` warm graphite | page |
| `surface` | `#FFFDF9` | `#26221E` | habit rows, sheets, inputs |
| `surface-sunk` | `#EAE3D6` | `#120F0D` | the key's "lip" (bottom edge), pressed state, empty dots |
| `ink` | `#2A211A` | `#F3ECE2` | text |
| `ink-muted` | `#6B5E52` | `#B4A797` | labels, dates, streak captions |
| `line` | `#E0D8CA` | `#3A342E` | hairlines, row borders |
| `accent` | `#B8420E` persimmon | `#FF8F57` | done rows, done dots, primary buttons, focus ring |
| `on-accent` | `#FFFFFF` | `#1E120A` | text and icons on accent |
| `accent-tint` | `#E9B79A` | `#7A4228` | the hold fill while pressing: 1.8 / 2.0:1 against the key (was `#F6D9C8` / `#5A3220`, 1.3 / 1.4:1, until 2026-11-24). Text on it is `ink`: a held key's grey streak caption turns ink. **At its ceiling**: darker fails the accent dots on it (light) and crowds `accent-key` (dark); both ends are tested |
| `accent-lip` | `#8A300A` | `#A84F24` | the bottom edge of a persimmon key: darker than the key in **both** themes (a lip, never a highlight) |
| `accent-key` | `#B8420E` | `#D9733F` | a **done habit key**: the accent in light; calmer in dark, so five full-width done keys don't glare at night (dots, rings and buttons keep `accent`) |
| `accent-soft` | `#CD7A55` | `#AD5A2E` | History: a day with **some** habits done (a day with all done is `accent-key`). Softer than the key but still 3:1 on the card (3.2 light, 3.2 dark) |
| `danger` | `#A1173A` crimson | `#FF8FA8` | errors and delete: crimson, so it never reads as persimmon; always with an icon (alert, or trash for delete) |
| `danger-lip` | `#6E0F28` | `#B24A63` | the bottom edge of a Delete button (a key like every filled button) |

All text pairs must pass 4.5:1 (`ink-muted` on `background` and `surface`, `on-accent` on `accent`, `ink` on `accent-tint`); dots, borders and focus rings 3:1 against what they sit on. Dark mode is warm, not pure black, and shows depth by lightness (background < surface), never by shadows. The accent gets lighter in dark mode, so it doesn't glare at night.

**Type**: Bricolage Grotesque for everything (variable; its optical sizes keep small text calm).
- Display 52 px / 800: the "Ascend" wordmark on the login screen only (`text-display`)
- Lead 18 px / 400: the one-line promise under the wordmark (`text-lead`)
- Page title 34 px / 700, tight leading ("Today")
- Habit name 22 px / 600 on Today's keys; 18 px / 600 in the `/habits` list (`text-list`)
- Body and buttons 16 px / 500–600 (16 px stops iOS zooming into inputs)
- Labels and captions 14 px / 500, `ink-muted`
- Numbers are `tabular-nums`.

**Space and shape**
- 4 px grid. Page gutter 20 px. Gap between habit rows 12 px. Row padding 20 px. Header-to-list gap 28 px.
- Habit rows are at least 96 px tall, full width, radius 24 px. Each row is a key: `surface` with a 4 px `surface-sunk` outer lip along the bottom edge (`accent-lip` once done). Pressed, it moves down 2 px and the lip shrinks to 2 px.
- Buttons are pills (fully rounded), 48 px tall (`md`) or 44 px for compact header pills (`sm`), never stretched to full width unless they're the main action (`block`); at least 44×44 px for every tap target. Primary and secondary buttons sit on a 3 px **outer** lip (`accent-lip` / `surface-sunk`); pressed, the face moves down 2 px and the lip becomes 1 px, so the bottom edge stays put and the key sinks.
- Text boxes: 16 px corners (`--radius-field`), a 1 px `ink-muted` edge (3:1 to be findable).
- Icons: simple 2 px stroke line icons drawn inline (check, plus, grip, arrows, trash, pencil). No emoji.

**Motion**: purposeful and physical.
- **Hold (signature)**: on press, an `accent-tint` circle grows out from the exact touch point until it covers the row, over 650 ms, linear so progress reads as honest. Let go early and it shrinks back in 150 ms.
- **Done pop**: the row **snaps** to `accent-key` with `on-accent` text (no colour fade into done), scales 1 → 1.03 → 1 (about 250 ms), the check draws in, and the streak number updates. One short vibration where the device supports it.
- **Undo**: the colour fades back to `surface` in 200 ms and the streak ticks down. No scale.
- UI feedback 150–250 ms. Nothing loops, nothing moves on its own.
- **Reduce Motion**: no growing circle, no scale. The hold shows as the row's tint fading in over the same 650 ms (opacity only, from about a third so the press shows at once), and done or undone changes colour instantly.

**Brand mark** (since 2026-11-24): the **Summit** icon, a bone (`background`, light) mountain with a trail cut up its face on a persimmon (`accent`, light) field. Its sharp corners are the one deliberate exception to the rounded, key-like UI: don't round the mark, and don't copy sharp corners into screens. Only the tab icon's field square is rounded. The geometry lives in `lib/app-identity.ts` (`SUMMIT`) and is pinned by a test next to `ICON_VERSION`.

**Copy**: short, warm, never guilt-tripping. "Hold to complete", "3-day streak", "Start today".

**Never**: purple gradients, glassmorphism, emoji as icons, card-on-card nesting, grey-on-grey text.

## Workflow (every feature)

1. **Plan**: write the feature's section under "Features" below.
2. **logic-checker** (`.claude/agents/logic-checker.md`) reviews the plan: edge cases, wrong assumptions, simpler approaches. Revise the plan.
3. **Build** the feature, with tests.
4. In parallel:
   - **code-reviewer** (`.claude/agents/code-reviewer.md`) reviews the diff: bugs, security (RLS, server actions, secrets), accessibility, missing tests.
   - **design-critic** (`.claude/agents/design-critic.md`) reviews Playwright screenshots at iPhone size (390×844 @3x), light and dark. _Only for features that add or change a screen._
5. **Fix what's real**: triage each finding as fixed, deferred (with reason) or rejected (with reason).
6. **Commit**, then log everything under "Reviews".

All three agents are read-only (Read, Grep, Glob). They report; they never edit.

## Features

Order: 1 data model → 2 login and demo → 3 Today → 4 manage habits → 5 install (PWA) → 6 deploy and docs → 7 History (after v1; it brings in the longest-streak stat that v1 left out). Login comes before Today because Today needs a signed-in user; the demo account is also how Playwright reaches Today.

### Feature 1: Data model and migration

**Goal**: the tables, rules and functions everything else stands on, tested before any screen exists.

**Migration** `supabase/migrations/20261123120000_habits.sql`, applied once by pasting into the Supabase SQL editor (Staple's migrations are applied the same way; the shared project has no CLI migration history).

`habits`
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null default auth.uid() references auth.users on delete cascade`
- `name text not null`, check: 1–60 characters (code points, `char_length`) and no leading/trailing whitespace (`name !~ '^\s|\s$'`). The app is stricter: it collapses every run of Unicode whitespace to one space and trims, then counts code points (`[...name].length`), so anything the app sends passes.
- `position bigint generated by default as identity`: each new habit gets a larger number than any before it, so **new habits go to the bottom**, even after a reorder (which rewrites positions to 0…n−1). No trigger, and no sequence grant needed. Order is `position, created_at, id`, so ties can't shuffle.
- `created_at timestamptz not null default now()`
- `unique (id, user_id)`, so check-ins can reference the pair (below)
- index `(user_id, position)`

`habit_checkins`
- `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `habit_id uuid not null`
- `day date not null`, check `day >= '2000-01-01'`
- `created_at timestamptz not null default now()`
- `primary key (user_id, habit_id, day)`: one check-in per habit per day. `user_id` comes first, so a conflict can only ever be with **your own** row. With `(habit_id, day)` an insert on someone else's habit could tell "they checked in that day" (conflict) from "they didn't" (foreign-key error).
- `foreign key (habit_id, user_id) references habits (id, user_id) on delete cascade`: a check-in's owner must be the habit's owner, and deleting a habit deletes its history
- index `(user_id, day)` for "last 7 days"

**Row-level security and grants**: RLS enabled on both tables. Policies `to authenticated`, all `(select auth.uid()) = user_id`, with `with check` on insert and update. Grants are written **revoke-then-grant**, because Supabase's default privileges give `anon` and `authenticated` ALL on new tables (including TRUNCATE, which RLS doesn't cover), and Postgres gives every new function EXECUTE to PUBLIC:
- `revoke all` on both tables from `anon`, `authenticated`; on both functions from `public`, `anon`, `authenticated`.
- `habits`: `select, insert, delete` and `update (name, position)` only, so `id`, `user_id` and `created_at` can't be rewritten.
- `habit_checkins`: `select, insert, delete`. No update: you add or remove a day, never change one.
- `execute` on both functions to `authenticated`.

**Limits** (added after code review): anyone logged in, including demo visitors, can call Supabase directly with their token and skip the app. The project's storage is shared with Staple, so the database itself bounds what one user can write:
- At most **100 habits** per user, enforced by a `before insert` trigger. It has to be a trigger: a count inside a policy can't see the other rows of the same bulk insert.
- New check-ins only for days from **60 days ago to tomorrow (UTC)**, enforced in the insert policy. That covers today everywhere up to UTC+14 and the demo's sample history. It's a policy, not a check constraint, because it depends on `now()`. Rows already saved aren't affected, so streaks keep growing past 60 days. _(Widened to 100 days by Feature 7, for the demo's 90-day history.)_
- The migration is one transaction (`begin … commit`), so a failure leaves nothing half-made.

**Functions** (`security invoker` so RLS applies, `set search_path = ''` with fully qualified names):
- `habit_streaks(p_today date) returns table (habit_id uuid, current_streak int)` (`language sql`): gaps-and-islands over your check-ins on or before `p_today`. It returns the run that ends **today or yesterday**, so a streak stays alive until the day is over. Habits with no live run aren't returned, which means 0. The page passes the same `today` it renders.
- `reorder_habits(p_ids uuid[]) returns int` (`plpgsql`, because it raises errors and counts rows): sets `position` to each id's index in one statement. The list must be **exactly your habits, each once**: duplicate or null ids raise `22023`, and a stale or partial list raises `HR001` and rolls the whole thing back, so the action can reload instead of saving an order nobody saw. Used by Feature 4.
- `habits_enforce_limit()`: the trigger function above. Nobody but the owner can execute it.
- The identity sequence behind `position` has all privileges revoked too. Inserts don't need them, and `setval` would break every insert.

**Streak rules** (one definition everywhere):
- The current streak = the number of consecutive days with a check-in, ending today if today is done, otherwise ending yesterday.
- Today not done yet does not break anything; missing yesterday *and* today means 0.
- Complete today: +1. Undo today: −1. So the screen can update instantly without the history, and the server's number confirms it.

**Pure TypeScript** (`lib/`, unit tested):
- `dates.ts`: `isValidDay`, `isValidTimeZone`, `todayIn(tz, now)`, `minutesIntoDay(tz, now)`, `addDays`, `daysBetween`, `lastDays(today, n)`. Day maths runs on UTC dates so DST can't create a 23- or 25-hour "day".
- `checkin-day.ts`: `checkinDayStatus(day, tz, now)` gives `ok`, `stale` (a valid day that isn't accepted any more, so the screen should reload) or `invalid`. This is the one rule from Decisions: today, or yesterday in the first 10 minutes after local midnight.
- `streaks.ts`: `currentStreak(days, today)` (the reference for the SQL function: the PGlite test checks both agree on random histories), and `weekDots(checkedDays, today, createdDay)`, which gives 7 days ending today. Each day is:
  - `done`, which always wins, even before the created day;
  - `open`: today, not done yet. Not a miss, and announced as "today, not done yet";
  - `missed`;
  - `before`: before the habit existed, so it isn't shown as a miss.
  `createdDay` is `todayIn(tz, created_at)`: the day it was created **in your timezone**, never a sliced UTC string. The demo seed back-dates `created_at` so its history isn't shown as "before".
- `habit-name.ts`: `normalizeHabitName` (collapse Unicode whitespace, trim) and `validateHabitName` (1–60 code points), with messages.

**Tests**
- Vitest: every function above, including month and year ends, leap days, the DST weekends for America/Toronto, timezones at UTC+14 and UTC−11 around midnight, the 10-minute grace edges (00:09:59 accepted, 00:10:00 stale), tomorrow refused, and invalid input.
- PGlite, with a stand-in for Supabase: the `anon` / `authenticated` roles, `auth.users`, `auth.uid()` reading the JWT claim, and **Supabase's default privileges reproduced**, so the revokes are actually tested. Every RLS test runs as `set role authenticated` with a user's claim, never as the superuser or table owner (both bypass RLS). Cases:
  - The migration applies cleanly.
  - User A can't select, insert, update or delete user B's habits or check-ins.
  - You can't check in on someone else's habit, even with its id; with your own `user_id` on their habit, the error is the same whether or not they checked in that day.
  - A duplicate day conflicts.
  - Deleting a habit removes its check-ins.
  - `anon` can't read or write anything.
  - `authenticated` can't update a check-in, truncate either table, or change a habit's `id`, `user_id` or `created_at`.
  - New habits get increasing positions, including after a reorder.
  - The name check agrees with `normalizeHabitName` and `validateHabitName` on tricky strings (tabs, non-breaking spaces, emoji, 60 and 61 code points).
  - `habit_streaks` matches `currentStreak` on hundreds of random histories, including today not done, a gap yesterday, and future-dated rows ignored.
  - `reorder_habits` only moves your own rows, rejects duplicates and returns the count it moved.

**Not in this feature**: any screen.

### Feature 2: Login, demo and app shell

**Goal**: you can get in (email code, or "Try the demo"), everything else needs a login, and the design system exists (fonts, colour tokens, contrast tests), so the login page is the first real screen.

**Pieces**
- `lib/supabase/server.ts`: a Supabase client per request, reading and writing the auth cookies (`@supabase/ssr`), as in Staple.
- `proxy.ts` (Next 16's name for middleware): refreshes the session cookie on every request. Not logged in → `/login`; logged in on `/login` → `/`. Public: `/login`, `/auth/*`, and static files (`_next`, icons, manifest), so they never get the login page. Uses `getClaims()`, which verifies the token's signature, never `getSession()`.
- `lib/auth-actions.ts` (server actions):
  - `sendLoginCode(email)`: `signInWithOtp` with `emailRedirectTo = <origin>/auth/confirm`. Supabase only honours a redirect that's on its allowlist, so a spoofed Origin header can't send the link elsewhere.
  - `verifyLoginCode(email, code)`: `verifyOtp` with `type: "email"`. The code is 6 to 10 digits (a Supabase setting), so the app accepts any of those and strips spaces and dashes.
  - `signOut()`: `scope: "local"`, so only this device logs out.
  - Errors map to plain messages: too many tries (429), Supabase down (no status / 5xx: "couldn't check", not "wrong code"), and wrong or expired code. The real reason is logged on the server.
  - The demo's email is refused here ("That's the demo. Tap Try the demo."), because nobody can read its inbox.
- `app/auth/confirm/route.ts`: the email's button lands here with `token_hash`; `verifyOtp` works in any browser. It falls back to `/login?error=link`.
- **Demo** (`lib/demo.ts` server-only, `lib/demo-actions.ts`, pure `lib/demo-seed.ts`):
  - `signInDemo()` signs in with `DEMO_EMAIL` / `DEMO_PASSWORD` from the server environment. The browser only ever asks for "the demo".
  - It then reseeds if needed: never seeded, seeded over an hour ago, seeded for a different "today", or a seed time in the future. The metadata comes fresh from `signInWithPassword`'s user, not from the login token.
  - **The seed is one SQL function, `reseed_demo_habits(p_habits jsonb)`**, added to the (not yet applied) migration. _(Revised after logic-checker: the first plan had six separate requests, which could half-fail and, with two sign-ins at once, leave 10 habits.)_
    - It takes a per-user advisory lock (`pg_advisory_xact_lock`), deletes the caller's habits (check-ins cascade), and inserts each sample habit and its check-ins, all in one transaction. A failure leaves the old data, and two seeds at once run one after the other and end in the same 5 habits.
    - It's `security invoker`, so RLS, the 100-habit trigger and the check-in date window all apply: whoever calls it can only ever replace **their own** habits.
    - The app calls it only after `isDemoEmail(user.email)` passes, checked inside `seedDemo` itself (Staple's guard), so a bug can never wipe a real account.
    - Habits are inserted one by one in list order, so positions come from the identity counter in that order, and "new habits land at the bottom" still holds. **Positions are never inserted explicitly**: an explicit 0…4 takes no numbers from the counter, so the next new habit could land in the middle.
  - Markers are namespaced in user metadata: `hold_demo_seeded_at` is the **time the seed finished** (server clock, never a habit's back-dated `created_at`, which would make every sign-in reseed), and `hold_demo_seeded_day` is the visitor's today it was seeded for. Staple uses `demo_seeded_*`. They're cleared before the seed and written after it, so a failed seed is retried at the next sign-in.
  - The seed touches **only** `habits` and `habit_checkins`; Staple's seed touches only its own tables.
  - **"Reset demo"**: a small button next to Log out, only for the demo account, which reseeds now. It's the fix for anything a previous visitor left behind.
  - Sample history is written as data (`createdDaysAgo` and `checkinDaysAgo[]` per habit), with a test that every dot state and each intended streak appears:
    - Drink water: created 30 days ago, done the last 12 days including today → streak 12.
    - Read 10 pages: created 30 days ago, done days 1–4 ago, not today → streak 4, today `open`.
    - Stretch: created 30 days ago, done 2, 3, 5 and 6 days ago, missed yesterday → streak 0.
    - Walk outside: created 30 days ago, done today and yesterday → streak 2.
    - No phone in bed: created 2 days ago, done yesterday → streak 1, and the older dots are `before`.
  - `created_at` is **local noon** on the intended day in the visitor's timezone (`instantOnDay(day, tz)`). Noon exists every day in every zone (midnight doesn't where DST starts at 00:00, as in Havana and Santiago), and it survives viewers up to ±11 hours away. Tested so `todayIn(tz, instantOnDay(d, tz)) === d` for every day of a year across many zones.
  - Known limits, in plain words:
    - Visitors in the demo at the same time share it, and a reseed (an hour later, or by a visitor whose "today" is a different date) replaces what an earlier visitor did. Visitors in Toronto and Tokyo alternating will keep resetting each other.
    - After a reseed, a screen still open on the old habits refers to ids that no longer exist. **Feature 3 must treat "habit not found" as "reload"**, like a stale day.
    - A visitor whose today is a day ahead of the seed's (Tokyo vs Toronto) sees check-ins dated "tomorrow", which are correctly ignored, so streaks look one lower until the next reseed.
    - "Try the demo" pressed before the page has loaded its JavaScript (no `tz` cookie yet) seeds in UTC.
    - Supabase saves user metadata as one whole value. If this app and Staple write their markers in the same few milliseconds, one could undo the other's write. Staple's next demo sign-in would then reseed. Rare, and it heals itself.
    - Every demo sign-in comes from Vercel's IPs, so Supabase's rate limit can say "Lots of people just tried the demo". That limit is shared with Staple's demo.
    - A demo visitor holds a real session for the shared account, so someone determined could call Supabase directly and change its password, breaking the demo in both apps until it's reset in the dashboard. (Inherited from Staple.) A real block needs a trigger on Supabase's `auth.users`, which changes the shared project's auth schema: offered to you, not done.
    - The email's link logs in whoever it belongs to (true of every token-hash link), so an attacker could log someone into the attacker's account. Mitigation: Today shows the signed-in email (Feature 3).
- `lib/server-helpers.ts`: `requireUser()` (verified claims, for every action), `userTimeZone()` (the `tz` cookie) and `userToday()`. These `await io()` before reading the clock, because with Partial Prefetching a per-session App Shell is prerendered and refuses `new Date()` (Staple hit this). The rule everywhere: cookies and `searchParams` go inside `<Suspense>`, and `await io()` comes before any clock read in render.
- **Login cookie name**: the app's Supabase clients use their own cookie name (`hold-auth`, kept through the rename to Ascend). Staple and this app share a Supabase project, so they'd otherwise share the `sb-<ref>-auth-token` cookie on `localhost` (cookies ignore the port), and logging out of one would log out the other during development.
- `components/timezone-sync.tsx`: sets the `tz` cookie from the browser and refreshes once if it changed (Staple's approach).
- **Design system**:
  - `app/globals.css` holds the colour tokens from Design direction as CSS variables, light and dark via `prefers-color-scheme`, mapped to Tailwind colours (`bg-surface`, `text-ink-muted`...).
  - Bricolage Grotesque via `next/font/google`.
  - `lib/palette.ts` holds the same hex values, and `lib/palette.test.ts` checks every text pair is at least 4.5:1 and every non-text pair at least 3:1, plus that `globals.css` matches `palette.ts`, so the design-critic's contrast estimates have a measured backstop.
- **Login page** (`/login`):
  - The wordmark ("Hold" then, "Ascend" since 2026-11-24), a one-line promise, and an email field with "Email me a code" (primary pill).
  - Then the code step: a numeric one-time-code field, "Log in", and "Start over".
  - Under a thin "or", "Try the demo" (secondary), with "A shared account with sample habits. No email needed."
  - Every control at least 48 px tall, errors in a live region tied to their field, and focus moves to the code field when it appears.
- **"/" for now**: a minimal signed-in page ("Today" title, a "Demo account" chip when it's the demo, Log out), replaced by Feature 3.
- With Cache Components on, anything reading cookies or `searchParams` sits inside `<Suspense>` (the docs call a top-level cookie read a build error).

**Playwright**: installed in this feature.
- `playwright.config.ts` uses an iPhone viewport of 390×844 at 3× with touch. It runs against the dev server, or `BASE_URL`.
- `e2e/screens.e2e.ts` saves screenshots in light and dark to `docs/screenshots/feature-N/`. They're committed, so the Reviews log can point at them.
- `e2e/login.e2e.ts`: the page renders; "Try the demo" lands on `/` with the demo chip; Log out returns to `/login`; a signed-out visit to `/` redirects to `/login`.
- The e2e tests use the real shared demo account, so they run **one at a time** (`workers: 1`). Two demo sign-ins at once would reset each other, and would use up the sign-in rate limit Staple's demo also depends on.

**Tests (Vitest)**:
- Login code cleaning and `isDemoEmail`.
- `needsReseed`, including right after a seed (must be false).
- Demo seed data: counts, every state represented, the intended streaks.
- `instantOnDay` for every day of a year in many zones, including Havana, Santiago, Kiritimati (+14) and Pago Pago (−11).
- `seedDemo` refuses a non-demo user.
- The proxy matcher: static files and the `/icons/…` PNGs Feature 5 will serve are skipped, pages are not.
- Palette contrast.
- PGlite: `reseed_demo_habits` replaces only your own habits; two calls in a row leave exactly one set; check-ins outside the date window and an invalid payload roll everything back.

**Icons (decided now for the matcher)**: Feature 5 serves the home-screen icons as PNGs from a route under `/icons/`, never from `app/icon.tsx` (which serves an extensionless `/icon` that would get the login page when a phone fetches it without cookies).

**What you'll need to do** (collected for the one stop):
- Add the app's **exact** addresses to Supabase → Authentication → URL Configuration → Redirect URLs: `http://localhost:3000/auth/confirm` and `https://<production domain>/auth/confirm`. **Never a wildcard on a domain you don't own** (like `ascend-*.vercel.app`): anyone can register a matching Vercel project and receive a victim's login link, which would take over accounts in the whole shared project, Staple's included. _(Corrected after code review.)_ Previews log in with the code, which works whatever the redirect. Until this is added, the email's button opens **Staple**.
- The shared email template says "Your Staple login code". Changing it to neutral wording would change Staple's email too, so I'm leaving that decision to you.

### Feature 3: Today, with press-and-hold

**Goal**: the main screen. Every habit is a big key: press and hold to complete it, tap a done one to undo, see its streak and the last 7 days.

**Layout (390 px phone)**
- Top bar: the date as a small label ("Monday, November 23"), a "Demo account" chip when it's the demo, and an "Edit" pill on the right that goes to `/habits` (Feature 4).
- The title "Today" (34/700). Under it, one line: "Press and hold a habit to complete it." until something is done today, then "2 of 5 done", and "All done for today" at 5 of 5.
- The list of habit keys, 12 px apart.
- At the bottom, quiet links: "Log out", and "Reset demo" for the demo account. They're rarely used, so they stay out of the top bar.
- Empty: no habits, so a short line and a primary "Add your first habit" that links to `/habits`. (Until Feature 4 lands, that link 404s. Features 3 and 4 ship back to back.)
- Loading: three key-shaped skeletons. Error: `app/error.tsx` with "Couldn't load your habits" and Try again.

**A habit key** (at least 96 px tall, full width; Design direction updated to match)
- Line 1: the name (22/600, wraps to two lines, never truncated mid-word). On the right, a 32 px check circle: an empty ring while not done; filled with the check drawn in when done.
- Line 2: the 7 dots (10 px, oldest left, today right) and the streak on the right ("12-day streak", "Start today" at 0).
- Dots: `done` filled; `missed` a 1.5 px ring in `ink-muted`; `open` (today, not done) a 2 px ring in `accent`, so today stands out; `before` a 4 px faint dot. On a done (persimmon) key, dots and text use `on-accent`.
- Not done: `surface` with the 4 px `surface-sunk` lip. Done: `accent` with `on-accent` text.

**The gesture**: one pure state machine, `lib/hold.ts` (`next(state, event) → { state, effects }`), tested sequence by sequence. The component (`components/habit-key.tsx`) only feeds it events and draws. _(Revised after logic-checker: the first plan spread the rules across event handlers, which is where the keyboard and click bugs it found came from.)_
- **Hold to complete.** A `pointerdown` with `button === 0` starts a hold. The component captures the pointer (`setPointerCapture`), so a drag off the key still reports back. A fill (`accent-tint`) grows from the touch point until it covers the key, over 650 ms (linear).
  - The hold **cancels** on:
    - the pointer moving more than 10 px (you're scrolling: the key has `touch-action: pan-y`);
    - `pointerup` before 650 ms, `pointercancel` or `lostpointercapture`;
    - `blur`, the page going hidden, or `pagehide`.
  - Cancelling shrinks the fill back in 150 ms.
  - When the fill's animation finishes, the machine completes **only if the same pointer (or key) is still down**. A finish that arrives after any cancel is ignored.
- **Pop** on completion: the key turns `accent`, scales 1 → 1.03 → 1 (250 ms), the check draws in, and the streak ticks up. Phones that support `navigator.vibrate` (Android) give one short buzz; iOS ignores it.
- **Undo is decided from the pointer sequence itself**: a short `pointerdown` → `pointerup` (no move beyond 10 px) on a key that was **already done when the press began**.
  - `click` events that follow any pointer sequence are ignored, so nothing depends on whether a platform fires a click after a long press (Android doesn't).
  - Every `pointerdown` clears the gesture's state, so a stale flag can never eat the next tap.
- **A quick tap on a not-done key** doesn't complete it. "Keep holding…" shows under the name for 1.5 s and is announced.
- **Keyboard** (Space or Enter):
  - `keydown` with `repeat` is ignored, and the default is prevented on both `keydown` and `keyup`, so the button never fires its own click.
  - A fresh `keydown` on a not-done key starts a hold. On a done key it undoes, on that `keydown`.
  - `keyup` before 650 ms cancels the hold. The `keyup` that ends a completed hold does nothing.
  - So holding Space completes once and stays done.
- **Assistive tech and a "Tap to complete" setting**: a `click` with no pointer or keyboard sequence in the last second (VoiceOver double-tap, Switch Control) completes or undoes at once.
  - The reviewer pointed out that iOS Voice Control and Switch Control may simulate real touches, which would make holding impossible. So there's also a guaranteed path: a **"Tap to complete"** switch in Today's footer, saved in a cookie so the server draws the right instruction.
  - With it on, a short tap completes and a tap on a done key undoes. The instruction reads "Tap to complete".
  - Real devices (VoiceOver, Voice Control, TalkBack) go on the phone-check list at the end.
- **Semantics**: `<button aria-pressed>` with `aria-label` = the habit name, and `aria-describedby` pointing at the streak, a text summary of the 7 days ("Last 7 days: 5 done, 1 missed, today not done yet") and the instruction. Changes are announced in one polite live region ("Read 10 pages done. 5-day streak.").
- **Reduce Motion**: no growing circle and no scale. The key's tint fades in over the same 650 ms (opacity only), and done or undone switches colour instantly. Holding is still required (the switch above exists for people who can't hold).
- iOS details: `-webkit-touch-callout: none`, `user-select: none`, and `contextmenu` prevented on keys, so a long press never opens the iOS or Android menu.

**Data** (server, `app/page.tsx` behind `<Suspense>`)
- `today = userToday()` and `tz = userTimeZone()`, read once and passed everywhere.
- In parallel:
  - the habits (`id, name, created_at`, ordered by `position, created_at, id`);
  - check-ins from `today − 6` to `today` (at most 700 rows for 100 habits, under Supabase's 1,000 limit);
  - `habit_streaks(today)`.
- Each habit becomes `{ id, name, doneToday, streak, dots }`, with `createdDay = todayIn(tz, created_at)`. That's a pure function (`lib/today.ts`), tested.
- The date label ("Monday, November 23") is formatted from the `YYYY-MM-DD` string with `timeZone: "UTC"`, so it's the same day on the server and in every browser. Formatting `new Date("2026-11-23")` locally would say Sunday in the Americas.
- The account bar shows the **signed-in email**, so a forged login link (Feature 2, code-review #9) is visible.

**Saving** (`lib/checkin-actions.ts`: `setCheckin(habitId, day, done)`), wrapped in `guarded`, so it **always returns a result and never throws**:
1. `requireUser()`, then validate `habitId` (a UUID) and `done` (a boolean).
2. `checkinDayStatus(day, tz)`: `invalid` → error; `stale` → `refresh()` and `{ ok: false, reason: "stale" }`. The new screen comes back in the same response.
3. If done: upsert with `ignoreDuplicates` (already done is fine). A foreign-key error → `refresh()` and `{ ok: false, reason: "gone" }`: the habit was deleted, or the demo was reseeded.
4. If undo: delete the row for that habit and day. 0 rows is fine (already undone or gone), and the refresh shows the truth. There's no extra "does it exist" query.
5. `refresh()`, then `{ ok: true, savedFor: day, newDay: day !== todayIn(tz) }`.

**On the screen**
- `useOptimistic` holds the done state per habit. The streak shown is `adjustStreak(serverStreak, serverDone, optimisticDone)`, and today's dot and the summary line ("2 of 5 done") follow the optimistic state.
- The client call is in `try/catch`: a lost connection or a "Server Action not found" after a deploy never reaches the error boundary. The optimistic change falls away, the live region says "Couldn't save. Check your connection and try again.", and one `router.refresh()` shows what the server really has (a save whose answer got lost may have worked).
- `stale`: "It's a new day, so Today was refreshed." `gone`: "That habit changed, so the list was refreshed." `newDay` (saved in the grace minutes for yesterday): "Saved for Monday. It's a new day now."
- Server actions from one page run one after another, and each save says done or not done (it isn't a toggle), so complete, undo, complete always ends complete.

**Day rollover** (`components/day-watcher.tsx`):
- It refreshes Today **every time the app comes back to the foreground** (`visibilitychange` or `focus`, debounced to once per 2 s), which also picks up changes from other devices and demo reseeds.
- It also refreshes when the **device's** date changes since its last check (every 30 s), never just because it differs from the server's. A phone with a wrong clock therefore can't loop.
- Before each refresh it writes the `tz` cookie again. The proxy also re-sets the cookie from the server on every request (Feature 2), so Safari's 7-day limit on script-set cookies can't empty it.
- It never refreshes in the middle of a hold.

**Tests**
- Vitest:
  - `lib/hold.ts` sequences:
    - hold complete; early release (hint); move cancel;
    - `lostpointercapture`, blur and hidden cancel; a finish after a cancel is ignored;
    - a right-button press is ignored;
    - tap to undo; a click after a pointer sequence is ignored; a click with no sequence completes;
    - Space with auto-repeat completes once and stays done; a keyup after completion does nothing; Enter on a done key undoes;
    - "Tap to complete" mode.
  - `lib/today.ts`: the view model, and the date label west of UTC.
  - `setCheckin` with a fake Supabase: stale (with refresh), invalid id, gone on a foreign-key error, undo of nothing, `newDay` in the grace minutes, and a thrown error becomes `{ ok: false }`.
- Playwright, after the migration:
  - hold a key for 700 ms: done, streak +1;
  - release at 300 ms: not done, hint shown;
  - move 30 px while holding: cancelled;
  - tap a done key: undone, streak −1;
  - reload: the state persisted;
  - keyboard Space held: done once;
  - "Tap to complete": a tap completes;
  - axe in light and dark.
  - `stale` is tested at the action level (it's the server's clock, so a faked browser clock can't produce it).
- Screenshots: Today in light and dark, mid-hold (the fill at about 50%), all done, and empty.

### Feature 4: Manage habits (add, rename, reorder, delete)

**Goal**: full CRUD for habits on one calm screen, `/habits`, reached from Today's "Edit" and from the empty state.

**Layout (390 px)**
- Header: the title "Habits" (34/700) and a "Done" pill on the right that goes back to Today. If a save is still running, Done says "Saving…" and goes back once it's finished, so Today never shows the old order.
- **Add** at the top: a "New habit" text box and an "Add" primary button.
  - Enter or Add submits. The box empties **only once the habit is saved**, so a failure keeps what you typed. Focus returns to the box either way, so you can add several in a row.
  - The new habit appears at the **bottom**, as on Today, and it's announced: "Added Meditate. 6 habits."
  - Add is busy while saving, so a double Enter can't create two.
  - Duplicate names are allowed: the app doesn't second-guess you.
- **The list**: one row per habit (`surface`, 16 px corners, at least 64 px tall), in Today's order. Each row has the name (it wraps) and an "Edit" button on the right (pencil icon, 44×44, labelled "Edit Read 10 pages").
- **The editor** opens inline under its row (one at a time), with focus in the name box. Escape means Cancel.
  - The name box with Save (primary) and Cancel. Saving is **not optimistic**: the editor stays open with "Saving…", so a failure keeps your text, and you see it.
  - An unchanged name (after normalising) closes it without a request. An empty name is an error next to the box.
  - On Save or Cancel, focus goes back to that row's Edit button. "Renamed to X." is announced.
  - "Move to top" and "Move to bottom" (secondary). With a long list, these are what make big moves quick.
  - "Delete habit" (danger text). It asks inline first: "Delete Read 10 pages? Its streak and history go too." with **Delete** (danger) and **Keep it**.
    - Keep it puts focus back on "Delete habit".
    - Delete isn't optimistic either ("Deleting…"). Afterwards, focus moves to the next row's Edit button, else the previous one, else the New habit box, and "Deleted X." is announced.
    - If the habit was already gone (0 rows deleted), the message is "The list changed, so it was refreshed."
- **Name rules**: the counter "54/60" appears under a name box past 50 characters. It counts `nameLength(normalizeHabitName(v))`, and there's no `maxLength`, which counts emoji as 2. Names go through `normalizeHabitName` and `validateHabitName` (Feature 1), the same rules as the database.
- Empty: "No habits yet. Add one above." Loading: row-shaped skeletons. At 100 habits, Add says "You can have up to 100 habits." (from the database's limit).
- **Leaving and coming back**: with Cache Components, Next keeps a hidden route alive (`<Activity>`), so an editor, a confirmation or Arrange mode would still be open on return. They reset when the route is hidden (a layout-effect cleanup, as `preserving-ui-state.md` shows); a half-typed new habit is kept.

**Reordering: an "Arrange" mode, not drag** _(revised after logic-checker)_
- An "Arrange" button above the list switches every row to show ↑ and ↓ buttons (44×44, labelled "Move Read 10 pages up"/"down"). Edit buttons hide while arranging, and a "Done arranging" button ends the mode.
- A tap moves the row one place at once. Other rows slide (a FLIP transform, 150 ms; instant with Reduce Motion).
- **Focus stays on the button you pressed**, restored by habit id after React moves the row. The ↑ on the first row and ↓ on the last stay in place but are `aria-disabled`, and pressing them says "Already first" or "Already last". Each move is announced: "Read 10 pages, position 2 of 5."
- On a keyboard, the same buttons work with Enter or Space; nothing new to learn.
- Saving: the order on screen is kept in local state (the full list of ids, never "a move"). It's saved as **one request 600 ms after the last tap**, and at once on "Done arranging" or Done.
  - If the list from the server changes while arranging (an add finishing, another device), ids no longer there are dropped and new ones are added at the end, so the saved list always matches the database's set.
  - Arrange is unavailable while an add is saving.
  - A stale list (`HR001`) → refresh, and "The list changed, so it was refreshed. Your order wasn't saved."
- Why not drag (for now): on iOS a drag handle has to block scrolling, so it needs edge auto-scroll to move a habit more than a screen away, plus careful handling of lost capture and mid-drag refreshes. Arrange plus Move to top/bottom works the same for touch, VoiceOver, Switch Control and keyboard. Drag can come later on top of the same saving code.
- The order maths is pure (`lib/reorder.ts`: `move(ids, from, to)`, `reconcile(localIds, serverIds)`) and tested.

**Saving** (`lib/habit-actions.ts`, server actions; each is wrapped so it **never throws**, checks the login, and validates its input):
- `createHabit(name)`: normalize and validate, then insert. The limit (`54000`) → "You can have up to 100 habits."
- `renameHabit(id, name)`: validate the id (UUID) and the name, then update `name` with `.select("id")`, so 0 rows can be detected → "gone".
- `deleteHabit(id)`: delete with `.select("id")` (check-ins cascade). 0 rows → "gone".
- `reorderHabits(ids)`: an array of at most 100 unique UUIDs, checked before the RPC. Then `reorder_habits(ids)`: `HR001` → "stale", `22023` → "invalid".
- Every action calls `refresh()`, which also clears the client cache, so Today refetches when you go back.
- On the client, a failure to reach the server at all (offline, "Server Action not found" after a deploy) is caught the way Today does it: a visible error line with the icon, an announcement, and `router.refresh()`.

**Fixed in Feature 3 because of this review**: a Today key removed mid-hold (deleted elsewhere, or a demo reset) never reported "not holding", so Today's day watcher stopped refreshing. `HabitKey` now reports it when it unmounts.

**Demo**: visitors can add, rename, reorder and delete freely. "Reset demo" and the hourly reseed put the samples back. Renames are visible to the next visitor for up to an hour; that's accepted for a shared demo.

**Tests**
- Vitest:
  - `lib/reorder.ts`: move to start, end and the same place; `reconcile` drops removed ids, appends new ones and keeps the local order.
  - `habit-actions` with a fake Supabase: invalid id, empty or too-long name, normalized before saving, the limit message, rename and delete of something gone, reorder input checks, a stale reorder, never throws.
- Playwright (demo account):
  - add two habits (the second at the bottom); a failed add keeps the text;
  - rename (focus returns to Edit);
  - Move to top;
  - Arrange: ↓ twice in a row keeps focus on the same button, and the order is saved once;
  - delete with confirm (focus moves to the next row), and Keep it;
  - reload: all of it persisted;
  - Today shows the same order;
  - leaving and coming back closes the editor;
  - axe in light and dark.
- Screenshots: the list, an open editor, the delete confirmation, Arrange mode, and empty.

### Feature 5: Installable (home screen)

**Goal**: "Add to Home Screen" on iPhone and "Install" on Android give Ascend its own icon and name, open full screen on Today, and match the status bar to the page.

- `app/manifest.ts`:
  - name "Ascend", short_name "Ascend", a description (it was "Hold" until 2026-11-24);
  - `id: "/"` (the app's identity stays the same even if `start_url` changes), `start_url: "/"`, `scope: "/"`, `display: "standalone"`;
  - **no orientation lock**: WCAG 1.3.4 says don't, and people with a phone mounted in landscape need it _(revised after logic-checker)_;
  - `background_color` and `theme_color` = light `background`, imported from `lib/palette.ts` (no new hex values);
  - icons 192, 512 and a maskable 512.
- Icons are drawn in code (`app/icons/[file]/route.tsx` with `ImageResponse`):
  - `icon-192.png` and `icon-512.png` (shape **rounded**), `icon-maskable-512.png` (**maskable**: full-bleed, the mark inside the safe circle) and `apple-touch-icon.png` (180, **full**: an opaque square, because iOS shows see-through corners as black). The shape is part of the icon list and tested.
  - Any other name gives 404 from the handler. `dynamicParams` is never exported, since it fails the build under Cache Components.
  - They're prerendered at build (`generateStaticParams`), and served under `/icons/`, which the proxy already skips (Feature 2): phones fetch icons without cookies, so a login redirect would give them the login page instead.
  - The drawing (**"Summit"**, since 2026-11-24; v1 was a bone "key" with a persimmon check): in a 0 0 100 100 box, a solid bone triangle (50,14 88,84 12,84) on the persimmon field, with a trail cut up its face in the field colour (27,84 39,84 61,46 55,36). Sharp corners, no rounding on the mark; only the tab icon's field square is rounded. Bone on persimmon is 4.8:1 (3:1 needed for a graphic; tested).
  - The maskable version scales the mark by 0.75 about the centre so every corner is inside Android's safe zone, a centred circle of radius 40% (the base corners are 38.2 from the centre; at full size they'd be 51). A unit test checks every point.
- `app/layout.tsx` metadata: `appleWebApp: { capable, title: APP_NAME ("Ascend"), statusBarStyle: "default" }`, the apple-touch icon, and the 192 icon as the tab icon. **The create-next-app `app/favicon.ico` is deleted**: file-based icons win over metadata, so the Next triangle would show in tabs.
- Icon URLs carry `?v=<ICON_VERSION>` (`?v=2` since the Summit). Next serves these PNGs as immutable for a year, so a redrawn icon needs a new URL to reach existing installs.
  - The status bar is solid, so content never sits under the clock or the Dynamic Island.
  - `themeColor` already follows light and dark.
- **No service worker, no offline mode** (out of v1). Neither phone needs one to install any more, which Staple's PWA work confirmed. Opening Ascend offline shows the browser's offline page.
- **Login on iPhone** _(corrected after logic-checker)_: since iOS 17.2, Safari's cookies are copied into the app once, when you add it, so adding while logged in opens logged in. The hard case is logging in *inside* the app: you ask for a code, switch to Gmail, and iOS may close the app. It reopens on the email step, so you retype the email and tap "I already have a code". Tapping the email's button instead logs Safari in, not the app, and uses up the code. Remembering the pending email across a relaunch is left for later; it's on the phone checklist.
- **Tests**:
  - Vitest: the icon list (every manifest icon has a route file name, and sizes match).
  - Playwright:
    - `/manifest.webmanifest` and every icon load **without a login** (200, `image/png`, the right pixel size);
    - `/icons/nope.png` gives 404 (not the login page);
    - the page links the manifest and the apple-touch icon, its only `rel=icon` is the 192 icon, and nothing links `/favicon.ico`;
    - axe still passes.
  - The build output lists `/icons/[file]` and `/manifest.webmanifest` as prerendered.
- No new screen, so no design-critic. The icon itself is checked by looking at the PNGs, and I'll show them in the final summary.

### Feature 6: Deploy, README and CLAUDE.md

Order matters _(revised after logic-checker)_:
1. The migration is applied to the shared project (a precondition for everything below).
2. Push to GitHub (the user creates the repo).
3. Create the Vercel project with **all 4 env vars on the import screen**. Vercel builds straight away, and a build without `NEXT_PUBLIC_SUPABASE_URL` breaks every page. If they're added later, redeploy.
4. Add the production `/auth/confirm` to Supabase's Redirect URLs (exact, no wildcard).
5. Against production, run a **smoke subset**, not the whole suite: the login redirect, Try the demo, one hold, and the manifest and icons without login (`e2e/smoke.e2e.ts`). Every demo sign-in from Vercel's IPs spends the per-IP limit Staple's live demo shares, and `screens.e2e.ts` would overwrite the committed screenshots.
6. **The phone check** (the user, once): add to home screen on iPhone (and Android if available). After the rename (2026-11-24), first remove any install made from habit-tracker-ifaf.vercel.app and add it again from https://ascend-dk.vercel.app. Check:
   - icon, name and the status bar in light and dark;
   - it opens on Today, even when added from `/habits`;
   - holding a key feels right, the pop and the vibration on Android, and Reduce Motion;
   - VoiceOver, plus Voice Control or Switch Control if possible: can you complete a habit? ("Tap to complete" is the fallback);
   - log out inside the app, then log in with the code, with an app switch to the email in between.
- `README.md`: what the app is, the live link, how to run it locally, env vars, how to apply the migration, tests, and the review workflow with a pointer to the Reviews log.
- `CLAUDE.md`: what the app is, the stack and its Next 16 particulars (Cache Components, `io()`, `refresh()`, `proxy.ts`), the data rules (calendar days, the derived streak, RLS, revoke-then-grant), the design tokens, the per-feature workflow with the three reviewers, and the commands.

### Feature 7: History

_(The request called this "Feature 6"; 6 was already deploy, so it's 7 here.)_

A **History** page with charts of what's been logged. It's reachable from Today and looks like the rest of the app.

**Where it lives**
- Route: `/history?range=7|30|90`. Anything else, or no value, means 30; a repeated `?range=` takes the first value. The range is in the URL so a reload and the screenshot script land on the same view. Switching uses `history.replaceState` (no new back-button entry per switch), so Back still goes to Today. _(Revised after logic-checker: switching by `<Link>` would show the skeleton for uncached per-user data and drop focus from the switch.)_
- Today's header gets a **History** pill next to **Edit** (both `secondary`, `sm`). Measured at 390 px, the longest date ("Wednesday, September 30", about 161 px) plus both pills (about 92 + 67 px) and the gaps fit in the 350 px row only without the **Demo** badge, so the badge moves to the title row, beside the `h1`, not inside it (the heading stays "Today"). `TodaySkeleton` gets the second pill. The row may also wrap (`flex-wrap`), so zoomed text never overflows.
- History's own header matches Habits: an `h1` "History" on the left and a **Done** pill on the right that goes back to Today.
- The page reuses `DayWatcher`, so it moves to the new day after midnight or when the app comes back to the foreground.

**The day rules (reused, not re-derived)**
- `today` comes from `userToday()` (the `tz` cookie). Each habit's created day is `todayIn(tz, created_at)`, exactly as on Today.
- Each habit's day states come from **`weekDots(days, today, createdDay, range)`**, the function that draws Today's 7 dots, with `n` set to the range. So a day is `done`, `open` (today, not done yet), `missed`, or `before` (the habit didn't exist yet) by the same rule everywhere.
- **Counted days** are `done` plus `missed`.
  - `before` doesn't count, because the habit didn't exist yet, so a habit added mid-range only counts from its created day.
  - Today: a habit **done** today counts (as done), one still **open** doesn't, because the day isn't over. So completing a habit raises the rate straight away, a morning visit isn't dragged down, and at midnight the habits still open become misses. _(Wording corrected after logic-checker: the first draft said today wasn't counted at all, which wasn't what the formula did.)_
- A habit's **completion %** is `done / counted`, and the page's **completion rate** is Σdone / Σcounted over all habits (habit-days).
- **Per-day bar:** `done` is the number of habits done that day, and `scheduled` is the number of habits that existed that day (any state but `before`). Today's bar therefore reads "3 of 5" with 2 still open.
  - The rate, the summary sentence and every habit's % all use the one counted rule above; only the bars and the day table show today live ("3 of 5").
  - A day before any habit existed reads "No habits yet", never "0 of 0".
- **Deleted habits** don't appear: the query reads only existing habits, and deleting a habit already deletes its check-ins.
- **Best streak now:** the highest current streak of any habit, from `habit_streaks(today)`, the same SQL that Today's streak text uses. It always matches Today.
- **Longest streak:** the longest run of back-to-back days of any habit **that reaches into the range**, counted in full, even if it started before the range.
  - Why in full: clipped to the range, the 7-day view could say "longest 7" next to "best now 45", which reads as a contradiction.
  - With this definition, longest ≥ best now in every range, because a current streak ends today or yesterday, inside the range. A wider range can show an older, longer run.
  - This reads "for the range" a little loosely, so it's flagged to the user as a decision: clipping to the range is a one-line change.
- **Check-ins dated after today** (saved further east, then viewed further west) are left out of days, counts and streaks: the SQL filters to `≤ p_today`.

**Data: one new SQL function, `habit_history(p_from date, p_today date)`**, called once per page load with the 90-day window (`p_from = today − 89`). 7 and 30 are sub-windows of it, so switching range needs no request. (`security invoker`, so RLS applies; `search_path = ''`).
- It returns one row per habit of the caller, in screen order (`position, created_at, id`), with these columns:
  - `habit_id`, `name`, `created_at`;
  - `days date[]`: the check-ins between `p_from` and `p_today`, and only those;
  - `lead_in int`: the length of the run that ends exactly on `p_from − 1`, so a longest streak that started before the window can be counted in full. It only counts if `p_from` itself is done (a run that stops the day before doesn't reach in): tested;
  - `current_streak int`: joined from `habit_streaks(p_today)`, not recomputed (`coalesce`d to 0).
- Every subquery filters `user_id = auth.uid()` as well as relying on RLS, so the `(user_id, day)` index is used. The window is capped at 366 days (`greatest(p_from, p_today − 365)`).
- **Why in SQL:**
  - PostgREST returns at most 1,000 rows. 100 habits × 90 days of single check-ins could reach 9,000, while one row per habit is at most 100.
  - The two streak numbers need days before the range. SQL looks at those days, but only the range's days ever leave the database.
- "Read check-ins for the range only": the page reads one bounded window, the largest range (90 days), never the whole history. The two streak numbers look further back inside SQL, as `habit_streaks` already does for Today.
- Pure TypeScript in `lib/history.ts` (tested):
  - `parseRange`;
  - `buildHistory(rows, today, timeZone, range)`, which returns the days with done/scheduled counts, the habit rows with their dots, %, counted and created day, the totals, best now, longest, and the empty state;
  - `longestRun(days, from, today, leadIn)`;
  - `percent(done, counted)`. It never shows 100% unless everything was done, or 0% when something was. With nothing counted it returns null and the page shows "—".
  - `dayReadout(day, today)`: "Today", "Yesterday", or "Mon, Nov 23".

**Migration** `supabase/migrations/20261123180000_history.sql` (new; the first one stays untouched), in one transaction:
1. `create function habit_history(...)`, revoked from PUBLIC/anon and granted to `authenticated`.
2. **Widen the check-in insert window from 60 to 100 days back.** `reseed_demo_habits` is `security invoker`, so the demo's 90 days of history must pass the insert policy. 90 local days can be 90 UTC days back (UTC is one day ahead of the Americas in the evening), so 60 is too few; 100 leaves room. The policy is dropped and recreated with the same rule otherwise. It still stops anyone filling years of dates.
- The PGlite helper runs **every** file in `supabase/migrations` in name order, so the tests always see the real schema.
- It's backward compatible: the code live now doesn't call the new function, and a wider window only allows more. So the user can apply it before the code is pushed, and must: the new demo seed needs it.

**The demo seed: about 90 days of believable history** (`lib/demo-seed.ts`)
- Each sample habit becomes a literal **history string**, oldest day on the left and today on the right (`x` done, `.` missed), one character per day from its created day. It's readable in review and has no random generator.
- The last two weeks keep every state the Today tests rely on: streaks of 12 (done today), 4 (not yet), 0, 2 (done today) and 1, and "2 of 5 done".
- Shape (the strings are relative to today, so there's no weekday pattern: it would land on a different weekday each day):
  - **Water** and **Walk**: 89 days old.
  - **Read**: 75 days old.
  - **Stretch**: 45 days old, so the 90-day view shows a habit added mid-range.
  - **No phone in bed**: 2 days old.
  - The early weeks are patchier than the recent ones, with runs and lapses, and Walk has an old 3-week run, so "longest" (90 days) beats "best now".
- Tests check:
  - the streaks, as before;
  - every day lies 0–89 days back and never before the habit's created day;
  - the overall rate is believable (between 60 and 85% over 90 days);
  - in the 90-day view, longest is greater than best now.

**Layout (top to bottom)**
1. **Header**: "History" and **Done**.
2. **Range switch**: a segmented control in a `surface-sunk` track with **7 days · 30 days · 90 days**.
   - The selected segment is a raised key (`surface` with a lip, like every key in the app) **with a 1 px `ink-muted` edge** and `ink` semibold text; the others lie flat in `ink-muted`. The edge is what passes 3:1, since surface on sunk is only 1.2:1. _(Added after logic-checker.)_
   - They're buttons with `aria-pressed`, each 44 px tall.
3. **Three numbers**, side by side on the background (no card-on-card), with big `tabular-nums` values and 14 px `ink-muted` labels: **75%** *completed* · **12** *best streak now* · **23** *longest streak*.
4. **Chart**, one bar per day with today on the right:
   - Above the bars, a readout line for the selected day ("Today · 3 of 5 done", or "Sat, Nov 14 · 4 of 5 done"). Today is selected to start.
   - **Bars** (`accent`) show how many habits were done. An **`ink-muted` step line** above them shows how many were scheduled, so a gap under the line is a miss. Both pass 3:1 against the page. The step only moves when a habit was added.
   - Day labels: the first date on the left and "Today" on the right; for 7 days, a weekday letter under each bar.
   - It's drawn as **one SVG** in day units (`viewBox = n × maxScheduled`, `preserveAspectRatio="none"`, the line with `vector-effect: non-scaling-stroke`), so it fills any width without measuring. The geometry is a pure function, so it's tested: a small top inset so the line at the top isn't clipped, no `rx` (it would stretch), and the scrub index clamped to the last day.
   - The chart and the habit rows sit on `surface` cards (one level, nothing nested), so the faint `before` dots stay visible.
5. **The summary sentence** under the chart, visible to everyone: "112 of 150 habit-days done in the last 30 days."
6. **Per habit**, one row each:
   - the name (`text-list`) and its % on the right;
   - "Added Oct 9" in `ink-muted` when the habit started after the range's first day, which explains its faint "before" dots;
   - a dot strip using Today's dot styles (done filled, missed ring, open accent ring, before faint).
     - The strip is one line of 7 or 30, or **three lines of 30** for 90 days, so the dots keep a readable size instead of a 3 px barcode.
     - The dot styles move from `habit-key.tsx` to a shared `components/dots.tsx` with a size prop; Today looks unchanged.
7. **Empty states**:
   - No habits: "No habits yet" with a link to add one.
   - Habits but nothing counted yet (all created today, nothing done): "Your history starts today. Hold a habit on Today and it shows up here."

**Interaction and accessibility**
- **Scrubbing:**
  - A pointer down or move anywhere on the chart selects the nearest day (index = ⌊x / width × n⌋), and so does a mouse hover. At 90 days a bar is about 3.7 px wide, too thin to tap one by one.
  - `touch-action: pan-y`, so a vertical swipe still scrolls the page.
- **Keyboard and VoiceOver:** a native `<input type="range">` labelled "Choose a day", with `aria-valuetext` such as "Monday, November 23: 3 of 5 done". It's laid over the chart's box (opacity 0, `pointer-events: none`), so VoiceOver finds it by touch and its frame is the chart. _(Revised after logic-checker: a 1 px `sr-only` box couldn't be found by touch.)_
  - It's native because iOS VoiceOver only adjusts native sliders (swipe up or down); custom ARIA sliders get no events there.
  - Arrow keys work by default. When it has focus, the chart shows the focus ring (`has-[:focus-visible]`).
- The readout line is **not** a live region: scrubbing would chatter, and the slider's value text already speaks.
- The selection goes back to today when you leave the page (`<Activity>` keeps it alive; reset in a `useLayoutEffect` cleanup).
- **Visually hidden table:** "Habits done each day", with columns Day, Done and Habits, one row per day. It holds the chart's numbers for screen readers. The SVG is `aria-hidden`.
- Each habit row has a screen-reader sentence: "Read 10 pages: 41 of 60 days done, 68%."
- **Motion:**
  - Bars grow from the baseline (`--motion-pop`, `--ease-out`, `motion-safe` only) **when you switch range**, never on first load ("nothing moves on its own").
  - The selection marker moves instantly.
  - With Reduce Motion nothing animates.
- **Contrast:** accent bars and dots, `ink-muted` rings and the line pass 3:1, and all text passes 4.5:1, in light and dark (`lib/palette.test.ts` already covers these pairs; axe checks the page).

**Tests**
- **Unit tests** (`lib/history.test.ts`):
  - ranges and their parsing;
  - counted days: open and before aren't counted, a habit added mid-range, and done before the created day still counts;
  - check-ins dated after today are excluded; a lead-in is ignored when the window's first day isn't done;
  - percent rounding at the edges;
  - longest with a lead-in, longest ≥ best now, and the empty states;
  - readout labels in UTC, DST weeks and the year end;
  - chart geometry.
- **PGlite** (`tests/db/history.db.test.ts`):
  - own habits only, in order;
  - days only inside the range;
  - `lead_in` correct;
  - `current_streak` equals `habit_streaks`;
  - a deleted habit is gone;
  - anon refused, no PUBLIC grant;
  - **300 random histories:** for ranges 7, 30 and 90, `longestRun` from the function's output equals a brute force over the full history;
  - the new window: 100 days back allowed, 101 refused (the reseed test's "too old" day moves from 61 to 101; CLAUDE.md and the Feature 1 note are updated).
- **e2e** (`e2e/history.e2e.ts`, signed-in):
  - Today → History;
  - the 30-day default with its seeded numbers;
  - switching to 7 and 90, URL included;
  - axe in light and dark on every range;
  - the keyboard slider moves the readout;
  - a hover over the first bar shows the start date;
  - the hidden table has one row per day;
  - the empty states, via a reseed with an empty list and with one habit created today. The demo is restored in `afterEach`, so a failed test can't leave the shared demo empty for visitors. _(Revised after logic-checker.)_
- **Screenshots** (`docs/screenshots/feature-7/`): History at 7, 30 and 90 days, mid-scrub, both empty states, and Today's new header. All in light and dark.

**Order:** plan → logic-checker → build with the unit and PGlite tests → code-reviewer → **stop: the user applies the migration** (e2e and screenshots need it on the real project, and so does the deployed demo seed) → e2e and screenshots → design-critic → fix → commit → push → the phone check.

**Design pass (after launch, at the user's request)**
1. **Bars:**
   - A day with every habit done is full persimmon (`accent-key`); a day with some done is a softer tint (`accent-soft`, a new token, 3:1 on the card in both themes and tested).
   - Their tops are rounded 2 px. The bars are now absolutely positioned boxes over the SVG, because a radius inside the stretched SVG would distort.
2. **The "Habits" step line is quieter:** dashed, 1.5 px, and drawn **under** the bars. A full day covers it instead of wearing it like a cap; the dashes stay `ink-muted` (3:1).
3. **"Best streak now" is renamed "Current streak".**
- The legend (All done · Some done · Habits) moves below the day labels; three items don't fit beside the title.

### Refinement pass: /impeccable audit and critique (2026-11-24)

The request: run the impeccable skill over the whole app as a **refinement, not a redesign** (keep the look, colours, fonts, identity and copy): write `DESIGN.md` from the current design, audit and critique every main screen at 390×844 in light and dark, fix the real findings, and skip any that conflict with a decision recorded here.

- `DESIGN.md` (and its machine-readable sidecar `.impeccable/design.json`) describes the system as built; this plan stays where decisions and their reasons live. It changes nothing.
- "Before" screenshots of every screen: `docs/screenshots/impeccable-before/`.

**Fixes** (all inside the existing tokens; no colour, font or copy changes):
1. **Text at 200%** (WCAG 1.4.4; Android's font size and Safari's text zoom both do this). Rows that couldn't wrap now wrap instead of running off the screen or clipping:
   - Today: a key's bottom row (dots, then the streak below them if they don't fit); a long name wraps inside its column, so the check disc keeps its place; the footer's Reset demo / Log out never break mid-label, line up with the gutter when they wrap, and the email wraps instead of being cut off (it's there so a forged login is noticed).
   - Habits and History headers wrap like Today's (the Done pill drops below the title); so does the "Same order as Today." / Arrange row.
   - The Habits editor's Save / Cancel, To top / To bottom and Delete / Keep it rows wrap.
   - **Buttons**: a label wraps inside its pill when text is very large, instead of spilling out (`max-w-full` on content-width pills; rows of pills wrap first, so nothing wraps at normal size).
   - History's three numbers are **three columns or one, never 2 + 1**: a container query switches at 18.75 rem (three ~92 px columns), so 360 px phones and up get three at normal text, and a 390 px phone gets one from about 115% text. Their size becomes a token, `text-stat` (28 px, the one size off the type scale). _(Revised after logic-checker: an auto-fit grid left "Longest streak" alone on a second row on 360 and 375 px phones.)_
   - History's range switch: fixed radii instead of `rounded-full` (full pills at normal size), so a two-line "30 / days" isn't cut by a circle.
   - The login wordmark is capped at 17vw (66 px on a 390 px phone), so the one word fits when text is enlarged; 52 px as before at normal size.
2. **The day's payoff**: at 5 of 5, "All done for today" is ink and semibold with a persimmon check before it, instead of looking like the muted instruction it replaces. The words don't change; nothing moves.
3. **Errors keep their colour when focused**: a field marked invalid gets a crimson focus ring instead of persimmon, so the error reads as an error (crimson vs persimmon was the point of the `danger` colour). The one exception to the persimmon ring.
4. **Delete confirmation**: **Keep it** comes first (left, where the thumb already is) and **Delete** second. While the question is open, the buttons above step back: Save turns secondary, and Save, Cancel and the moves are dimmed and `aria-disabled` (`save()` and moves return early too, so Enter in the name does nothing). The name field is read-only but **not** dimmed (its text must stay 4.5:1), and a dimmed button regains full strength while focused, so its ring stays 3:1. **Escape while asking means Keep it** (the question closes, a half-typed rename stays); otherwise it closes the editor as before. A failed delete shows its message under Delete / Keep it. _(Revised after logic-checker and code-reviewer.)_
5. Today's tab title is "Today · Ascend" like every other page (a page in the root segment doesn't get the layout's title template).
6. ESLint ignores `.claude/**` (the skill's own scripts were 93 warnings).
7. _(After the pass, the user's call)_ **A stronger hold fill**: `accent-tint` #E9B79A / #7A4228 (1.8 / 2.0:1 against the key, from 1.3 / 1.4), and a held key's grey streak caption turns ink while the fill is on it (grey on the new tint is 3.5:1). Not 3:1: a fill that strong is nearly a done key.
8. _(After the pass)_ `/impeccable doctor`: the design hook is on (`.impeccable/config.json`; local consent in the ignored `config.local.json`), `DESIGN.md` is compacted to a map with the full text in `.impeccable/design-full.md`, the sidecar is refreshed, and `.claude/skills/` and `.codex/` are gitignored.

**Later** (noted, not in this pass):
- **Icons at large text**: icon sizes are px props (`size={20}`), so at 200% text a check is a speck in a 64 px disc and the pencils look tiny beside 36 px names. Size them in `em` (e.g. `size="1.25em"` on `Icon`) so they scale with the text and look the same at 100%; retake the 200% shots.

**Tests**: e2e for the delete confirmation's order and the inactive form, Enter and Escape while asking, a failed delete, and axe with the question open (light and dark); a 200%-text check on every screen and the empty states (no sideways scroll, nothing past the right edge, no text wider than its own box); History's numbers at 320 / 360 / 375 / 390 px and 100–150% text; the all-done line's emphasis; the invalid field's ring colour in light and dark; Today's title. Screenshots retaken (`docs/screenshots/feature-2,3,4,7/`), plus 200%-text shots in `docs/screenshots/impeccable-after/`.

## Reviews

_One entry per feature. Every agent finding is logged with its severity and what was done about it, so the log shows what each reviewer caught and what changed as a result._

### Feature 1: Data model and migration (2026-11-23)

#### logic-checker (plan review)
Verdict: **Ready after fixes**

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | Accepting the displayed day "within one day" lets an iPhone home-screen app resumed the next morning (still showing yesterday) silently write yesterday's check-in, while today stays undone. It also accepted *tomorrow* (first visit with no tz cookie in Honolulu renders tomorrow). | Fixed | New rule: today, or yesterday only in the first 10 minutes after local midnight; never tomorrow. Anything else returns "stale" and the screen reloads. Pure `checkinDayStatus()` with edge tests. The Today screen must reload on foreground and on date change (Feature 3). |
| 2 | Medium | The server's streak is anchored to the server's today while a stale screen shows another day, so the streak jumps 5 → 4 → 0 on an undo just after midnight. | Fixed | It's the same root cause as #1. The page passes one `today` to every query on a render, and a stale screen reloads before it can disagree. |
| 3 | Medium | Supabase default privileges grant ALL (incl. TRUNCATE) on new tables to `anon` and `authenticated`, and Postgres grants EXECUTE to PUBLIC. "anon gets nothing" needs explicit revokes, and PGlite wouldn't have those defaults, so tests would pass falsely. | Fixed | Revoke-then-grant in the migration. The PGlite stand-in reproduces Supabase's default privileges. RLS tests run as `authenticated` with a claim, never as superuser. |
| 4 | Medium | The 7-day dots had no state for "today, not done yet" (every morning it would read "missed"). It was unspecified whether `done` or `before` wins, and `createdDay` could be a sliced UTC string (a habit made at 21:00 in Toronto would be "created tomorrow"). | Fixed | Fourth state `open`; `done` always wins; `createdDay = todayIn(tz, created_at)`; the demo seed back-dates `created_at`. |
| 5 | Low | With `primary key (habit_id, day)`, inserting on someone else's habit leaks whether they checked in that day (conflict vs foreign-key error), and `ignoreDuplicates` would even return success. | Fixed | Key is now `(user_id, habit_id, day)`, so conflicts are only ever with your own rows; a PGlite test proves the error is the same either way. |
| 6 | Low | A blanket update grant lets an owner rewrite `id` and `created_at`. | Fixed | `grant update (name, position)` only. |
| 7 | Low | `position default 0` puts a new habit second after any reorder. | Fixed | `position bigint generated by default as identity`: new habits always go to the bottom, with no trigger. |
| 8 | Low | The DB name check (`btrim`, `char_length` = code points) and JS (`trim`, `.length` = UTF-16 units) disagree on tabs, non-breaking spaces and emoji. | Fixed | DB: `name !~ '^\s|\s$'` + `char_length`; JS normalises Unicode whitespace and counts code points; a PGlite test checks they agree. |
| 9 | Low | Function details: `returns table` in plpgsql makes `habit_id` ambiguous; cast `count(*)`; say what `reorder_habits` does with foreign or duplicate ids. | Fixed | `habit_streaks` is `language sql` with casts; `reorder_habits` stays plpgsql (it needs `raise` and `get diagnostics`, and returns a scalar, so there's no ambiguity) and raises on duplicates. _(Corrected after code review: I first logged "both are language sql", which isn't what shipped.)_ |
| 10 | Low | Open question: the plan claimed the migration "works with `supabase db push`", but the shared project has no CLI migration history (Staple pastes into the SQL editor). | Fixed | Plan now says it's applied by pasting into the SQL editor. |

Open questions answered: the yesterday allowance is a 10-minute midnight grace, not a "fix yesterday" feature (editing past days stays out of v1); check-ins before the created day count (done wins); new habits go to the bottom; concurrent demo visitors are covered in Feature 2.

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. No cross-user hole: RLS, the column grants, the composite foreign key and the function `search_path` all held up.

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|
| 1 | Medium | Any logged-in user (the shared demo too) can call PostgREST directly: unlimited habits, and check-ins for any date up to year 5,874,897. Storage is shared with Staple's production app. (migration: habits, checkins insert policy) | Fixed | `before insert` trigger caps 100 habits per user. It's a trigger because a policy count misses rows in the same bulk insert, and the test inserts 101 in one statement. The check-in insert policy only accepts days from 60 days ago to tomorrow (UTC). Tested, and mutation-checked. |
| 2 | Medium | `reorder_habits` can't "refuse a partial list": it is its own transaction, so the rows had already moved when the action saw the count, and a stale list could tie positions. (migration: reorder_habits) | Fixed | The function itself raises `HR001` (rolling back) if the list isn't exactly your habits; tests cover a missing id, a deleted id, someone else's id. |
| 3 | Medium | `checkinDayStatus` falls back to UTC without a timezone, re-opening "accepts tomorrow" on a first visit from Honolulu. (lib/checkin-day.ts) | Fixed | No timezone means `stale` (the reload brings the cookie); test flipped and extended. |
| 4 | Medium | The function revokes were untested: anon fails on the tables anyway (security invoker), so removing the revoke left all tests green. (tests/db) | Fixed | Asserts `has_function_privilege` and checks for no PUBLIC entry in `proacl` directly. Removing the revoke now fails a test (mutation-checked). |
| 5 | Low | The identity sequence `habits_position_seq` kept Supabase's default ALL grant (setval could break all inserts). | Fixed | `revoke all on sequence …`; `has_sequence_privilege` test (mutation-checked). |
| 6 | Low | The migration wasn't one transaction; a mid-way failure in the shared project leaves half a schema. | Fixed | Wrapped in `begin … commit`. |
| 7 | Low | The 10-minute grace used wall-clock minutes, so it breaks where DST starts at midnight (Santiago: 23:59 → 01:00). (lib/checkin-day.ts) | Fixed | Grace is real elapsed time: `todayIn(tz, now − 10 min)`. Santiago, Kolkata (+5:30) and Kathmandu (+5:45) tests added. |
| 8 | Low | The shim's `auth.uid()` read only the legacy `request.jwt.claim.sub`; PostgREST now sets the JSON `request.jwt.claims`. `\s` in the name check depends on the database's locale. | Fixed / Accepted | Shim uses Supabase's real `auth.uid()` definition and sets JSON claims like PostgREST. Locale: accepted, since the app normalises all Unicode whitespace before saving, so the DB check is only a backstop either way. |
| 9 | Low | The plan and log said both functions are `language sql`; `reorder_habits` is plpgsql. | Fixed | Plan and log row 9 corrected. |
| — | Tests | Missing: truncate on check-ins, upsert-style `on conflict (user_id, habit_id, day)`, `habit_streaks(null)`, year-end and leap-day streaks, an empty reorder, fractional-offset zones. | Fixed | All added; random histories now span 400 days (streaks past 60 exercised). 136 tests. |

Side note from the reviewer: the working tree also had `@playwright/test` in `package.json` (Feature 2 prep) that wasn't in the reviewed diff. It's committed with Feature 1 as a dev dependency only, and the rest of the Feature 2 files are held back.

#### Takeaways
- The logic-checker caught **design** problems: the day window, the dot states, the key order. The code-reviewer caught **attack surface** the plan never considered: direct PostgREST access by a demo visitor, and a shared storage quota. Neither overlapped much.
- Mutation-checking my own tests found nothing new on the table revoke, but the reviewer showed the same method would have missed the function revoke. Asserting privileges directly is the reliable test.
- Because a policy now depends on `now()`, every database test uses dates relative to today; fixed dates would have started failing within two months.

### Feature 2: Login, demo and app shell (2026-11-23)

#### logic-checker (plan review)
Verdict: **Ready after fixes**

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | `hold_demo_seeded_at` had no defined value. Copying Staple's (the newest sample row's `created_at`) gives a back-dated time in Hold, so every "Try the demo" would reseed and wipe whoever is inside. | Fixed | Defined as the seed's finish time (server clock). A test checks `needsReseed` is false right after a seed. |
| 2 | Medium | A reseed deletes habit ids that an open screen still holds; a later hold then fails on the foreign key, or an undo silently succeeds on nothing. | Fixed (Feature 3) | Written into the plan's known limits as a Feature 3 requirement: "habit not found" means reload. |
| 3 | Medium | Two seeds at once leave 10 habits, and Hold had no "Reset demo". Parallel e2e tests make it likely and hit the shared rate limit. | Fixed | The seed became one SQL function with a per-user advisory lock (atomic, no duplicates), added to the not-yet-applied migration; a demo-only "Reset demo" button; e2e runs one at a time. |
| 4 | Medium | `instantOnDay` must not use local midnight: it doesn't exist on DST days in Havana and Santiago, and it flips to the previous day for viewers further west. | Fixed | Local noon, tested for every day of a year across zones, including DST-at-midnight zones and ±14 h. |
| 5 | Low | Supabase writes user metadata as a whole, so a Hold write and a Staple write in the same instant can lose one. | Accepted | Listed as a known limit; it heals at the next reseed. |
| 6 | Low | Seed step 4 (`reorder_habits`) was redundant, or fragile if mapped by row order. | Fixed | Dropped: the seed function inserts one by one, so positions follow list order. |
| 7 | Low | Until Hold's URLs are allowlisted, the email's button opens Staple; Vercel previews need a wildcard. | Fixed | Spelled out in "What you'll need to do", with the preview wildcard. |
| 8 | Low | Generated `app/icon.tsx` URLs have no extension, so the proxy would send them the login page; keep `redirectKeepingCookies`. | Fixed | Icons will be PNGs under `/icons/` (decided now); the matcher test includes those paths; `redirectKeepingCookies` kept. |
| 9 | Low | Suspense isn't enough once the clock is read: Partial Prefetching prerenders a per-session shell that refuses `new Date()`. | Fixed | `userToday()` with `await io()` is in this feature; the rule is written down. |
| 10 | Low | Keep Staple's "demo only" guard inside the seed, or a bug could wipe a real account. | Fixed | `seedDemo` refuses unless `isDemoEmail`; unit test. |
| 11 | Low | Timezone behaviours of the shared demo (Toronto/Tokyo alternation, rows dated "tomorrow", no-cookie sign-in) should be listed. | Accepted | Listed under known limits. |
| 12 | Low | Staple and Hold share the `sb-<ref>-auth-token` cookie on localhost. | Fixed | Hold uses its own cookie name, `hold-auth`. |
| 13 | Low | The sample history wasn't fully specified ("a 2-day streak", done today or not?). | Fixed | Written as data per habit, with a test that every dot state and streak appears. |

Open questions: (1) Reset demo: yes, added. (2) Seed as a transactional SQL function: yes; the migration isn't applied yet, so it goes in the one migration. (3) The email template wording is the user's call (it changes Staple's email too). (4) Visitors in different timezones resetting each other: accepted for a shared demo. (5) e2e uses the real demo account, like Staple's, but one test at a time.

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. No cross-user hole in the code; the one Critical was in my setup instructions.

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|
| 1 | **Critical** | The plan told the user to allowlist `https://hold-*.vercel.app/**`. Anyone can register `hold-evil.vercel.app`, request a login email for any address straight from Supabase with that redirect, and receive the victim's token: account takeover across the whole shared project (Staple included). (plans:253, lib/auth-actions.ts:29) | Fixed | Exact URLs only, never a wildcard on a domain we don't own; previews use the code. The comment in `auth-actions.ts` now says the allowlist is the real protection. |
| 2 | Medium | A demo visitor holds a full session, so they could change the shared demo's password from devtools and break the demo in both apps. (Inherited from Staple.) | Accepted / offered | Listed in known limits. A real block needs a trigger on `auth.users` in the shared project: offered to the user, not done unilaterally. |
| 3 | Low | `needsReseed` reseeded on any different `today`, and `today` comes from a cookie the visitor controls, so a script alternating timezones could wipe the demo on every sign-in. (lib/demo-seed.ts:69) | Fixed | Reseed only for an *earlier* seeded day (or after an hour); tested both directions. |
| 4 | Low | The login cookie (with a 400-day refresh token) is readable by page scripts, but Hold has no browser Supabase client. | Fixed | `httpOnly`, `sameSite: lax`, and `secure` in production for every Supabase cookie (`AUTH_COOKIE_OPTIONS`). |
| 5 | Low | Reset demo submits again while busy (no guard), and success is never announced. (components/account-actions.tsx) | Fixed | Busy guard; "Demo reset. The sample habits are back." in a status region; e2e test. |
| 6 | Low | On the code step, the "We sent a code to …" sentence isn't tied to the focused field. | Fixed | It's the field's hint (`aria-describedby`). |
| 7 | Low | "I already have a code" with no email silently moves focus. | Fixed | Shows "Enter the email the code was sent to first." (also raised by the design-critic) and an e2e test. |
| 8 | Low | Whether "Try the demo" shows was baked in at build time (Cache Components prerenders `process.env`). | Fixed | Checked per request after `connection()` inside `<Suspense>`. |
| 9 | Low | Login CSRF: a token-hash link logs you into whoever's account it belongs to. | Planned | Inherent to the flow; Today will show the signed-in email (Feature 3). |
| 10 | Low | `saveTimezoneCookie` throws on a garbled `tz` cookie, crashing the root layout. | Fixed | Decoding is guarded; a bad value counts as "changed". |
| 11 | Low | The proxy 307s a logged-out server-action POST to `/login`, so the action's friendly message never arrives. | Fixed | Requests with a `Next-Action` header pass through; every action checks the login itself (`requireUser`). |
| — | Tests | Missing: action error mapping, `/auth/confirm` cases, `signInDemo`/`resetDemo`, `userTimeZone` decoding, reseed position and rollback cases, axe on the signed-in page, Reset demo announced. | Fixed | All added: `lib/auth-actions.test.ts`, `app/auth/confirm/route.test.ts`, `lib/demo-actions.test.ts`, `lib/server-helpers.test.ts`, reseed DB cases, and e2e. 206 unit tests. |

#### design-critic (screens: login email, email error, code step)
Verdict: **Ship after fixes**. "Hierarchy, dark mode and spacing are working; the medium issues are all in things the next screens will copy."
Screenshots: `docs/screenshots/feature-2/` (taken again after the fixes)

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | The primary button's lip was mixed from `--ink`, which is near-white in dark mode, so the "key" looked lit from below. | Fixed | New `accent-lip` token, darker than accent in both themes. (I'd spotted this in my own look at the screenshot but left it for the critic to judge independently.) |
| 2 | Medium | Danger (#B3261E / #FF8A80) is the same hue family as persimmon; in dark mode error text read like accent styling. | Fixed | Crimson `#A1173A` / `#FF8FA8` (contrast-tested), plus an alert icon on every error line so it isn't colour alone. |
| 3 | Medium | An email error doesn't move focus to the field; "I already have a code" fails silently. | Fixed | Focus moves to the field on error; the ghost button explains what's missing. |
| 4 | Medium | The pressed state stretched the key: an inset lip shrinking 2 px while moving 1 px makes the face grow. | Fixed | Outer lip 3 px → 1 px with a 2 px sink: the bottom edge stays put. |
| 5 | Medium | The login screen invented sizes and weights the direction doesn't have (52/800, 18, captions at 400). | Fixed | `text-display` and `text-lead` tokens, added to Design direction; captions at 500. |
| 6 | Low | The placeholder "you@example.com" repeated the error's example, so the field looked filled in. | Fixed | Placeholder "name@email.com", error "Enter your email address." |
| 7 | Low | The demo caption left one word on its last line. | Fixed | `text-balance`. |
| 8 | Low | The gutter was 23 px, not 20 (`max-w-sm` is narrower than the phone). | Fixed | `max-w-[28rem]`. |
| 9 | Low | The error line pushes the primary button 28 pt down. | Accepted | Focus now moves to the field, so the next tap lands there anyway. |
| 10 | Low | Motion didn't use the motion tokens; `lib/motion.ts` didn't exist. | Fixed | `lib/motion.ts` + a test that it matches the CSS; buttons use `duration-(--motion-fast) ease-(--ease-out)`. |
| 11 | Low | Ghost buttons give no press feedback on touch with Reduce Motion on. | Fixed | `active:bg-surface-sunk active:text-ink`. |
| 12 | Low | The input radius (16 px) wasn't in the system. | Fixed | `--radius-field`, in Design direction. |
| 13 | Low | "Start over" threw away the typed email. | Fixed | The email is kept across Start over. |

#### Takeaways
- The most valuable finding of the whole project so far was in **my setup instructions**, not in code: a convenience wildcard would have handed out account takeover for two production apps. Reviewing the plan text as part of the diff paid off.
- The design-critic and code-reviewer independently flagged the same silent "I already have a code" button, from screenshots and from code respectively.
- My first dark screenshots caught buttons mid-transition (150 ms after the colour-scheme switch). Screenshots now wait for transitions; worth remembering for every screen.

### Feature 3: Today, with press-and-hold (2026-11-23)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. "The data path is sound; the fixes are in failure handling, the keyboard path, gesture cancellation and keeping the tz cookie alive."

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | A failed save (network drop, logged out, "Server Action not found" after a deploy) throws inside the transition and replaces Today with the error page. A save that worked but whose answer was lost would show as failed. | Fixed | `setCheckin` is `guarded` (never throws); the client call is in try/catch; after an unknown failure, one `router.refresh()` shows the server's truth. |
| 2 | High | Holding Space: auto-repeat `keydown`s after 650 ms undo the habit just completed, then re-hold, flickering until release; a keyup or Space's native click could also undo it. Playwright wouldn't notice (no repeats). | Fixed | `repeat` ignored; default prevented on keydown and keyup; undo only on a fresh keydown on a key that was already done; unit-tested as sequences. |
| 3 | High | Safari caps script-set cookies at 7 days, so the `tz` cookie expires on a home-screen app; every hold then returns "stale" and the refresh renders in UTC, which matches the local date for most of the day, so nothing fixes it until evening. | Fixed | The proxy re-sets `tz` from the server on every request (not capped; done in Feature 2); the watcher writes it before every refresh. |
| 4 | Medium | "Swallow the click after a completing hold": Android sends no click after a long press, so the flag eats the next real undo; a right-click would start a hold. | Fixed | Undo is decided from the pointer sequence (short press on a key that was already done); clicks after any pointer sequence are ignored; flags reset on every pointerdown; `button === 0`. |
| 5 | Medium | A hold can finish with no finger on the key: a mouse dragged off (no implicit capture), an app switch with a lost `pointercancel`, focus moving away mid-Space. | Fixed | `setPointerCapture`; cancel on `lostpointercapture`, blur, hidden and `pagehide`; finish only completes if the same pointer or key is still down. |
| 6 | Medium | "A click with no pointerdown completes" is unproven: iOS Voice Control and Switch Control may simulate real touches, so those users couldn't complete at all. | Fixed | A **"Tap to complete"** switch as a guaranteed path, plus the click rule; real-device checks added to the final phone check. |
| 7 | Medium | The day watcher compares the device's date with the server's, so a wrong device clock or a zone the server doesn't know refreshes every 30 s forever; a stale day can't be faked from the browser. | Fixed | Refresh on every foreground return (debounced) and when the *device's* date changes since the last check; never mid-hold. `stale` is tested at the action level. |
| 8 | Medium | A date label formatted on the client from `new Date("2026-11-23")` shows Sunday in the Americas and mismatches hydration. | Fixed | The label is formatted from the string in UTC, server-side; a test covers it west of UTC. |
| 9 | Low | A hold finished just after midnight saves to yesterday, then the refreshed Today shows it undone: looks like a failure. | Fixed | The action returns `newDay`; the screen says "Saved for Monday. It's a new day now." |
| 10 | Low | `stale` and `gone` cost a second round trip; the "does the habit exist" query on undo isn't needed. | Fixed | `refresh()` inside the action for all outcomes; the extra query is dropped. |
| 11 | Low | The summary line must follow the optimistic state; key height 88 vs 96; `lib/hold.ts` tests only covered geometry. | Fixed | Summary from optimistic state; 96 px everywhere; `lib/hold.ts` is a pure event → state machine with sequence tests. |

Open questions: (1) The guaranteed path for assistive tech is the "Tap to complete" switch. (2) A single tap undoes, as the brief asked ("tap again to undo"). (3) The `tz` cookie is now also set by the server. (4) Both: refresh on every foreground return and on a date change.

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. No security hole, no bug in the main hold, undo or keyboard flows; "one fix promised in the logic-checker log doesn't work". _(Reviewed before the migration was applied, so before any end-to-end run; its browser-only notes are checked in Playwright.)_

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|
| 1 | Medium | The "Saved for Monday" and "new day" messages never show: the refreshed page has a new `today`, so `<TodayScreen key={today}>` remounts and drops them. That breaks the logic-checker's fix #9. (today-screen.tsx, page.tsx) | Fixed | No `key` on Today; the message is set inside the transition, so it arrives with the new data. |
| 2 | Medium | No usable timezone (cookie cleared, or a zone the server's ICU doesn't know) makes every hold "stale", forever: refresh, render in UTC, stale again. (checkin-actions.ts) | Fixed | Its own `timezone` reason with a real message; the cookie is written before every save. |
| 3 | Medium | Any press on a done key undoes it on release, however long, so someone holding again "to check it registered" undoes it. (hold.ts) | Fixed | In hold mode, undo is a tap (under 650 ms); tested. |
| 4 | Medium | A date change seen mid-hold was used up and never retried; a key unmounted mid-hold left the hold counter stuck, so Today stopped refreshing. (Also found by the Feature 4 logic-checker.) (day-watcher.tsx, habit-key.tsx) | Fixed | A pending reload is kept until the hold ends; the key reports "not holding" on unmount. |
| 5 | Low | Movement was measured relative to the key, so the key moving (the 2 px press, a message inserted above) cancelled holds as "scrolls". | Fixed | Viewport coordinates for movement; key-relative only for the fill's origin. |
| 6 | Low | Errors were announced twice (alert + status). | Fixed | Errors use only their alert. |
| 7 | Low | With Reduce Motion, done and undone still faded over 200 ms. | Fixed | `motion-safe:` on the key's transition. |
| 8 | Low | The proxy re-setting `hold-mode` from an in-flight request could switch "Tap to complete" back on just after you turned it off. | Fixed | The server owns that cookie (a server action sets it); the proxy only keeps `tz`. |
| 9 | Low | The root `error.tsx` said "Couldn't load your habits" on every page, including login. | Fixed | Neutral wording. |
| — | Tests | Missing: long-press on done, cancelled tap, a pointer during a key hold, a finish after the press is decided, the optimistic derivation, more `setCheckin` cases, the proxy cookie refresh. | Fixed (mostly) | All added (`applyDone` moved into `lib/today.ts` and tested). Component-level wiring tests (Testing Library) are **deferred** to Playwright, which drives the real component in a real browser. |

#### End-to-end, after the migration
All of Today's browser tests pass (hold, early release, scroll-cancel, undo, long-press on done, Space held, Tap to complete, axe in light and dark). Found and fixed on the way:
- Supabase's `getClaims()` checks token expiry with `Date.now()`, which Partial Prefetching's per-session shell refuses ("unstable value Date.now() while prerendering"). Fixed once: `await io()` in `createClient()`.
- The demo reset made **two** auth calls (clear and write markers), and the tests hit Supabase's auth rate limit, which production shares with Staple. The seed is one transaction now, so the "clear first" step is gone (one call per seed), and the tests share one sign-in and reseed through the database function directly.
- axe failed on contrast twice. The first was real timing (measured mid-transition after a theme switch; the check now waits). The second was a stale dev-server stylesheet (restart fixed it). Each was checked by reading the colours axe measured, not assumed.

#### design-critic (screens: Today, mid-hold, one more done, all done, footer, empty)
Verdict: **Ship after fixes**. "The keys, colours and the hold read well; one header bug breaks the top of every state."
Screenshots: `docs/screenshots/feature-3/` (retaken after the fixes)

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | The Edit pill filled half the header (`w-auto` lost to the button's `w-full`: no class merger), wrapping the date onto three lines. Also flagged independently by the Habits critic. (I'd noticed it in the screenshot and left it to the critic.) | Fixed | Buttons take `size` and `block` options instead of override classes; Edit is a compact pill; the date never wraps. |
| 2 | Medium | Completing faded over 200 ms and flashed back to the surface colour for a frame when the fill was removed; the direction says it snaps. | Fixed | The colour transition lives only on the not-done state: completing snaps, undoing fades. |
| 3 | Medium | The instruction vanished after the first completion, so a demo visitor (who opens on "2 of 5 done") never saw "hold". | Fixed | "2 of 5 done · Hold a habit to complete it." until all done; tabular numbers. |
| 4 | Medium | "Keep holding…" appeared under the thumb, in muted text; the plan said under the name. | Fixed | It takes the dots' place at the left, in ink, 14/600. |
| 5 | Medium | The empty check ring (`line`, about 1.4:1) was nearly invisible: the "press me" cue. | Fixed | `ink-muted` ring (6:1). |
| 6 | Medium | Dark, all done: five full-width #FF8F57 keys glare at night. | Fixed | New `accent-key` token (dark #D9733F) for done keys only; contrast-tested. |
| 7 | Low | Content shifted 1 px between done (no border) and not-done keys. | Fixed | A transparent border on done keys. |
| 8 | Low | The focus ring overlapped the key's lip. | Fixed | `outline-offset: 6px` on keys. |
| 9 | Low | Empty state: the summary said "hold" with nothing to hold; spacing off the scale. | Fixed | "Add a habit to get started."; `mt-7`, `p-5`. |
| 10 | Low | Footer: the switch was indented 4 px, Log out's text sat 12 px inside the gutter, the hit areas touched, the caption was 400. | Fixed | All aligned to the 20 px gutter; `gap-2`; `font-medium`. |
| 11 | Low | The Demo chip vanished in dark and used an off-scale 12 px. | Fixed | Surface with a line border, 14/500. |
| 12 | Low | The check disc switched instantly on undo while the key faded; the direction promised a streak "tick". | Fixed | The disc fades with the key; the direction now says the streak "updates". |
| 13 | Low | The skeleton keys were shorter than real ones, so the list jumped on load. | Fixed | Skeleton matches a key plus its lip. |

### Feature 4: Manage habits (2026-11-23)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. "The server side is sound: `reorder_habits` catches every cross-device race I traced. The gaps are client-side."

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | An optimistic reorder stored as "moves" gets replayed by React on top of a refreshed base, so two quick drags produce, and can save, an order nobody chose. | Fixed | The local order is always the full id list, reconciled against the server's set (`reconcile`), saved as one request. |
| 2 | High | Drag on iOS can't reach rows beyond the screen: the handle blocks scrolling, and there's no auto-scroll. With 100 habits, drag is useless for long moves. | Fixed (design change) | Drag replaced by an **Arrange mode** (↑/↓ on every row) plus Move to top/bottom in the editor. Drag is deferred, with the reasons in the plan. |
| 3 | High | Focus is lost when React moves the focused row (↓, Move down), and a "Move up" hidden at the top vanishes while focused, so keyboard and VoiceOver users can't make two moves in a row. | Fixed | Focus restored by habit id after each move; edge buttons stay, `aria-disabled`, and say "Already first/last". |
| 4 | Medium | A reorder right after an add is refused (`HR001`) because of the user's own add, blamed on "another device"; the Add box emptied before the save, losing text on failure. | Fixed | Arrange is unavailable while an add is saving; reconcile adds new ids; the Add box empties only on success. |
| 5 | Medium | Drag cancel and refresh mid-drag weren't defined. | Fixed (n/a) | No drag in v1; Arrange taps are atomic. |
| 6 | Medium | **Feature 3 bug**: a Today key removed mid-hold never reports "not holding", so the day watcher stops refreshing for good. | Fixed (in Feature 3) | `HabitKey` reports it on unmount. |
| 7 | Medium | With Cache Components, hidden routes stay alive (`<Activity>`), so an editor or confirmation reappears stale on return; "Done" can beat a pending save, so Today shows the old order. | Fixed | Panels reset on hide (layout-effect cleanup); Done waits for pending saves ("Saving…"). |
| 8 | Medium | Focus targets and announcements after add, save, cancel and delete were unspecified. | Fixed | Every target defined in the plan, plus the announcements. |
| 9 | Medium | Optimistic rename and delete lose typed text on failure; `update().eq()` returns no row count unless asked. | Fixed | Rename and delete wait for the server with a pending state; `.select("id")` counts rows; unchanged names send nothing. |
| 10 | Low | Deleting an already-gone habit (demo reseed) "succeeds" while the refreshed list still shows a habit of that name. | Fixed | 0 rows → "The list changed, so it was refreshed." |
| 11 | Low | Reorder input unchecked (10,000 ids, non-UUIDs); `22023` unmapped; no client network-failure path. | Fixed | At most 100 unique UUIDs checked first; `22023` → invalid; Today's catch-and-refresh path reused. |
| 12 | Low | `maxLength=60` counts emoji as 2. | Fixed | No `maxLength`; the counter uses code points. |
| 13 | Low | Keyboard handle details (arrows scrolling the page, chatty saves). | Fixed (n/a) | No handle; Arrange buttons use Enter or Space, saves are batched. |

Open questions answered: the Add draft survives leaving the page but editors don't; new habits show after the server answers; drag is not in v1; duplicate names are allowed; demo renames are visible to the next visitor (accepted).

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. "The server side is sound; every bug is on the client, in the parts unit tests can't reach." _(Reviewed before the migration was applied; its browser findings are now covered by e2e.)_

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|
| 1 | High | "Done arranging" switched straight to the server's (old) order, so the list snapped back until the save returned, and re-entering Arrange in that window would save an order built from the old one, undoing the change. (habits-manager.tsx) | Fixed | A pure `visibleOrder()` in `lib/reorder.ts` (tested) keeps the on-screen order while arranging **or a save is pending**; Arrange starts from what's visible; an e2e test checks there's no snap-back. |
| 2 | Medium | Editor moves set focus and announcements *after* `await`, which in React 19 commit a frame before the refreshed tree: Move to bottom dropped focus to `<body>` and nothing slid. Same cause for one-frame flashes after rename, delete and add. | Fixed | Editor moves now change the order on screen at once (like Arrange), with the slide and focus in the same commit, then save. Every post-`await` update is wrapped in `startTransition` (per Next's `interactive-apps.md`). An e2e test checks focus after Move to bottom and Move to top. |
| 3 | Medium | Adding while arranging got your own pending order refused ("the list changed"): the reorder queued behind the add. | Fixed | Add waits while an order is being arranged or saved ("Finish arranging first, then add."). |
| 4 | Medium | Done navigated away even when the pending save had failed, so the error was never seen. | Fixed | Any failure clears `leaving`; you stay on the page with the message. |
| 5 | Medium | Editor errors appeared at the top of the page, far from a lower editor, and stayed after a later success. | Fixed | Rename and delete problems show inside the editor; any success clears the page notice. |
| 6 | Low | An add whose answer was lost didn't refresh, so a retry could create a duplicate. | Fixed | A connection failure on add reloads the list too. |
| 7 | Low | "Gone" closed the editor without a focus target. | Fixed | Same target as a delete: the next row, else the previous, else New habit. |
| 8 | Low | Arrange could get stuck with no "Done arranging" if the list shrank below 2. | Fixed | "Done arranging" always shows while arranging. |
| 9 | Low | Leaving with Back within 600 ms of a tap shows the old order on Today briefly (the hide cleanup saves, but Today renders first). | Accepted | Rare and self-correcting (Today updates when the save returns); the Done button path waits. |
| 10 | Low | The character counters were live regions that mounted already filled, then spoke every keystroke. | Fixed | No live region; the limit is enforced by the validation message, which is announced. |
| 11 | Low | The e2e tests slept instead of waiting for the save; the screenshot run left the shared demo empty. | Fixed | Tests wait for the action's response; the screenshot run resets the demo at the end. |
| — | Tests | Missing: no snap-back, focus after editor moves, one save for several taps, edge announcements, Done during a pending save, a failed add keeps text, reloads after add/delete/move, Escape/Cancel focus; action tests when logged out, on a throwing call, invalid input not refreshing, emoji length, an empty reorder. | Fixed | All added (19 action tests, 10 e2e tests for `/habits`). |

#### design-critic (screens: list, editor, delete confirmation, Arrange, empty)
Verdict: **Ship after fixes**. "Structure, tokens and dark mode work."
Screenshots: `docs/screenshots/feature-4/` (retaken after the fixes)

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | The delete confirmation **autofocused the destructive Delete**; Enter twice (or a held, repeating Enter) would delete a habit and its whole history. | Fixed | Focus goes to the question; the danger button ignores key repeat. |
| 2 | Medium | Done, Arrange and Done arranging stretched to fill the row (the same class conflict as Today's Edit). | Fixed | Compact `sm` pills; header aligned on its centre line. |
| 3 | Medium | Two persimmon primaries at once (Add with Done arranging, Add with Save), and Add looked live while blocked. | Fixed | Add turns secondary while editing and dimmed and read-only while arranging, with the reason shown in advance; header Done is hidden while arranging. |
| 4 | Medium | The editor was a stack of equal-weight pills; "Move to bottom" wrapped. | Fixed | Moves are a light row with arrow icons ("To top" / "To bottom", full names for screen readers); tighter gaps. |
| 5 | Medium | The delete confirmation was a card inside a card (a black well in dark). | Fixed | The question replaces "Delete habit" in place, under a hairline. |
| 6 | Medium | The Delete pill wasn't a key (flat, no press). | Fixed | A `danger` button variant with `danger-lip` (contrast-tested). |
| 7 | Medium | Danger actions relied on colour alone. | Fixed | A trash icon on "Delete habit" and "Delete". |
| 8 | Low | The placeholder "Drink a glass of water" duplicated the first demo habit. | Fixed | "Call a friend". |
| 9 | Low | 18/600 list names weren't in the type scale; the empty state borrowed the login lead size. | Fixed | `text-list` token added to the direction; empty state is body text. |
| 10 | Low | Row gap 8 px vs the direction's 12. | Fixed | `gap-3`. |
| 11 | Low | Arrange arrows were close together, and the unavailable arrow nearly vanished in dark. | Fixed | `gap-2`; unavailable arrows are `ink-muted` at 35% instead of `line`. |
| 12 | Low | While saving, bystander buttons looked tappable. | Fixed | Bystanders dim while the acting button keeps its "Saving…" label. |
| 13 | Low | The 50+ counter turned red with no icon, left-aligned like an error. | Fixed | Right-aligned; an alert icon past 60. |

#### Takeaways
- Both design-critics independently traced the stretched pills to the same root cause (no class merging), which made it a component fix (`size`/`block` options) rather than two screen patches.
- The most important design finding was about safety, not looks: an autofocused destructive button.
- The e2e suite caught a real platform cost the reviewers couldn't see: Supabase's auth rate limit, which is shared with Staple's production demo.

### Features 5 and 6: Installable, Deploy (2026-11-23)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. No Critical or High; "most of it reuses a pattern already proven in Staple under the same config".

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | `app/favicon.ico` (the Next triangle) is still there, and file-based icons win over metadata, so tabs would show it. | Fixed | Deleted; e2e asserts the only `rel=icon` is ours. |
| 2 | Medium | One drawing for all four files: iOS shows a rounded tile's see-through corners as black. | Fixed | A shape per file (rounded / maskable / full); the apple icon is opaque full-bleed; tested. |
| 3 | Medium | `orientation: "portrait"` fails WCAG 1.3.4 (Orientation, AA): mounted phones need landscape. | Fixed | No orientation lock. |
| 4 | Medium | Install can only really be checked on a phone after deploy, and nothing ensured it would be. | Fixed | A phone checklist is an explicit Feature 6 step (status bar, opens on Today, gesture feel, VoiceOver and Voice Control, login in the app). |
| 5 | Medium | Vercel builds on import; env vars added afterwards leave a live build with no Supabase URL, so every page breaks while icons look fine. | Fixed | The order is written down: migration, push, env vars on the import screen (or redeploy), Redirect URL, then tests. |
| 6 | Medium | The full e2e suite against production means about 21 demo sign-ins from Vercel's IPs, which spends the per-IP limit Staple's live demo shares, and it overwrites the committed screenshots. | Fixed | A smoke subset for production (`e2e/smoke.e2e.ts`). |
| 7 | Low | The iPhone login story was wrong: since iOS 17.2 cookies are copied once on Add, so the real trouble is logging in *inside* the app around an app switch. | Fixed | Plan corrected; on the phone checklist; remembering the pending email is deferred. |
| 8 | Low | No manifest `id`, so changing `start_url` later makes Android see a new app. | Fixed | `id: "/"`. |
| 9 | Low | "Any other name 404s" must be in the handler: `dynamicParams` breaks the build under Cache Components. | Fixed | Handler 404; e2e checks `/icons/nope.png`. |
| 10 | Low | `ImageResponse` icons are cached as immutable for a year, so a redrawn icon wouldn't reach installs. | Fixed | `?v=1` on icon URLs. |
| 11 | Low | Manifest and icon colours should come from `PALETTE`, not new hex values. | Fixed | Imported from `lib/palette.ts`. |
| 12 | Low | iOS may open the page you added from, not `start_url`. | Fixed | On the phone checklist. |

#### code-reviewer (Feature 5 diff)
Verdict: **Ship after fixes**. "The install pieces are correct; the fixes are in the production smoke test."

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|
| 1 | Medium | The smoke test asserted the optimistic `aria-pressed`, so it would pass with saves broken in production, and could close the page before the undo was sent, leaving the shared demo changed (and eventually skip itself). (e2e/smoke.e2e.ts) | Fixed | Waits for each server action's response and reloads to check the saved state; "all done" fails instead of skipping; picks the key by position (names can repeat). |
| 2 | Medium | The install checks had only run on `next dev`, which serves icons differently; the documented production command left them out. | Fixed | Ran on `next build && next start`: the build lists the four icons as prerendered (●) and the manifest as static; the 10 install checks pass. They're part of the production run. |
| 3 | Medium | Nothing stopped the full suite (about 20 demo sign-ins, Reset demo, screenshots) being pointed at production. (playwright.config.ts) | Fixed | A non-local `BASE_URL` runs only the smoke and install checks, with no retries. |
| 4 | Low | The icon's key sat `lip/2` above centre despite the comment. (components/app-icon.tsx) | Fixed | The key and lip pair is centred. |
| 5 | Low | The `ICON_VERSION` comment overpromised for iPhone, which copies its icon once at Add. | Fixed | Comment says existing iPhone installs need re-adding. |
| — | Tests | Missing: icon pixel corners, iPhone meta tags, `/favicon.ico` 404, a proxy-skip test built from the icon list. | Fixed | All added (canvas reads the corners: iPhone opaque, tab icon see-through, maskable persimmon). |

Found while fixing: after the page loads, the head holds each icon and meta tag **twice**, with identical values, so it's harmless to browsers. The server's HTML has each tag once; the second copy is added in the browser. This happens in `next dev` too, not only in production builds (checked at deploy). The tests check distinct values. It's also a candidate for Next.js's agent-feedback report. And `next start` serves the prerendered icons with `max-age=0, must-revalidate`, not the year-long cache the reviewer expected, so `?v=1` is a cheap safeguard rather than a necessity.

#### Deploy (Feature 6, steps 1–5)
Done in the order the logic-checker asked for:
1. The migration was applied in the SQL editor.
2. The code was pushed to `main`.
3. The Vercel project was created with all four env vars set before the first build.
4. `https://habit-tracker-ifaf.vercel.app/auth/confirm` was added to Redirect URLs as an exact address.
5. The shared login email was made neutral by the user: the subject is "{{ .Token }} is your login code" and the body says "Your login code". Staple's repo copy of the template is the user's to update.

Production check: `BASE_URL=https://habit-tracker-ifaf.vercel.app npx playwright test` ran only the production project and passed **11 of 11**.
- The 10 install checks passed: the manifest and icons load without a login, each icon has the right size and corners, the iPhone tags are present, and `/favicon.ico` is a plain 404.
- The smoke test passed: logged out goes to login, Try the demo opens Today, and a hold is saved and survives a reload, then the undo is saved too.

No new code, so no reviewers ran. Step 6, the phone check, is still open.

### Feature 7: History (2026-11-23)

#### logic-checker (plan review)
Verdict: **Ready after fixes**. No Critical.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | Range links inside the `<Suspense>`: for uncached per-user data a navigation shows the fallback, so every switch would flash the skeleton, unmount the switch (focus drops to `<body>`), and "animate only on a switch" couldn't be told apart from arriving. | Fixed | One 90-day fetch; 7 and 30 are sub-windows switched in client state; the URL follows with `history.replaceState` (no back-button pile-up). |
| 2 | Medium | The plan said the rate leaves today out, but the formula counts done-today and not open-today; the summary sentence and per-habit lines could each use a different denominator. | Fixed | One rule, stated plainly: done today counts, open today doesn't. The rate, the sentence and each habit's % share it; only the bars and day table show today live. |
| 3 | Medium | "Longest streak, counted in full" stretches the request's "for the range"; and a `lead_in` must be ignored when the window's first day isn't done. | Kept, flagged | Kept in full (clipped, the 7-day view could show "longest 7" beside "best now 45"); flagged to the user as a decision. The lead-in case gets its own unit test, and the 300-history brute force uses the same "reaches into" rule. |
| 4 | Medium | The empty-state e2e reseeds the shared demo with nothing; a failure before the restore leaves it empty for real visitors for up to an hour (the markers aren't touched). | Fixed | Restore in `afterEach`. |
| 5 | Low | "Weekends dip" can't hold in strings indexed by days-ago. | Fixed | Claim dropped. |
| 6 | Low | A 1 px `sr-only` slider can't be found by touching the chart with VoiceOver. | Fixed | The native range input is laid over the chart (opacity 0, no pointer events). |
| 7 | Low | The selected segment, surface on sunk, is 1.2:1: fails 1.4.11. | Fixed | A 1 px `ink-muted` edge plus ink semibold text on the selected one. |
| 8 | Low | Geometry gaps: a zero-height viewBox, a clipped top line, stretched `rx`, an out-of-range scrub index, "0 of 0" wording. | Fixed | Top inset, no `rx`, clamped index, "No habits yet"; tested. |
| 9 | Low | Tests and docs encode the 60-day window (reseed test `ago(61)`, demo-seed `≤ 60`, CLAUDE.md "one migration"). | Fixed | Moved to 101 / 89; docs updated. |
| 10 | Low | "A habit created tomorrow after a move west" can't happen; the real case is check-ins dated after today. | Fixed | Test renamed to that case. |
| 11 | Low | Smaller: reset the selection on leaving (`<Activity>`); the Demo chip outside the `h1`; the skeleton's second pill; dots shrink to ~7 px at 30 a line; `coalesce` the streak; filter `user_id` explicitly; cap the window; `?range` given twice; "Added" only after the first day; the readout not a live region. | Fixed | All taken into the plan. |

Open questions it raised, and my answers: the longest definition (kept in full, flagged to the user); today in the rate (done counts, open doesn't); "habits but nothing ever done" (an honest page of zeros, with gentle copy; the encouraging empty state is for "nothing counted yet"); one 90-day fetch (yes, see 1).

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. No Critical or High.

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|
| 1 | Medium | The number and its unit had no space between them in the text ("12days"): the e2e would fail and screen readers in browse mode read it run together. (history-screen.tsx, Numbers) | Fixed | A real space before the unit. |
| 2 | Medium | The empty-state e2e and the screens script empty the shared demo before anything has shown the restore can work. Before the migration the 90-day seed is refused, so the demo would stay empty for visitors for up to an hour. (e2e/history.e2e.ts, e2e/screens.e2e.ts) | Fixed | Both reseed the samples **first**, so they fail before emptying anything; they still restore in `afterEach` / `finally`. |
| 3 | Low | After one switch, coming back to History (`<Activity>` restores from `display: none`) replays the bars' grow. | Fixed | The switch count resets in the `useLayoutEffect` cleanup; e2e checks `animation-name` on first load, on a switch, and with Reduce Motion. |
| 4 | Low | A vertical swipe that starts on the chart moved the selection (pointerdown picked at once). | Fixed | Touch selects on a tap, or once the finger moves more sideways than down (8 px); a scroll's `pointercancel` leaves the selection alone. Mouse and pen are unchanged. |
| 5 | Low | "Hold a habit on Today" in the empty state, for people who use Tap to complete. | Fixed | "Complete a habit on Today…". |
| 6 | Low | `longest` wasn't held at or above `bestNow`, and the test named for that used an inconsistent fixture. | Fixed | Clamped; the test uses a consistent 95-day streak (window + lead-in 5) and checks equality in every range. The database brute force still compares without the clamp. |
| 7 | Low | "112 of 148 check-ins" counts missed days as check-ins. | Fixed | "habit-days". |
| 8 | Low | "Added Oct 9" was hidden from screen readers. | Fixed | Part of each habit's sentence. |
| 9 | Low | The range in state could outlive its URL when `<Activity>` keeps the page (90 shown, URL `/history`). | Fixed | Fresh server data resets the range to the URL's (adjusting state during render, React's pattern). |
| — | Tests | Missing: odd `?range=` values; leaving and coming back resets to today; the animation rules; `toHistoryHabits` without a timezone; `habit_history` with reversed or null windows. | Fixed | All added. A touch-drag e2e (CDP touch events) is left out; the phone check covers it. |

Found while testing on the real database (after the migration was applied): all 45 browser tests passed on the first run. Then the 90-day full-page screenshot showed **about 1,400 px of blank page** below the last habit. A `<table>` ignores `height: 1px`, so `sr-only` on the table itself left its 90 rows stretching the page, and on a phone you could scroll into nothing. The table now sits inside an `sr-only` div that clips it. An e2e check measures the space below the last habit; my first version of it also matched list items in pages kept alive by `<Activity>`, so it's scoped to History's own list.

#### design-critic (screenshots: `docs/screenshots/feature-7/`, 7 / 30 / 90, scrub, both empty states, Today's header; light and dark)
Verdict: **Ship after fixes**. No High. "Every text pair passes contrast, the hierarchy is right, and the page matches Habits."

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | At 90 days the selected day is nearly invisible (a 3 px band, a 3 px tick), and in dark the band (`surface-sunk`) reads as a hole, not a highlight. | Fixed | The band is `line` in dark (lighter than the card); a 1 px `ink-muted` rule runs from the top down to the bar's top (3:1 at any width; after a look at the result, it stops at the bar instead of crossing it); the tick is centred and at least 8 px. |
| 2 | Medium | Dark: the selected range segment's lip (`line`) was lighter than its face: a highlight, the Feature 2 #1 mistake again. In light it was invisible anyway. | Fixed | No lip; the `ink-muted` edge and the surface face carry the state. |
| 3 | Medium | Dark: 30 and 90 bars in `accent` were the brightest block in the app, brighter than a done key. | Fixed | Bars and the legend swatch use `accent-key` (4.0:1 on the dark card; identical in light). |
| 4 | Medium | 90 bars: a 0.6 px gap anti-aliases unevenly, so some bars merge. | Fixed | At 90 days the bars touch and a 1 px `surface` non-scaling stroke separates them exactly (`separators` in the geometry; tested). |
| 5 | Low | The 7-day dots were packed left, not under their weekdays. | Fixed | A 7-column grid matching the day labels. |
| 6 | Low | The range switch broke the button rules: 14 px, no press, no easing. | Fixed | 16 px, `ease-(--ease-out)`, and a press on the unselected segments (sunk 1 px, surface fill). |
| 7 | Low | "Best streak now" had no room to spare; a 3-digit streak would wrap and break the row. | Fixed | Values and labels share rows (subgrid); values never wrap, at 28 px so "123 days" fits; labels `text-pretty`. |
| 8 | Low | The 90-day summary left "days." alone on a line. | Fixed | `text-pretty`. |
| 9 | Low | At 7 px, open and missed dots differed only by colour; "before" was a different colour at 7 days than at 30 and 90. | Fixed | Open is a 2 px ring at both sizes; "before" is `ink-muted/35` at both (Today's faint dots are slightly more visible). |
| 10 | Low | The empty state's "Add a habit" had no plus icon, unlike Today and Habits. | Fixed | Added. |
| 11 | Low | The selected day carried across a range switch (the 90-day shot showed Nov 4), but only sometimes. | Fixed | A switch starts on today; shots retaken. |

Not seen in the screenshots: the loading skeleton, the error page, the chart's focus ring, long names, the longest date in Today's header (measured to fit, about 339 of 350 px), the bar-grow motion, and touch scrubbing. The last two are on the phone checklist.

Shipped in `7b6396c`, after the user applied the migration:
- Locally: 345 unit and database tests, 45 browser tests on the real database, tsc, eslint and `next build` all pass.
- Production: Vercel deployed. The smoke and install checks passed 11 of 11.
- On the live site, History shows the new demo: 30 days 71% · 12 · 19; 90 days 67% · 12 · 22; the URL follows the range.

**Phone check for History:**
1. History opens from Today and Done returns to Today.
2. Switching ranges is instant, and the bars grow only on a switch (and not at all with Reduce Motion).
3. A sideways drag across the chart moves the day; a vertical swipe that starts on the chart scrolls the page without moving it; a tap picks a bar.
4. With VoiceOver, touching the chart lands on "Choose a day", and swiping up or down reads each day.
5. Light and dark; the dashed Habits line and the 1 px gaps at 90 days look even in Safari.
6. After midnight, or on coming back to the app, the chart moves to the new day.

#### Design pass (user request): bar colours, quieter step line, "Current streak"

The request:
1. Full days in persimmon, partial days a softer tint, tops rounded about 2 px.
2. A quieter "Habits" line.
3. "Best streak now" renamed "Current streak".

The new token `accent-soft` (#CD7A55 light) measures 3.2:1 on the card in both themes, and both bar colours are in `lib/palette.test.ts`. The bars became plain boxes so the rounded corners don't stretch.

##### design-critic (7 / 30 / 90, light and dark)
Verdict: **Ship after fixes**. No High. Full and partial days are told apart at every range, by colour **and** by height (a full bar always reaches the line). The tint reads as "persimmon, softer": the same hue in both themes.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | The selected bar sat on the selection band, so a partial day (today, most mornings) was 2.5:1 light / 2.4:1 dark against it. | Fixed | The band is drawn only **above** the bar; the bar stays on the card at 3.2:1. |
| 2 | Medium | Rounded tops: lopsided at 90 days (two 2 px radii plus a 1 px border on a 3.4 px bar), near-square at 7. | Fixed, partly | 90 days: 1 px radius and the gap taken from the width (`calc(% - 1px)`, no border), so both corners match. 7 and 30 keep the 2 px you asked for; the critic suggested 4 px at 7. |
| 3 | Medium | Dashes on `non-scaling-stroke` in a stretched SVG were only verified in Chromium; WebKit may size them in SVG units. | Fixed | The step line is now dashed CSS borders (runs and risers from `chartGeometry`, tested), so the dashes are real pixels in every browser. |
| 4 | Low | The line, centred on a full bar's top, still showed a thin dashed rim. | Fixed | A border is drawn just **below** its line, so a full bar covers it completely (seen in the 7-day shots). |
| 5 | Low | Dark: #A35B35 leaned brown across a mostly-partial chart. | Fixed | #AD5A2E: same hue, more saturated, 3.2:1 on the card. |
| 6 | Low | The selection rule started above the habits line and crossed it like a "+". | Fixed | It spans only the day's missed habits: from the habits line down to the bar. |
| 7 | Low | The legend was spaced like the lines around it; "Habits" is terse. | Fixed, partly | Legend `mt-3`, summary `mt-6`. "Habits that day" wrapped the legend onto two lines at 390 px, so it's back to "Habits". |
| 8 | Low | "Current streak" can read as a streak of perfect days. | Fixed, kept the label | The visible label is as you asked; screen readers hear "Current streak, best habit". |

Checks after the fixes: 349 unit and database tests, the 45 browser tests (axe in light and dark at every range) and `next build` pass. Shots retaken. The bar-grow animation and the dashes on iPhone Safari are on the phone checklist.

### Rename to Ascend and the Summit icon (2026-11-24)

The request: rename the app from Hold to Ascend (the name only: the gesture, `lib/hold.ts` and "hold to complete" stay), the new live address https://ascend-dk.vercel.app, and a new icon, "Summit". No plan review: no behaviour changed.

Kept on purpose, and why:
- The gesture and its copy: "press and hold", "Hold to complete", "Hold a habit to complete it.", `lib/hold.ts`, `HoldMode`, `HOLD_MODE_COOKIE` (`hold-mode`).
- The `hold-auth` login cookie and the `hold_*` demo markers (`hold_demo_seeded_at`, `hold_demo_seeded_day`): new names would log out every session on the new address and make the shared demo reseed.
- The applied migrations' header comments ("-- Hold: ..."): applied migrations are never edited.
- The repo and the Vercel project, `habit-tracker`; the plan's file name; the review logs above (history).

Checks: 355 unit and database tests, tsc, eslint and `next build` (the four icons prerendered) pass. On `next start`, the manifest has name and short_name "Ascend" and `?v=2` icons, the login page title is "Log in · Ascend", and the install checks (now with exact icon addresses and pixel checks of the mark) and the signed-out login checks with axe pass, 13 of 13. The full browser suite wasn't run: it resets the shared demo, which another app was testing against. Every icon PNG was looked at: the maskable mark's farthest pixel is 38.2% of the icon from the centre, inside the 40% safe circle (`docs/screenshots/rename-ascend/`, with a safe-circle overlay for review).

#### code-reviewer (diff review)
Verdict: **Ship after fixes**. "The code change is sound."

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|
| 1 | High | The email's login button builds its return address from the request, now `ascend-dk.vercel.app`; only the old address was recorded on Supabase's Redirect URLs, so the button would open Staple. (lib/auth-actions.ts:35, plan deploy log) | Already done, now recorded | The user had added `https://ascend-dk.vercel.app/auth/confirm` (exact) before this change; the rename note says so. The old one stays while it redirects. |
| 2 | Medium | The reason for keeping `hold-auth` was wrong for this move: `vercel.app` is a public suffix, so the domain change itself logs out old-address sessions (and resets `tz` and Tap to complete). Old home-screen installs keep "Hold", the old icon, and open the redirect outside their scope. (lib/supabase/cookie.ts, CLAUDE.md, plan) | Fixed | Reworded in all three: the name stays so sessions on the new address survive. Installs from the old address must be removed and added again; on the phone check (step 6), in CLAUDE.md and in the `ICON_VERSION` comment. |
| 3 | Low | "Hold" as the app's name left in the plan's current-tense text (Overview "why the name", demo markers note, cookie decision, Redirect URLs step with `hold-*` while the code says `ascend-*`). | Fixed | "the app" / Ascend; the wildcard example is `ascend-*` in both; "Why the first name, Hold" plus one line on Ascend. |
| 4 | Low | The version test only pinned a constant, and "drawn as specified" compared `SUMMIT` to itself, so a changed drawing without a version bump passed. (lib/app-identity.test.ts) | Fixed | One test pins version 2 with the literal points, the 0.75 scale and both colours, so the drawing and the version change together. |
| 5 | Low | No check of the rendered mark: a dropped maskable scale or a broken path would pass on size and corners. (e2e/install.e2e.ts) | Fixed | Pixel checks: mountain bone, trail persimmon, base corner bone on the 512 and iPhone icons; on the maskable, the full-size corner spot is field and the scaled corner is bone. One shared pixel helper. |
| — | Tests | Assert the icon `href`s exactly (with `?v=`); a manual email-button login on ascend-dk. | Fixed, partly | Exact `href`s asserted. The email-button login is left for the phone check (it sends a real email). |

#### design-critic (screens: login email, email error, code step, light and dark; icons 192, 512, maskable 512 with the safe circle, apple-touch 180)
Verdict: **Ship**. "The rename is clean and the icons draw the specified geometry exactly." Screenshots: `docs/screenshots/feature-2/login-*.png`, `docs/screenshots/rename-ascend/*.png`.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | Scaled about the centre, the maskable triangle sits low in a circle mask: base corners at 38.2 of 40, the apex 27 from the centre, about 13 units empty above it. Suggests shifting it up 4 units (or 0.8 and up 4). | Deferred to the user | Kept as specified (scaled about the centre, all inside the circle). Offered: an optical lift of about 4 units, which the safe-zone test would still check. |
| 2 | Low | At 16 px the bone strip between the trail's top and the ridge is about 0.9 px, so the trail can look as if it cuts the ridge in a 1x tab. | Deferred | Fine at 32 px and on the home screen. A 32 px PNG or an SVG tab icon is a follow-up if wanted. |
| 3 | Low | The tab and iPhone icons (scale 1) look fuller than Android's maskable one. | Rejected | The full-size geometry is the user's spec; it isn't clipped by iOS's mask. |
| 4 | Low | The login lead broke as "…habit going. One / streak, …". | Fixed | `text-balance` (like the demo caption): one sentence per line. Shots retaken. |
| 5 | Low | The sharp-cornered mark breaks from the rounded, key-like UI, and the Design direction didn't say so; "Why the name" explained the old name. | Fixed | A **Brand mark** paragraph in Design direction (sharp corners are the one exception; don't copy them into screens); the name line rewritten (code-reviewer #3). |
| 6 | Low | An Android monochrome (themed) icon would theme cleanly. | Deferred | Browser support for `purpose: "monochrome"` on installed web apps is unclear; not in this request. |

#### Takeaways
- The most useful finding wasn't in the diff: moving to a new `vercel.app` host resets every cookie and strands old installs, which changed the reason given for keeping `hold-auth` and added a step to the phone check.
- `TaskStop` on a backgrounded `next start` left its node child listening, so one check ran against a stale server with the new build's files (an axe failure that wasn't real). Re-run on a fresh server: all pass.

### Refinement pass: /impeccable document, audit and critique (2026-11-24)

The request: run the impeccable skill over the whole app as a refinement (look, colours, fonts, identity and copy kept); write `DESIGN.md`; audit and critique every main screen at 390×844, light and dark; fix the real findings, skipping any that conflict with a recorded decision. "Before" shots: `docs/screenshots/impeccable-before/`; after: the feature folders, plus 200%-text shots in `docs/screenshots/impeccable-after/`.

**`/impeccable document`**: `DESIGN.md` (North Star "The Warm Keyboard", tokens in its front matter, named rules) and `.impeccable/design.json`, written from the code. The descriptive language comes from this plan's Design direction rather than a fresh interview, since nothing was to change.

#### /impeccable audit (code and rendered checks: tokens, targets, axe, overflow at 390 / 320 px, text at 200%)
Health: Accessibility 3, Performance 4, Theming 4, Responsive 2, Implementation integrity 4: **17/20, Good**. No raw colours (Tailwind's palette is off), every tap target ≥ 44 px, no sideways scroll at 390 px, no axe violations except one rule below, motion all `motion-safe` with Reduce Motion paths.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | P2 | Text at 200% (WCAG 1.4.4) broke layouts: History's three numbers overlapped ("71%12 da19 days"); the Habits and History headers and the editor's Save / Cancel and To top / To bottom ran off the screen; Today's streak was cut off inside each key; "Log out" broke in two. | Fixed | Rows wrap; numbers 3-or-1 (Fixes 1 above); `e2e/text-size.e2e.ts`. |
| 2 | — | axe `label-content-name-mismatch` (serious) on every habit key: the key's name is the habit's name, but it also shows the streak. | False positive, no change | WCAG 2.5.3 needs the visible *label* inside the name, and it is (the name, first). The streak and week are the key's description (`aria-describedby`), a Feature 3 decision. The project's axe check (WCAG tags) doesn't run this rule. |

#### /impeccable critique: Assessment A (design review, isolated agent) and B (detector, isolated agent)
Method: dual-agent. Heuristics **28/40, Good** (status 3, real world 3, control 3, consistency 3, error prevention 3, recognition 3, flexibility 2, minimalism 3, recovery 3, help 2). Verdict: "this design belongs to this product"; the weak spots are around the key (end of day, undo, errors, empty states), not the identity. Not saved as a snapshot: the target was the whole app (the skill only keeps history per page).

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| A1 | P1 | The day's payoff ("All done for today") looked exactly like the muted instruction it replaces. | Fixed (style only) | Ink, semibold, persimmon check. The suggested full stop is a copy change: not made. |
| A2 | P2 | The hold fill is 1.32:1 (light) / 1.44:1 (dark) against the key: the progress bar of the main gesture is faint. | **Fixed after the pass (the user's call, 2026-11-24)** | Skipped at first (a palette colour). The user chose the suggested #E9B79A / #7A4228: 1.77 / 1.98:1 against the key, **not 3:1**. A 3:1 fill (#D17E58 / #A05A37) was offered and declined: it's nearly as strong as a done key, and grey text, dots and dark ink fail on it. The suggestion had missed that grey text on the new tint is 3.5 / 3.4:1, so a held key's streak caption turns ink (8.8 / 6.8:1); dots and rings on the fill stay ≥ 3:1. `palette.test.ts`: a 1.75:1 floor for the fill, the dot and ring pairs on it; e2e checks the caption's colour mid-hold. |
| A3 | P2 | A focused invalid field wore a persimmon ring around its crimson edge, so the error read as "selected". | Fixed | Crimson ring on `[aria-invalid="true"]:focus-visible`. |
| A4 | P2 | The delete question sat under a live persimmon Save; Delete took the left spot Save had; six actions at once. | Fixed | Keep it first; the rest steps back while asking. |
| A5 | P2 | Undo isn't shown to sighted users, and a stray tap undoes. | Skipped: **decided** | A visible "Tap to undo" is new copy; a hold-to-undo conflicts with the recorded decision "A single tap undoes, as the brief asked" (Feature 3 open questions). _2026-11-24, the user's call: no visible "Tap to undo"; single-tap undo stays._ |
| A6 | P3 | The three empty states differ, and Today's says "no habits" twice. | Skipped | Copy changes, and Today's "Add your first habit" is recorded in Feature 3. |
| A7 | Minor | "Start today" next to five filled dots reads as "never started". | Skipped | Recorded copy ("Start today" at 0). |
| A8 | Minor | The Demo chip looks like a button. | Skipped | Recorded fix, Feature 3 design-critic #11 (surface with a line border). |
| A9 | Minor | In dark, not-done keys' lip is ~1.06:1 on the page, so they read as flat cards. | Skipped | Recorded: dark mode shows depth by lightness, never by shadows. |
| A10 | Minor | Habits list names start 16 px in, keys 20 px. | No change | The list row matches the text field above it (16 px); a different component on purpose. |
| A11 | Minor | Arrange mode keeps the dimmed Add form. | Skipped | Recorded: Feature 4 design-critic #3. |
| A12 | Minor | History's "Done" changes nothing. | Skipped | Recorded: History's header matches Habits. |
| A13 | Minor | Dark History shows done in three oranges. | Skipped | Recorded: dots keep `accent`; bars use `accent-key` / `accent-soft` (Feature 7 design pass). |
| A14 | Minor | The 7-day selection band reads like a ghost bar. | Skipped | Recorded: Feature 7 design pass #1 (band above the bar). |
| A15 | Minor | The code field has no placeholder. | Skipped | Copy. |
| A16 | Personas | Navigation in the top-right thumb zone; Tap to complete below the fold with five habits; a walking finger moving > 10 px cancels a hold without saying why; 65% of the screen persimmon at bedtime when all is done. | Skipped | Layout and gesture decisions recorded in Feature 3 (header pills, footer switch, scroll-cancel) and the calmer dark `accent-key`; noted for a later pass. |
| B1 | Advisory | `text-[1.75rem]` on History's numbers is off the type ramp. | Fixed | `text-stat` token. |
| B2 | Warning ×5 | "Cream / beige palette" on every light page. | False positive | Bone paper is the chosen page colour. |
| B3 | Advisory ×10 | "Hard offset shadow" on habit keys. | False positive | The key's solid lip is the design (Design direction, "Space and shape"). |
| B4 | Side note | Today's tab title was just "Today". | Fixed | `title.absolute`: a layout's template doesn't reach a page in its own segment. |

#### logic-checker (plan review)
Verdict: **Ready after fixes**.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | The auto-fit numbers grid gave 2 + 1 on 360 / 375 px phones and at 125–150% text. | Fixed | Container query, 3 or 1; tested at four widths and three text sizes. |
| 2 | High | A failed delete's message would appear inside the stepped-back form, away from the question. | Fixed | Shown under Delete / Keep it; e2e with the connection dropped. |
| 3 | Medium | "Inactive" undefined: Enter in the field could still rename mid-question. | Fixed | `save()` and moves return early while asking; buttons `aria-disabled`; field read-only; e2e checks no request is sent. |
| 4 | Medium | Escape while asking closed the editor and lost a half-typed rename. | Fixed | Escape means Keep it while asking; tested. |
| 5 | Low | Dimming would stack (0.6 × 0.6). | No change needed | Dimming is per button, never on a container. |
| 6 | Low | A conditional wrapper would remount the autofocused input. | No change needed | No wrapper; attributes only. |
| 7 | Low | A habit removed by a refresh while its question is open drops focus to the page; delete failures say "Couldn't save". | Not fixed (pre-existing) | Rare (needs a lost answer or another device); the wording is copy. |
| 8 | Low | The crimson ring also shows on the read-only New habit box's "Finish arranging first" message. | Not fixed (pre-existing) | That message is set only on submit, when focus is on Add, not the box. |
| 9 | Low | The footer email was cut off at 200%, hiding the domain. | Fixed | It wraps instead. |

#### code-reviewer (diff review)
Verdict: **Ship after fixes**.

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | The dimmed read-only name was 4.2:1 in light, and dimmed buttons' focus rings fell to ~2.6:1. | Fixed | The field isn't dimmed; a dimmed button is full strength while focused (`not-focus-visible:opacity-60`, also on the older bystander dims). axe runs with the question open. |
| 2 | Low | Escape inconsistent with the dimmed Cancel. | Fixed | As logic-checker #4. |
| 3 | Low | Failed delete message placement. | Fixed | As logic-checker #2. |
| 4 | Low | The 200% check couldn't see overlap inside the page. | Fixed | It now flags any text wider than its own box (text boxes excluded: they scroll by design). That caught two more: the login wordmark and "I already have a code" spilling out of its pill (fixed: the wordmark is capped at 17vw; button labels wrap inside the pill). |
| 5 | Low | The plan and a comment described the old grid. | Fixed | Plan and comment updated (one column from ~115% on a 390 px phone). |
| — | Tests | Enter / Escape while asking, failed delete, axe while asking, dark ring, the numbers' switch point, empty states at 200%. | Added | All of them. |

#### design-critic (before/after, light and dark, plus 200% text)
Verdict: **Ship after fixes**. "All five changes are improvements in both themes, and nothing regressed at normal text size."

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | At 200%, the selected range segment's round outline cut through "days". | Fixed | Fixed radii (22 / 26 px): pills at normal size, rounded boxes when the label wraps. |
| 2 | Low | Only the input was dimmed (not its label), the dimmed name looked like a placeholder, and it snapped while buttons faded. | Fixed | The field isn't dimmed at all (code-reviewer #1). |
| 3 | Low | At 200% the check disc drifted right on keys with long words. | Fixed | The name is `min-w-0 flex-1 break-words`. |
| 4 | Low | To top / To bottom misaligned once wrapped. | Fixed | `-ml-3` on the row. |
| 5 | Low | Footer links indented from the gutter once wrapped. | Fixed | `-mx-3`. |
| 6 | Low | "Same order as Today." went one word per line at 200%. | Fixed | The row wraps; the hint has a 10 rem basis. |
| 7 | Low | Icons are px-sized, so they stay small at 200%. | Deferred (the user's call, 2026-11-24) | Touches every icon; see "Later" below. |
| 8 | Low | Save \| Cancel and Keep it \| Delete use opposite orders, unwritten. | Fixed | The rule is in `DESIGN.md` (Buttons, Order). |

Checks: 355 unit and database tests, tsc, eslint, `next build`, and all **59 browser tests** (on `next start`, the full suite including screenshots) pass.

#### Takeaways
- The rendered 200%-text probe found the only real accessibility failures; the screenshot critique and the detector didn't. Making that check strict (text wider than its own box) found two more on a screen everyone had passed.
- Assessment A's best findings were about moments (end of day, undo, errors), and most of its remaining ideas ran into decisions already recorded here, which is the plan doing its job.
- The detector's two warnings were both the brand (bone paper, the key's lip): it can't know a chosen world from a default.
- The dev server (Turbopack) kept serving an old value for one edited `@theme` token even after a touch; the production build had it. Check theme-token changes on `next build`.


### Hold fill follow-up: review of 49a52a5 (2026-11-24)

The user asked for the reviewers on the stronger hold fill (49a52a5, committed before review; this entry and the fixes are the follow-up). No logic-checker pass: a colour change and a caption state, no rules about what happens.

#### code-reviewer (49a52a5)
Verdict: **Ship**. Every tested pair on the fill passes in both themes (fill 1.77 / 1.98:1; ink 8.8 / 6.8; accent dots 3.06 / 3.53; grey rings 3.50 / 3.38).

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | Leaving Today (`<Activity>` hides it) cleared the timers but not the state: the ink caption, and (pre-existing) "Keep holding…" in place of the dots, could stay stuck on return. | Fixed | A `useLayoutEffect` cleanup resets `filled`, `hint` and the hold state (and says the hold is over, which moved here from the passive cleanup so it still runs first). e2e: early release, History, back; checked that it fails without the fix. |
| 2 | Low | The mid-hold e2e check could race the 650 ms hold and complete the habit on a slow runner. | Fixed | The test pauses the fill's animation while it checks, then plays it to let the cancel finish. Now in light and dark. |
| 3 | Low | The caption's 150 ms timer ran separately from the shrinking fill, so grey could show on the last frame of fill. | Fixed | No timer: the caption goes grey when the shrinking fill's animation finishes (or at once if there's no fill). |
| 4 | Low | The faint "before" dots are 1.5:1 on the fill (1.7 on the key). | No change | Decorative and untested before too; noted in `palette.ts` so "dots stay ≥ 3:1" isn't read as covering them. |
| 5 | Low | Committed before review. | Logged | This entry. |
| — | Tests | Cancel keeps ink until the fill is gone; keyboard hold; leaving and returning; dark mode. | Added | Restart within 150 ms, done keys and Tap to complete never reach a holding state (checked in code, not added). |

#### design-critic (mid-hold before / after, light and dark)
Verdict: **Ship**. "The stronger fill does its job in both themes, and nothing on it fails contrast." The held key stays clearly apart from a done key (opposite text, hollow ring, grey lip); `::selection` on the new tint is fine (ink 8.8 / 6.8:1).

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | Medium | Reduce Motion fades the tint from 0, so for the first half of a hold it's as faint as the old tint, exactly when people check the press registered. | Fixed | The fade starts at 35% opacity (about 1.25:1 at once), still opacity only. |
| 2 | Low | The tint is at its ceiling (accent dots 3.06:1 on it in light; 2.45:1 from a done key in dark), with only a floor tested. | Fixed | A test that the fill stays at least 2.4:1 from a done key; "at its ceiling" in the colour table. |
| 3 | Low | The snap frame may depend on React's update order; at 1.8:1 a late commit would flash white. | Checked, no change | Measured per frame in Chromium at 1×, 4× and 6× CPU slowdown: the persimmon key and the fill share one frame, never a frame with neither. The comment calling the fill "underneath" was wrong (it paints above the key's background) and is corrected. |
| 4 | Low | "Before" dots nearly vanish under the fill. | No change | As code-reviewer #4. |

Checks: 361 unit and database tests, tsc, eslint, `next build`, and the full browser suite on `next start` pass.

<!--
Template — copy for each feature:

### Feature N: <name> (YYYY-MM-DD) — commit <sha>

#### logic-checker (plan review)
Verdict: <Ready to build | Ready after fixes | Rethink before building>

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | ... | Fixed / Deferred / Rejected | Plan change + why |

#### code-reviewer (diff review)
Verdict: <Ship | Ship after fixes | Do not ship>

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|

#### design-critic (screens: <names>)
Verdict: <Ship | Ship after fixes | Rework>
Screenshots: `<paths>`

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|

#### Takeaways
- What the reviewers caught that I would have missed, false positives, and anything to change in the agent prompts.
-->
