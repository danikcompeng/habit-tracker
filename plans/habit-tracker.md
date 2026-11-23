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
| `danger` | `#B3261E` | `#FF8A80` | delete |

All text pairs must pass 4.5:1 (`ink-muted` on `background` and `surface`, `on-accent` on `accent`, `ink` on `accent-tint`); dots, borders and focus rings 3:1 against what they sit on. Dark mode is warm, not pure black, and shows depth by lightness (background < surface), never by shadows. The accent gets lighter in dark mode, so it doesn't glare at night.

**Type**: Bricolage Grotesque for everything (variable; its optical sizes keep small text calm).
- Page title 34 px / 700, tight leading ("Today")
- Habit name 22 px / 600
- Body and buttons 16 px / 500–600 (16 px stops iOS zooming into inputs)
- Labels and captions 14 px / 500, `ink-muted`
- Numbers are `tabular-nums`.

**Space and shape**
- 4 px grid. Page gutter 20 px. Gap between habit rows 12 px. Row padding 20 px. Header-to-list gap 28 px.
- Habit rows are at least 88 px tall, full width, radius 24 px. Each row is a key: `surface` with a 4 px `surface-sunk` lip along the bottom edge. Pressed, it moves down 2 px and the lip shrinks to 2 px.
- Buttons are pills (fully rounded), at least 48 px tall for primary actions and at least 44×44 px for every tap target.
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
  - It then reseeds if needed: never seeded, over an hour ago, seeded for a different "today", or a seed date in the future.
  - The seed runs **as the demo user** (RLS applies):
    1. Clear the markers.
    2. Delete the demo's `habits` (check-ins cascade).
    3. Insert five sample habits with back-dated `created_at`.
    4. Call `reorder_habits` to fix their order.
    5. Insert their check-ins.
    6. Write the markers last. A half-finished seed therefore looks like "never seeded" and is redone at the next sign-in.
  - Markers are namespaced in user metadata: `hold_demo_seeded_at`, `hold_demo_seeded_day`. The account is shared with Staple, which uses `demo_seeded_*`, and Supabase merges metadata keys, so neither app overwrites the other's.
  - The seed touches **only** `habits` and `habit_checkins`; Staple's seed touches only its own tables.
  - **Positions are never inserted explicitly.** They come from the identity default and then `reorder_habits`, which writes 0…n−1. That keeps the rule "new habits land at the bottom" true: every habit took a number from the sequence, so the next number is always bigger than n−1. An explicit insert of 0…4 would take no numbers, and the next new habit could land in the middle.
  - Sample history is chosen so the demo shows every state on first open:
    - a 12-day streak done today;
    - a 4-day streak not yet done today;
    - a habit that missed yesterday (streak 0);
    - a 2-day streak;
    - a habit created two days ago (so some dots show "before").
  - `created_at` is computed so its local day, in the visitor's timezone, is exactly the intended day (`instantOnDay(day, tz)`, pure and tested).
  - Known limits, same as Staple's demo: visitors in the demo at the same time share it; a reseed an hour later clears what an earlier visitor did; two sign-ins in the same second could both reseed (the next reseed fixes it). Every demo sign-in comes from Vercel's IPs, so Supabase's rate limit can say "Lots of people just tried the demo".
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

**Tests (Vitest)**: login code cleaning; `isDemoEmail`; `needsReseed`; demo seed rows (counts, every state represented, created days correct in several timezones); `instantOnDay` at UTC+14 and UTC−11; the proxy matcher (static files skipped, pages not); palette contrast.

**What you'll need to do** (collected for the one stop): add Hold's URLs to Supabase → Authentication → URL Configuration → Redirect URLs (`http://localhost:3000/auth/confirm` and the Vercel URL), so the email's button returns to Hold. The code works without this. Also note the shared email template says "Your Staple login code".

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
