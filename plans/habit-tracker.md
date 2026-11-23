# Hold: Plan

## Overview

**Hold** is a habit tracker you press like a physical button. Today shows each habit as a big row: press and hold to complete it (a fill grows out from under your finger, a small pop when it's done), tap a done row to undo. Every habit shows its current streak and a 7-day dot grid. Mobile-first, installable to the home screen.

v1 scope:
- Habits: add, rename, reorder, delete.
- Today: press-and-hold to complete, tap to undo, streak per habit, last 7 days as dots.
- Login: email code (same Supabase project and email setup as Staple), plus "Try the demo".
- Installable PWA (manifest, icons, iOS home-screen meta).

Out of v1 (on purpose): schedules other than daily, reminders/notifications, editing past days, longest-streak stats, offline mode, sharing.

Why the name: the core gesture is a hold, and the app is about holding on to a habit.

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
- **The demo account is shared with Staple**, so Hold's seed only ever touches `habits` / `habit_checkins`, and its "last seeded" markers in user metadata are namespaced (`hold_demo_seeded_at`, `hold_demo_seeded_day`) so they can't collide with Staple's `demo_seeded_at`.

## Design direction

**Tactile and warm.** Every habit is a chunky key you press. Where Staple is calm white paper with a matcha accent and Figtree, Hold is warm bone paper and soft graphite with one **persimmon** accent, set in **Bricolage Grotesque**. It should feel physical: things have weight, press down, and spring back.

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
| `accent-tint` | `#F6D9C8` | `#5A3220` | the hold fill while pressing (text stays `ink`) |
| `accent-lip` | `#8A300A` | `#C2602F` | the bottom edge of a persimmon key: darker than `accent` in **both** themes (a lip, never a highlight) |
| `danger` | `#A1173A` crimson | `#FF8FA8` | errors and delete: crimson, so it never reads as persimmon; always with an alert icon |

All text pairs must pass 4.5:1 (`ink-muted` on `background` and `surface`, `on-accent` on `accent`, `ink` on `accent-tint`); dots, borders and focus rings 3:1 against what they sit on. Dark mode is warm, not pure black, and shows depth by lightness (background < surface), never by shadows. The accent gets lighter in dark mode, so it doesn't glare at night.

**Type**: Bricolage Grotesque for everything (variable; its optical sizes keep small text calm).
- Display 52 px / 800: the "Hold" wordmark on the login screen only (`text-display`)
- Lead 18 px / 400: the one-line promise under the wordmark (`text-lead`)
- Page title 34 px / 700, tight leading ("Today")
- Habit name 22 px / 600
- Body and buttons 16 px / 500–600 (16 px stops iOS zooming into inputs)
- Labels and captions 14 px / 500, `ink-muted`
- Numbers are `tabular-nums`.

**Space and shape**
- 4 px grid. Page gutter 20 px. Gap between habit rows 12 px. Row padding 20 px. Header-to-list gap 28 px.
- Habit rows are at least 88 px tall, full width, radius 24 px. Each row is a key: `surface` with a 4 px `surface-sunk` lip along the bottom edge. Pressed, it moves down 2 px and the lip shrinks to 2 px.
- Buttons are pills (fully rounded), at least 48 px tall for primary actions and at least 44×44 px for every tap target. Primary and secondary buttons sit on a 3 px **outer** lip (`accent-lip` / `surface-sunk`); pressed, the face moves down 2 px and the lip becomes 1 px, so the bottom edge stays put and the key sinks.
- Text boxes: 16 px corners (`--radius-field`), a 1 px `ink-muted` edge (3:1 to be findable).
- Icons: simple 2 px stroke line icons drawn inline (check, plus, grip, arrows, trash, pencil). No emoji.

**Motion**: purposeful and physical.
- **Hold (signature)**: on press, an `accent-tint` circle grows out from the exact touch point until it covers the row, over 650 ms, linear so progress reads as honest. Let go early and it shrinks back in 150 ms.
- **Done pop**: the row snaps to `accent` with `on-accent` text, scales 1 → 1.03 → 1 (about 250 ms, spring-like), the check draws in, and the streak number ticks up. One short vibration where the device supports it.
- **Undo**: the colour fades back to `surface` in 200 ms and the streak ticks down. No scale.
- UI feedback 150–250 ms. Nothing loops, nothing moves on its own.
- **Reduce Motion**: no growing circle, no scale. The hold shows as the row's tint fading in over the same 650 ms (opacity only), and done or undone changes colour instantly.

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

Order: 1 data model → 2 login and demo → 3 Today → 4 manage habits → 5 install (PWA) → 6 deploy and docs. Login comes before Today because Today needs a signed-in user; the demo account is also how Playwright reaches Today.

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
- New check-ins only for days from **60 days ago to tomorrow (UTC)**, enforced in the insert policy. That covers today everywhere up to UTC+14 and the demo's sample history. It's a policy, not a check constraint, because it depends on `now()`. Rows already saved aren't affected, so streaks keep growing past 60 days.
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
    - Supabase saves user metadata as one whole value. If Hold and Staple write their markers in the same few milliseconds, one could undo the other's write. Staple's next demo sign-in would then reseed. Rare, and it heals itself.
    - Every demo sign-in comes from Vercel's IPs, so Supabase's rate limit can say "Lots of people just tried the demo". That limit is shared with Staple's demo.
    - A demo visitor holds a real session for the shared account, so someone determined could call Supabase directly and change its password, breaking the demo in both apps until it's reset in the dashboard. (Inherited from Staple.) A real block needs a trigger on Supabase's `auth.users`, which changes the shared project's auth schema: offered to you, not done.
    - The email's link logs in whoever it belongs to (true of every token-hash link), so an attacker could log someone into the attacker's account. Mitigation: Today shows the signed-in email (Feature 3).
- `lib/server-helpers.ts`: `requireUser()` (verified claims, for every action), `userTimeZone()` (the `tz` cookie) and `userToday()`. These `await io()` before reading the clock, because with Partial Prefetching a per-session App Shell is prerendered and refuses `new Date()` (Staple hit this). The rule everywhere: cookies and `searchParams` go inside `<Suspense>`, and `await io()` comes before any clock read in render.
- **Login cookie name**: Hold's Supabase clients use their own cookie name (`hold-auth`). Staple and Hold share a Supabase project, so they'd otherwise share the `sb-<ref>-auth-token` cookie on `localhost` (cookies ignore the port), and logging out of one would log out the other during development.
- `components/timezone-sync.tsx`: sets the `tz` cookie from the browser and refreshes once if it changed (Staple's approach).
- **Design system**:
  - `app/globals.css` holds the colour tokens from Design direction as CSS variables, light and dark via `prefers-color-scheme`, mapped to Tailwind colours (`bg-surface`, `text-ink-muted`...).
  - Bricolage Grotesque via `next/font/google`.
  - `lib/palette.ts` holds the same hex values, and `lib/palette.test.ts` checks every text pair is at least 4.5:1 and every non-text pair at least 3:1, plus that `globals.css` matches `palette.ts`, so the design-critic's contrast estimates have a measured backstop.
- **Login page** (`/login`):
  - The wordmark "Hold", a one-line promise, and an email field with "Email me a code" (primary pill).
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
- Add Hold's **exact** addresses to Supabase → Authentication → URL Configuration → Redirect URLs: `http://localhost:3000/auth/confirm` and `https://<production domain>/auth/confirm`. **Never a wildcard on a domain you don't own** (like `hold-*.vercel.app`): anyone can register a matching Vercel project and receive a victim's login link, which would take over accounts in the whole shared project, Staple's included. _(Corrected after code review.)_ Previews log in with the code, which works whatever the redirect. Until this is added, the email's button opens **Staple**.
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

**A habit key** (at least 96 px tall, full width)
- Line 1: the name (22/600, wraps to two lines, never truncated mid-word). On the right, a 32 px check circle: an empty ring while not done; filled with the check drawn in when done.
- Line 2: the 7 dots (10 px, oldest left, today right) and the streak on the right ("12-day streak", "Start today" at 0).
- Dots: `done` filled; `missed` a 1.5 px ring in `ink-muted`; `open` (today, not done) a 2 px ring in `accent`, so today stands out; `before` a 4 px faint dot. On a done (persimmon) key, dots and text use `on-accent`.
- Not done: `surface` with the 4 px `surface-sunk` lip. Done: `accent` with `on-accent` text.

**The gesture** (a small, tested state machine in `lib/hold.ts` plus `components/habit-key.tsx`)
- **Hold to complete.** `pointerdown` (primary pointer only) starts a fill: an `accent-tint` circle grows from the touch point until it covers the key, over 650 ms (linear). The animation's own `finish` is the trigger, so what you see and what happens can't drift apart. It cancels if the pointer moves more than 10 px (you're scrolling: the key has `touch-action: pan-y`), lifts early, or the browser cancels it. Cancelling shrinks the fill back in 150 ms.
- **Pop** on completion: the key turns `accent`, scales 1 → 1.03 → 1 (about 250 ms), the check draws in, the streak ticks up, and one short vibration plays where supported (`navigator.vibrate`, which iOS ignores).
- **Tap a done key to undo**: it fades back in 200 ms. The `click` that follows the `pointerup` of a completing hold is swallowed, so finishing a hold never undoes it.
- **A quick tap on a not-done key** doesn't complete it. It shows "Keep holding…" under the name for 1.5 s and announces it, so people learn the gesture.
- **Keyboard**: Space or Enter held down holds (keyup cancels); on a done key, Enter or Space undoes. The keys' default "click" is prevented, so it can't double-fire.
- **Assistive tech**: a `click` with no `pointerdown` from us before it (VoiceOver double-tap, Switch Control, voice control) completes at once. Those users can't usefully hold, and an accidental touch always has a `pointerdown` first. The instruction is in the key's description: "Hold to complete" or "Done today. Tap to undo".
- **Semantics**: `<button aria-pressed>` with `aria-label` = the habit name, and `aria-describedby` pointing at the streak, a text summary of the 7 days ("Last 7 days: 5 done, 1 missed, today not done yet") and the instruction. Changes are announced in one polite live region ("Read 10 pages done. 5-day streak.").
- **Reduce Motion**: no growing circle and no scale. The key's tint fades in over the same 650 ms (opacity only), and done or undone switches colour instantly. Holding is still required: Reduce Motion is about animation, not about the gesture.
- iOS details: `-webkit-touch-callout: none`, `user-select: none`, and `contextmenu` prevented on keys, so a long press never opens the iOS or Android menu.

**Data** (server, `app/page.tsx` behind `<Suspense>`)
- `today = userToday()` and `tz = userTimeZone()`, read once and passed everywhere.
- In parallel:
  - the habits (`id, name, created_at`, ordered by `position, created_at, id`);
  - check-ins from `today − 6` to `today` (at most 700 rows for 100 habits, under Supabase's 1,000 limit);
  - `habit_streaks(today)`.
- Each habit becomes `{ id, name, doneToday, streak, dots }`, with `createdDay = todayIn(tz, created_at)`. That's a pure function (`lib/today.ts`), tested.

**Saving** (`lib/checkin-actions.ts`: `setCheckin(habitId, day, done)`)
1. `requireUser()`, then validate `habitId` (a UUID) and `done` (a boolean).
2. `checkinDayStatus(day, tz)`: `invalid` → error, `stale` → `{ ok: false, reason: "stale" }`.
3. If done: upsert with `ignoreDuplicates` (already done is fine). A foreign-key error means `"gone"`: the habit was deleted, or the demo was reseeded.
4. If undo: delete the row for that habit and day. If nothing was deleted and the habit no longer exists, `"gone"`; if it still exists, `ok` (it was already undone).
5. `refresh()` so the page re-renders with server truth, then return `ok`.

**On the screen**
- `useOptimistic` holds the done state per habit. The streak shown is `adjustStreak(serverStreak, serverDone, optimisticDone)`, and today's dot follows too.
- On `stale` or `gone`, the screen reloads (`router.refresh()`) and says "It's a new day, so Today was refreshed" or "That habit changed, so the list was refreshed".
- On any other failure, the optimistic change falls away on its own and the live region says "Couldn't save. Check your connection and try again."
- Server actions from one page run one after another, and each save says done or not done (it isn't a toggle), so complete, undo, complete always ends complete.

**Day rollover** (`components/day-watcher.tsx`): on `visibilitychange` to visible, on focus, and every 30 s, it compares the device's today with the page's `today`. If they differ, it refreshes the `tz` cookie and calls `router.refresh()`. That covers an app left open overnight and a phone resumed in the morning.

**Tests**
- Vitest: `lib/hold.ts` (fill radius from any touch point, move tolerance, release classification); `lib/today.ts` (view model: dot states, createdDay in tz, streak passthrough, done today); `setCheckin` with a fake Supabase (stale, invalid id, gone on foreign-key error, undo of a deleted habit, already done).
- Playwright, after the migration:
  - hold a key for 700 ms: it's done and the streak goes +1;
  - release at 300 ms: not done, and the hint shows;
  - move 30 px while holding: cancelled;
  - tap a done key: undone, streak −1;
  - reload: state persisted;
  - keyboard Space held: done;
  - a stale day returns "stale" (the clock can be faked in the browser);
  - axe in light and dark.
- Screenshots: Today in light and dark, mid-hold (the fill at about 50%), all done, and empty.


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
