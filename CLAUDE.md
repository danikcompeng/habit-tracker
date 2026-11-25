@AGENTS.md

# Ascend

A habit tracker you press like a physical key. Today shows each habit as a
big key: press and hold to complete it (a fill grows under your finger, a
small pop when done), tap a done key to undo. Each habit has a streak and a
7-day dot row. Mobile-first, installable to the home screen.

Live at https://ascend-dk.vercel.app (the old habit-tracker-ifaf.vercel.app
redirects there). The repo and the Vercel project are still called
`habit-tracker`. The app was first called **Hold**, so the gesture code
(`lib/hold.ts`), the `hold-auth` login cookie and the `hold_*` demo markers
keep that name on purpose: a new cookie name would log out every session
on the new address, and new marker names would make the shared demo
reseed. Home-screen installs made from the old address keep "Hold" and the
old icon: remove and add them again from the new address.

The full plan, every decision and why, and the review log live in
`plans/habit-tracker.md`. Read it before changing behaviour.

## Working rules

- **Every feature goes through the reviewers**: plan (in
  `plans/habit-tracker.md`) → `logic-checker` → build with tests →
  `code-reviewer` and `design-critic` in parallel (design-critic only when a
  screen changed; give it Playwright screenshots at 390×844 @3x, light and
  dark) → fix what's real → commit → log every finding and what was done
  under "Reviews". The agents are read-only (`.claude/agents/`), so pass
  them a diff file and screenshot paths.
- Data logic lives in `lib/` as pure functions with tests; components stay
  thin. Rules that decide *what happens* (the hold gesture, streaks, which
  day a check-in may be saved to) are pure state machines or functions.
- Never commit secrets. `.env.local` holds the four env vars below.
- The Supabase project, the login email template and the demo account are
  **shared with Staple** (`~/Documents/meal-cost-tracker`, read-only from
  here). Never touch Staple's tables; Ascend's demo markers are `hold_*`.

## Stack

Next.js 16.4 (App Router) · React 19.3 · TypeScript · Tailwind CSS 4 ·
Supabase (Postgres, auth) · Vercel · Vitest + PGlite · Playwright + axe.

This Next.js has breaking changes; check `node_modules/next/dist/docs/`.
Things this app relies on:
- `cacheComponents` and `partialPrefetching` are on. Anything reading
  cookies or `searchParams` sits inside `<Suspense>`; call `await io()`
  before reading the clock in render (`lib/server-helpers.ts`).
- `proxy.ts` (not middleware) refreshes the session and guards pages.
- Server actions call `refresh()` from `next/cache` to send fresh data back.
- Hidden routes stay alive (`<Activity>`): reset transient UI (editors,
  confirmations) in a `useLayoutEffect` cleanup.
- `error.tsx` gets `retry`, not `reset`.
- A `"use server"` file may only export async functions.

## Data rules

- Tables `habits` and `habit_checkins`. Migrations in
  `supabase/migrations/`, applied in name order by pasting each into the
  Supabase SQL editor (never edit one that's applied: add a new file):
  `20261123120000_habits.sql` (the schema), `20261123180000_history.sql`
  (`habit_history()`, and new check-ins up to 100 days back). The PGlite
  tests run them all. RLS: own rows only. Privileges are written
  revoke-then-grant, because Supabase's defaults grant everything.
- A check-in is a **calendar day in the user's timezone** (`date`), never a
  timestamp. "Today" comes from the `tz` cookie; without it, saves are
  refused (never guess UTC). The client sends the day it shows; the server
  accepts today, or yesterday within 10 minutes of midnight
  (`lib/checkin-day.ts`).
- Streaks are **derived** (`habit_streaks()` in SQL, `currentStreak` in
  `lib/streaks.ts`; tests check they agree), never stored.
- History reuses Today's day rules (`weekDots` states; counted days are
  done + missed, so "before" and today-still-open don't count). It reads one
  90-day window through `habit_history()` (one row per habit, under the
  1,000-row API limit) and switches 7 / 30 / 90 in the browser
  (`lib/history.ts`).
- Saves say done/not done (idempotent), never "toggle", and never throw.
- New habits go to the bottom (identity `position`); orders are saved as
  full id lists (`reorder_habits` refuses a stale list with `HR001`).
- No service-role key anywhere. The demo seeds itself as the demo user
  through `reseed_demo_habits()`.

## Design

Design direction (colours, type, spacing, motion) is in the plan. Use the
tokens: colour classes from `app/globals.css` (`bg-surface`,
`text-ink-muted`, `bg-accent`, `shadow-[…var(--accent-lip)]`…), never raw
colours; `lib/palette.ts` mirrors them and `lib/palette.test.ts` checks
contrast (4.5:1 text, 3:1 marks). Motion timings in `lib/motion.ts` and
`--motion-*`. Respect Reduce Motion (`motion-safe:`), 44 px tap targets,
Bricolage Grotesque only.

## Commands

```bash
npm run dev          # http://localhost:3000
npm test             # Vitest: unit + PGlite database tests
npm run test:e2e     # Playwright on the real demo account (one at a time)
npm run screens      # screenshots for the design-critic (see e2e/screens.e2e.ts)
npx tsc --noEmit && npx eslint
```

Env (`.env.local`, and Vercel): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DEMO_EMAIL`, `DEMO_PASSWORD`.
